import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import lockfile from 'proper-lockfile';
import type { BilibiliPlatform, Config, Receipt, SaveTarget, Video } from './types.js';
import { ReceiptStore } from './store.js';
import { BiliError, errorCode, publicError } from './errors.js';

export class BiliService {
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;
  constructor(readonly platform: BilibiliPlatform, readonly store: ReceiptStore, private getConfig: () => Config, private root: string, private verifyDelays = [0,500,1500]) {}
  exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(fn, fn);
    this.queue = result.catch(() => {});
    return result;
  }
  async status(online = false) {
    const config = this.getConfig();
    const base = { browser_mode: config.browser_mode, browser: config.browser, account_bound: Boolean(config.expected_uid), expected_uid: config.expected_uid ?? null, auto_save: config.auto_save, default_targets: config.default_targets, capabilities: ['search','metadata','timed_subtitles','frames','favorite_add','watch_later_add'], asr_available: false };
    if (!online) return { ...base, online_checked: false };
    const account = await this.platform.account();
    return { ...base, online_checked: true, account, account_matches: Boolean(account.uid && account.uid === config.expected_uid) };
  }
  private async assertAccount(config: Config): Promise<string> {
    if (!config.expected_uid) throw new BiliError('SETUP_REQUIRED', '请先在本地运行 setup，登录并绑定本人账号。');
    const account = await this.platform.account();
    if (!account.logged_in || !account.uid) throw new BiliError('LOGIN_REQUIRED', '浏览器会话尚未登录或已过期。请运行 setup 完成登录。');
    if (account.uid !== config.expected_uid) throw new BiliError('ACCOUNT_MISMATCH', '浏览器当前账号与本地绑定不一致，本次不执行保存。请本人运行 setup 重新绑定。');
    return account.uid;
  }
  async save(input: { videos: string[]; targets?: SaveTarget[]; preview?: boolean; retry_unconfirmed?: boolean }) {
    const config = this.getConfig();
    if (input.videos.length > config.max_save_batch) throw new BiliError('BATCH_LIMIT', `单次最多保存 ${config.max_save_batch} 个视频。`);
    const targets = [...new Map((input.targets ?? config.default_targets).map(target => [JSON.stringify(target),target])).values()];
    if (!targets.length) throw new BiliError('TARGET_REQUIRED', '请提供至少一个保存目标。');
    const uid = await this.assertAccount(config);
    fs.mkdirSync(this.root,{recursive:true,mode:0o700});
    const sentinel = path.join(this.root,'account-actions');
    fs.closeSync(fs.openSync(sentinel,'a',0o600));
    let release: () => Promise<void>;
    try { release = await lockfile.lock(sentinel,{retries:0,stale:120000,update:10000}); }
    catch { throw new BiliError('ACCOUNT_BUSY', '另一个会话正在执行保存。请等它完成后重试。'); }
    const receipts: Receipt[] = [];
    const errors: {video:string;error:ReturnType<typeof publicError>}[] = [];
    const planned: unknown[] = [];
    const seen = new Set<string>();
    const seenInputs = new Set<string>();
    try {
      for (const inputVideo of input.videos) {
        // Exact repeats need no extra resolution/network work. The bvid set
        // below also deduplicates different URLs for the same video.
        if (seenInputs.has(inputVideo.trim())) continue;
        seenInputs.add(inputVideo.trim());
        let video: Video;
        try { video = await this.platform.video(inputVideo); }
        catch (error) { errors.push({video:inputVideo,error:publicError(error)}); continue; }
        if (seen.has(video.bvid)) continue;
        seen.add(video.bvid);
        for (const target of targets) {
          try {
            await this.assertAccount(config);
            const present = await this.platform.contains(video,target,uid);
            if (input.preview) { planned.push({bvid:video.bvid,title:video.title,target,would_add:!present}); continue; }
            const previous = this.store.latest(uid,video.bvid,target);
            if (!present && previous && ['prepared','pending_verification'].includes(previous.status) && !input.retry_unconfirmed) {
              receipts.push(this.store.put({...previous,status:'pending_verification',updated_at:new Date().toISOString()}));
              continue;
            }
            const now = new Date().toISOString();
            let receipt: Receipt = { action_id:randomUUID(),account_uid:uid,bvid:video.bvid,title:video.title,target,status:present?'already_present':'prepared',created_at:now,updated_at:now };
            this.store.put(receipt);
            if (present) { receipts.push(receipt); continue; }
            let writeError: unknown;
            let accepted = false;
            try { await this.platform.add(video,target,uid); accepted = true; }
            catch (error) { writeError = error; }
            let verified = false;
            for (const delay of this.verifyDelays) {
              if (delay) await new Promise(resolve => setTimeout(resolve,delay));
              try {
                await this.assertAccount(config);
                if (await this.platform.contains(video,target,uid)) { verified = true; break; }
              } catch (error) {
                writeError ??= error;
                if (errorCode(error) === 'ACCOUNT_MISMATCH') break;
              }
            }
            const uncertain = accepted || !writeError || ['WRITE_UNCERTAIN','BROWSER_CONNECTION_FAILED','BROWSER_OPERATION_FAILED','BROWSER_PROTOCOL_ERROR','UNEXPECTED_ERROR'].includes(errorCode(writeError));
            receipt = { ...receipt,status:verified?'saved':uncertain?'pending_verification':'failed',updated_at:new Date().toISOString(),...(writeError ? {error_code:errorCode(writeError)} : {}) };
            this.store.put(receipt);
            receipts.push(receipt);
          } catch (error) { errors.push({video:video.bvid,error:publicError(error)}); }
        }
      }
      return { preview:Boolean(input.preview),...(input.preview?{planned}:{}),receipts,errors,all_verified:!input.preview && errors.length===0 && receipts.length>0 && receipts.every(r=>['saved','already_present'].includes(r.status)) };
    } finally { await release(); }
  }
  async verifyReceipt(id: string) {
    const receipt = this.store.get(id);
    if (!receipt) throw new BiliError('RECEIPT_NOT_FOUND','未找到该保存回执。');
    const config = this.getConfig();
    const uid = await this.assertAccount(config);
    if (uid !== receipt.account_uid) throw new BiliError('ACCOUNT_MISMATCH','回执不属于当前账号。');
    const video = await this.platform.video(receipt.bvid);
    const present = await this.platform.contains(video,receipt.target,uid);
    return this.store.put({...receipt,status:present?'saved':'pending_verification',updated_at:new Date().toISOString()});
  }
  receipts(limit: number) {
    const uid = this.getConfig().expected_uid;
    if (!uid) return [];
    // Filter before applying the visible limit: a newer account's history must
    // neither appear here nor hide this binding's older matching receipts.
    return this.store.recent(limit, uid);
  }
  async close() { if(this.closed)return;this.closed=true;await this.queue; await this.platform.close(); this.store.close(); }
}
