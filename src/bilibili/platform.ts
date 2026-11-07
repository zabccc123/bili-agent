import type { Account, BilibiliPlatform, Cue, Folder, SaveTarget, Transcript, Video } from '../types.js';
import type { BrowserExecutor } from '../browser.js';
import { biliPageCode } from '../browser.js';
import { BiliError } from '../errors.js';
import { resolveVideo } from '../resolve.js';
import { signWbi } from './wbi.js';
import { createHash } from 'node:crypto';

interface Envelope<T> { code: number; data: T }
type Obj = Record<string, any>;
const API = 'https://api.bilibili.com';

export interface PlatformOptions { now?: () => number; onStage?: (stage: string) => void }
interface VideoDetails { aid: string; title: string; description: string; creator: string; parts: Video['parts'] }
interface SubtitleBody { language: string; data_source: Transcript['data_source']; cues: Omit<Cue, 'url'>[]; revision: string }
interface SubtitleCursor { v: 1; bvid: string; cid: string; part: number; language: string; start: number; end: number; offset: number; revision: string }

/** In-memory, bounded LRU data. Account/ownership/membership checks never use it. */
class ReadCache<T> {
  private entries = new Map<string, { value: T; expires: number }>();
  constructor(private ttl: number, private capacity: number, private now: () => number) {}
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    if (entry.expires <= this.now()) return undefined;
    this.entries.set(key, entry);
    return entry.value;
  }
  set(key: string, value: T) {
    this.entries.delete(key);
    this.entries.set(key, { value, expires: this.now() + this.ttl });
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!);
  }
  clear() { this.entries.clear(); }
}

export class BrowserBilibili implements BilibiliPlatform {
  private now: () => number;
  private onStage?: (stage: string) => void;
  private videoCache: ReadCache<VideoDetails>;
  private subtitleCache: ReadCache<SubtitleBody>;
  private keys?: { img: string; sub: string; expires: number };
  private identity?: string;
  constructor(readonly browser: BrowserExecutor, options: PlatformOptions | (() => number) = {}) {
    const settings = typeof options === 'function' ? { now: options } : options;
    this.now = settings.now ?? Date.now;
    this.onStage = settings.onStage;
    this.videoCache = new ReadCache(2 * 60_000, 64, this.now);
    this.subtitleCache = new ReadCache(5 * 60_000, 12, this.now);
  }
  private stage(value: string) { try { this.onStage?.(value); } catch { /* Observability must not interrupt an action. */ } }
  private rememberNav(data: Obj) {
    const img = String(data?.wbi_img?.img_url || '').split('/').pop()?.split('.')[0] || '';
    const sub = String(data?.wbi_img?.sub_url || '').split('/').pop()?.split('.')[0] || '';
    if (/^[0-9a-f]{32}$/i.test(img) && /^[0-9a-f]{32}$/i.test(sub)) this.keys = { img, sub, expires: this.now() + 30 * 60_000 };
    if (typeof data?.isLogin === 'boolean') {
      const identity = data.isLogin && data.mid ? String(data.mid) : 'guest';
      if (this.identity !== undefined && this.identity !== identity) this.subtitleCache.clear();
      this.identity = identity;
    }
  }
  private async signingKeys() {
    if (this.keys && this.keys.expires > this.now()) return this.keys;
    this.stage('loading_signing_keys');
    const nav = await this.raw<Obj>('/x/web-interface/nav', new URLSearchParams());
    if (nav.code !== 0 && nav.code !== -101) this.upstreamError(nav.code);
    this.rememberNav(nav.data);
    if (!this.keys || this.keys.expires <= this.now()) throw new BiliError('WBI_KEYS_MISSING', 'B 站未返回有效的读取签名信息。');
    return this.keys;
  }
  private async request<T>(path: string, params: Record<string, string | number> = {}, signed = false): Promise<T> {
    let query = new URLSearchParams(Object.entries(params).map(([k,v]) => [k,String(v)]));
    if (signed) {
      const keys = await this.signingKeys();
      query = signWbi(params, keys.img, keys.sub);
    }
    const result = await this.raw<T>(path, query);
    if (result.code !== 0) {
      // A rejected signature is refreshed on the next read; do not blindly
      // repeat requests that may instead be denied by access/risk controls.
      if (signed && [-403, 403, -352, -412, 412].includes(result.code)) this.keys = undefined;
      this.upstreamError(result.code);
    }
    return result.data;
  }
  private upstreamError(code: number): never {
    if (code === -101 || code === -111) throw new BiliError('LOGIN_REQUIRED', '请在所选浏览器会话中登录 B 站，然后重新运行 setup 绑定账号。');
    if ([-352,-412,412].includes(code)) throw new BiliError('RISK_CONTROL', 'B 站要求验证或限制了本次访问。请在网页中处理后重试。');
    if ([-403,403].includes(code)) throw new BiliError('ACCESS_DENIED', '当前会话无法访问此内容。请在网页检查账号权限或验证提示。');
    throw new BiliError(`BILIBILI_${code}`, `B 站未完成请求（状态码 ${code}）。`);
  }
  private async raw<T>(path: string, query: URLSearchParams): Promise<Envelope<T>> {
    const url = `${API}${path}${query.size ? '?' + query.toString().replace(/\+/g,'%20') : ''}`;
    const result = await this.browser.run<{ ok: boolean; http?: number; value?: Envelope<T> }>(biliPageCode(`
      return await page.evaluate(async (url) => {
        try {
          const response = await fetch(url, { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(20000) });
          if (!response.ok) return { ok: false, http: response.status };
          const text = await response.text();
          if (text.length > 6000000) return { ok: false, http: 413 };
          return { ok: true, value: JSON.parse(text) };
        } catch { return { ok: false }; }
      }, ${JSON.stringify(url)});
    `), { settle: 'none' });
    if (!result.ok) {
      if (result.http === 412 || result.http === 403) this.upstreamError(result.http);
      throw new BiliError('UPSTREAM_NETWORK', '未取得 B 站有效响应，请检查网络或网页验证提示。');
    }
    if (typeof result.value?.code !== 'number') throw new BiliError('UPSTREAM_FORMAT', 'B 站响应格式已变化。');
    return result.value;
  }
  async account(): Promise<Account> {
    this.stage('checking_account');
    const result = await this.raw<Obj>('/x/web-interface/nav', new URLSearchParams());
    if (result.code === 0 || result.code === -101) this.rememberNav(result.data);
    if (result.code === -101 || result.data?.isLogin === false) return { logged_in: false };
    if (result.code !== 0) this.upstreamError(result.code);
    if (!result.data?.mid) throw new BiliError('UPSTREAM_FORMAT', 'B 站账号响应缺少 UID。');
    return { logged_in: true, uid: String(result.data.mid), name: String(result.data.uname || '') };
  }
  async search(keyword: string, page: number, limit: number) {
    this.stage('searching');
    const data = await this.request<Obj>('/x/web-interface/wbi/search/type', { search_type: 'video', keyword, page, order: 'totalrank' }, true);
    if (!Array.isArray(data.result)) throw new BiliError('UPSTREAM_FORMAT', 'B 站未返回实际搜索列表。');
    const clean = (value: unknown) => String(value ?? '').replace(/<[^>]*>/g,'').replace(/&(?:[a-z]+|#\d+);/gi,' ').trim();
    return { page, total: Number(data.numResults || 0), videos: data.result.slice(0,limit).filter((item: Obj) => /^BV[0-9A-Za-z]{10}$/.test(item.bvid)).map((item: Obj) => ({ platform: 'bilibili', bvid: item.bvid, title: clean(item.title), creator: clean(item.author), duration: String(item.duration || ''), description: clean(item.description).slice(0,600), url: `https://www.bilibili.com/video/${item.bvid}/` })), next_page: page < Number(data.numPages || 0) ? page + 1 : null };
  }
  async video(input: string, part?: number): Promise<Video> {
    const ref = await resolveVideo(input, part);
    let details = this.videoCache.get(ref.bvid);
    if (details) this.stage('video_cache_hit');
    else {
      this.stage('loading_video');
      const data = await this.request<Obj>('/x/web-interface/wbi/view', { bvid: ref.bvid }, true);
      if (!data.aid || !Array.isArray(data.pages)) throw new BiliError('UPSTREAM_FORMAT', 'B 站视频响应缺少分 P 信息。');
      const parts = data.pages.map((p: Obj) => ({ part: Number(p.page), cid: String(p.cid), title: String(p.part || ''), duration: Number(p.duration || 0) }));
      details = { aid: String(data.aid), title: String(data.title || ''), description: String(data.desc || '').slice(0,5000), creator: String(data.owner?.name || ''), parts };
      this.videoCache.set(ref.bvid, details);
    }
    const selected = details.parts.find(p => p.part === ref.part);
    if (!selected) throw new BiliError('INVALID_PART', `这个视频没有 P${ref.part}，已返回 ${details.parts.length} 个分 P。`);
    return { ...ref, ...details, cid: selected.cid, duration: selected.duration, parts: details.parts.map(p => ({ ...p })) };
  }
  private cursor(input?: string): SubtitleCursor | undefined {
    if (input === undefined) return undefined;
    try {
      if (input.length > 2048 || !/^[\w-]+$/.test(input)) throw new Error();
      const value = JSON.parse(Buffer.from(input, 'base64url').toString('utf8')) as SubtitleCursor;
      if (value.v !== 1 || typeof value.bvid !== 'string' || typeof value.cid !== 'string' || typeof value.language !== 'string' || typeof value.revision !== 'string' || !Number.isSafeInteger(value.part) || !Number.isSafeInteger(value.offset) || value.offset < 0 || !Number.isFinite(value.start) || !Number.isFinite(value.end) || value.start < 0 || value.end < value.start) throw new Error();
      return value;
    } catch { throw new BiliError('INVALID_CURSOR', '字幕继续阅读游标无效，请从原视频和时间范围重新读取。'); }
  }
  async transcript(input: string, options: { part?: number; start?: number; end?: number; limit: number; cursor?: string }): Promise<Transcript> {
    const cursor = this.cursor(options.cursor);
    // A cached subtitle must never cross a browser account change or bypass an
    // expired session. This fresh identity check is intentionally not cached.
    this.stage('checking_subtitle_access');
    const account = await this.account();
    const video = await this.video(input, options.part);
    const cacheKey = JSON.stringify([account.uid ?? 'guest', video.bvid, video.cid]);
    let body = this.subtitleCache.get(cacheKey);
    if (body) this.stage('transcript_cache_hit');
    else {
      this.stage('loading_transcript');
      const data = await this.request<Obj>('/x/player/wbi/v2', { bvid: video.bvid, cid: video.cid }, true);
      const tracks = data.subtitle?.subtitles;
      if (!Array.isArray(tracks)) throw new BiliError('UPSTREAM_FORMAT', 'B 站未返回字幕轨道信息。');
      if (tracks.length === 0) throw new BiliError(data.need_login_subtitle ? 'LOGIN_REQUIRED' : 'SUBTITLE_UNAVAILABLE', data.need_login_subtitle ? '此视频字幕需要登录。' : '这个分 P 没有可用字幕。可改用画面采样；本版尚未启用本地语音转录。');
      const track = tracks.find((t: Obj) => ['zh-CN','zh-Hans','zh'].includes(t.lan)) || tracks.find((t: Obj) => !String(t.lan).startsWith('ai-')) || tracks[0];
      let url: URL;
      try { url = new URL(String(track.subtitle_url).replace(/^\/\//,'https://')); }
      catch { throw new BiliError('SUBTITLE_UNAVAILABLE', '字幕地址为空或已失效。'); }
      if (url.protocol !== 'https:' || !url.hostname.endsWith('.hdslb.com') || !/^\/bfs\/(?:ai_)?subtitle\//.test(url.pathname) || url.username || url.password || url.port) throw new BiliError('SUBTITLE_SOURCE_INVALID', '字幕来源不属于支持的 B 站字幕地址。');
      const response = await this.browser.run<{ ok: boolean; body?: Obj[] }>(biliPageCode(`
      return await page.evaluate(async (url) => {
        try {
          const response = await fetch(url, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(20000) });
          if (!response.ok) return { ok: false };
          const text = await response.text();
          if (text.length > 4000000) return { ok: false };
          const doc = JSON.parse(text);
          return { ok: true, body: doc.body };
        } catch { return { ok: false }; }
      }, ${JSON.stringify(url.href)});
      `), { settle: 'none' });
      if (!response.ok || !Array.isArray(response.body) || !response.body.length) throw new BiliError('SUBTITLE_FETCH_FAILED', '未能读取字幕正文，不能据此声称已经看过视频。');
      const cues = response.body.map((c: Obj) => ({ start: Number(c.from), end: Number(c.to), text: String(c.content || '') })).filter(c => Number.isFinite(c.start) && Number.isFinite(c.end) && c.start >= 0 && c.end > c.start);
      if (!cues.length) throw new BiliError('SUBTITLE_FETCH_FAILED', '字幕没有有效时间片段，不能据此声称已经看过视频。');
      const language = String(track.lan);
      body = { language, data_source: language.startsWith('ai-') ? 'ai_subtitle' : 'subtitle', cues, revision: createHash('sha256').update(JSON.stringify([language, cues])).digest('hex').slice(0,24) };
      this.subtitleCache.set(cacheKey, body);
    }
    const start = options.start ?? cursor?.start ?? 0, end = options.end ?? cursor?.end ?? video.duration;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || !Number.isSafeInteger(options.limit) || options.limit < 1) throw new BiliError('INVALID_TIME', '字幕时间范围或返回条数无效。');
    if (cursor && (cursor.bvid !== video.bvid || cursor.cid !== video.cid || cursor.part !== video.part || cursor.language !== body.language || cursor.start !== start || cursor.end !== end || cursor.revision !== body.revision)) throw new BiliError('CURSOR_EXPIRED', '字幕内容、分 P 或时间范围发生变化，请从原时间范围重新读取。');
    const all = body.cues.filter(c => c.end > start && c.start < end);
    const offset = cursor?.offset ?? 0;
    if (offset > all.length) throw new BiliError('INVALID_CURSOR', '字幕继续阅读游标超出了当前内容范围。');
    const cues: Cue[] = all.slice(offset, offset + options.limit).map(c => ({ ...c, url: `${video.url}&t=${c.start}` }));
    const next = offset + cues.length, truncated = next < all.length;
    const nextCursor: SubtitleCursor = { v: 1, bvid: video.bvid, cid: video.cid, part: video.part, language: body.language, start, end, offset: next, revision: body.revision };
    return { video, data_source: body.data_source, language: body.language, cues, coverage: { part: video.part, requested_start_seconds: start, requested_end_seconds: end, start_seconds: cues.length ? Math.max(start,Math.min(...cues.map(c=>c.start))) : start, end_seconds: cues.length ? Math.min(end,Math.max(...cues.map(c=>c.end))) : start, total_cues: all.length, returned_cues: cues.length, truncated, ...(truncated ? { next_start_seconds: all[next]!.start, next_cursor: Buffer.from(JSON.stringify(nextCursor)).toString('base64url') } : {}), visuals_analyzed: false } };
  }
  async folders(): Promise<Folder[]> {
    const account = await this.account();
    if (!account.uid) throw new BiliError('LOGIN_REQUIRED', '请先登录 B 站。');
    return this.folderSnapshot(account.uid, '0');
  }
  private async folderSnapshot(uid: string, aid: string): Promise<(Folder & { selected?: boolean })[]> {
    this.stage('verifying_folder');
    const data = await this.request<Obj>('/x/v3/fav/folder/created/list-all', { up_mid: uid, type: 2, rid: aid });
    if (data.list === null || (data.count === 0 && !data.list)) return [];
    if (!Array.isArray(data.list)) throw new BiliError('UPSTREAM_FORMAT', 'B 站未返回收藏夹列表。');
    return data.list.map((item: Obj) => ({ id: String(item.id), title: String(item.title), count: Number(item.media_count || 0), ...(typeof item.fav_state === 'number' ? { selected: item.fav_state === 1 } : {}) }));
  }
  async contains(video: Video, target: SaveTarget, uid: string): Promise<boolean> {
    this.stage('checking_membership');
    if (target.kind === 'watch_later') {
      const data = await this.request<Obj>('/x/v2/history/toview', {});
      if (!Array.isArray(data.list)) throw new BiliError('UPSTREAM_FORMAT', 'B 站未返回稍后再看列表。');
      return data.list.some((item: Obj) => String(item.aid) === video.aid || item.bvid === video.bvid);
    }
    const folders = await this.folderSnapshot(uid, video.aid);
    const folder = folders.find(item => item.id === target.folder_id);
    if (!folder) throw new BiliError('FOLDER_NOT_OWNED', '目标收藏夹不属于当前绑定账号，或已不可用。');
    if (folder.selected !== undefined) return folder.selected;
    // Older responses omit fav_state. Inspect every actual folder page, never a fuzzy keyword match.
    for (let page = 1; page <= 1000; page++) {
      const data = await this.request<Obj>('/x/v3/fav/resource/list', { media_id: target.folder_id, pn: page, ps: 40, order: 'mtime', platform: 'web' });
      if (!Array.isArray(data.medias) && !(data.medias === null && !data.has_more)) throw new BiliError('UPSTREAM_FORMAT', '收藏夹成员响应格式已变化。');
      if ((data.medias || []).some((item: Obj) => String(item.id) === video.aid || item.bvid === video.bvid)) return true;
      if (!data.has_more) return false;
    }
    throw new BiliError('VERIFICATION_LIMIT', '收藏夹过大，本次未完成成员状态核验。');
  }
  async add(video: Video, target: SaveTarget, uid: string): Promise<void> {
    this.stage('saving');
    const endpoint = target.kind === 'watch_later' ? '/x/v2/history/toview/add' : '/x/v3/fav/resource/deal';
    const form = target.kind === 'watch_later' ? { aid: video.aid } : { rid: video.aid, type: '2', add_media_ids: target.folder_id, platform: 'web' };
    const result = await this.browser.run<{ code: number }>(biliPageCode(`
      return await page.evaluate(async ({ endpoint, form, uid, folderId }) => {
        try {
          const nav = await fetch('https://api.bilibili.com/x/web-interface/nav', { credentials:'include', cache:'no-store', signal:AbortSignal.timeout(15000) }).then(r=>r.json());
          if (nav.code !== 0 || !nav.data?.isLogin) return { code: -101 };
          if (String(nav.data.mid) !== uid) return { code: -99001 };
          if (folderId) {
            const q = new URLSearchParams({up_mid:uid,type:'2',rid:'0'});
            const owned = await fetch('https://api.bilibili.com/x/v3/fav/folder/created/list-all?'+q, {credentials:'include',cache:'no-store',signal:AbortSignal.timeout(15000)}).then(r=>r.json());
            if (owned.code !== 0 || !owned.data?.list?.some(f=>String(f.id)===folderId)) return {code:-99002};
          }
          const csrf = document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('bili_jct='))?.slice(9);
          if (!csrf) return { code:-111 };
          const body = new URLSearchParams(form);
          body.set('csrf',decodeURIComponent(csrf));
          const response = await fetch('https://api.bilibili.com'+endpoint, {method:'POST',credentials:'include',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body.toString(),signal:AbortSignal.timeout(20000)});
          if (!response.ok) return {code:response.status>=500?-99004:response.status};
          const data = await response.json();
          return {code: typeof data.code === 'number' ? data.code : -99004};
        } catch { return { code:-99004 }; }
      }, ${JSON.stringify({ endpoint, form, uid, folderId: target.kind === 'favorite' ? target.folder_id : null })});
    `), { settle: 'none' });
    if (result.code === -99001) throw new BiliError('ACCOUNT_MISMATCH', '浏览器账号发生变化，未执行保存。请本人重新运行 setup 绑定。');
    if (result.code === -99002) throw new BiliError('FOLDER_NOT_OWNED', '目标收藏夹归属验证未通过，未执行保存。');
    if (result.code === -99004) throw new BiliError('WRITE_UNCERTAIN', '保存请求结果不确定，需要先回读状态。');
    if (result.code !== 0) this.upstreamError(result.code);
  }
  async frames(input: string, part?: number, requested?: number[]) {
    const video = await this.video(input,part);
    this.stage('sampling_frames');
    const times = requested ?? [0.1,0.5,0.9].map(f=>Math.max(0,Math.floor(video.duration*f)));
    if (times.some(t=>t<0 || t>video.duration)) throw new BiliError('INVALID_TIME','画面采样时间超出了当前分 P 的范围。');
    const result = await this.browser.run<{ frames: {time_seconds:number;data:string;mimeType:'image/jpeg'}[]; failures: {time_seconds:number;code:string}[] }>(`async (page) => {
      await page.goto(${JSON.stringify(video.url)}, {waitUntil:'domcontentloaded',timeout:30000});
      const player = page.locator('video').first();
      await player.waitFor({state:'visible',timeout:20000});
      const before = await player.evaluate(v=>({time:v.currentTime,paused:v.paused,muted:v.muted}));
      const frames=[],failures=[];
      try {
        for (const time of ${JSON.stringify(times)}) {
          try {
            const actual = await player.evaluate(async (v,time)=> {
              v.muted=true; v.pause();
              await new Promise((resolve,reject)=> {
                let timer;
                const done=()=>{clearTimeout(timer);v.removeEventListener('seeked',onseek);v.removeEventListener('loadeddata',ready);};
                const ready=()=>{if(v.readyState>=2&&Math.abs(v.currentTime-time)<1){done();resolve();}};
                const onseek=()=>{if(v.readyState>=2){done();resolve();}};
                timer=setTimeout(()=>{done();reject(new Error('seek timeout'));},15000);
                v.addEventListener('seeked',onseek);v.addEventListener('loadeddata',ready);
                v.currentTime=time;ready();
              });
              return v.currentTime;
            },time);
            await page.waitForTimeout(250);
            const image=await player.screenshot({type:'jpeg',quality:65,timeout:5000});
            if(image.length>1500000) throw new Error('frame too large');
            frames.push({time_seconds:actual,data:image.toString('base64'),mimeType:'image/jpeg'});
          } catch {failures.push({time_seconds:time,code:'FRAME_UNAVAILABLE'});}
        }
      } finally {
        await player.evaluate((v,before)=>{v.currentTime=before.time;v.muted=before.muted;if(!before.paused)v.play().catch(()=>{});},before).catch(()=>{});
      }
      return {__bili_agent:{frames,failures}};
    }`);
    if (result.frames.length===0) throw new BiliError('FRAMES_UNAVAILABLE','播放器未提供可用画面；请在网页检查播放权限或加载状态。');
    return {video,...result};
  }
  async close() { this.videoCache.clear(); this.subtitleCache.clear(); this.keys = undefined; await this.browser.close(); }
}
