import type { Account, BilibiliPlatform, Cue, Folder, SaveTarget, Transcript, Video } from '../types.js';
import type { BrowserExecutor } from '../browser.js';
import { biliPageCode } from '../browser.js';
import { BiliError } from '../errors.js';
import { resolveVideo } from '../resolve.js';
import { signWbi } from './wbi.js';

interface Envelope<T> { code: number; data: T }
type Obj = Record<string, any>;
const API = 'https://api.bilibili.com';

export class BrowserBilibili implements BilibiliPlatform {
  constructor(readonly browser: BrowserExecutor) {}
  private async request<T>(path: string, params: Record<string, string | number> = {}, signed = false): Promise<T> {
    let query = new URLSearchParams(Object.entries(params).map(([k,v]) => [k,String(v)]));
    if (signed) {
      const nav = await this.raw<Obj>('/x/web-interface/nav', new URLSearchParams());
      const keys = nav.data?.wbi_img;
      const img = String(keys?.img_url || '').split('/').pop()?.split('.')[0] || '';
      const sub = String(keys?.sub_url || '').split('/').pop()?.split('.')[0] || '';
      query = signWbi(params, img, sub);
    }
    const result = await this.raw<T>(path, query);
    if (result.code !== 0) this.upstreamError(result.code);
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
    `));
    if (!result.ok) {
      if (result.http === 412 || result.http === 403) this.upstreamError(result.http);
      throw new BiliError('UPSTREAM_NETWORK', '未取得 B 站有效响应，请检查网络或网页验证提示。');
    }
    if (typeof result.value?.code !== 'number') throw new BiliError('UPSTREAM_FORMAT', 'B 站响应格式已变化。');
    return result.value;
  }
  async account(): Promise<Account> {
    const result = await this.raw<Obj>('/x/web-interface/nav', new URLSearchParams());
    if (result.code === -101 || result.data?.isLogin === false) return { logged_in: false };
    if (result.code !== 0) this.upstreamError(result.code);
    if (!result.data?.mid) throw new BiliError('UPSTREAM_FORMAT', 'B 站账号响应缺少 UID。');
    return { logged_in: true, uid: String(result.data.mid), name: String(result.data.uname || '') };
  }
  async search(keyword: string, page: number, limit: number) {
    const data = await this.request<Obj>('/x/web-interface/wbi/search/type', { search_type: 'video', keyword, page, order: 'totalrank' }, true);
    if (!Array.isArray(data.result)) throw new BiliError('UPSTREAM_FORMAT', 'B 站未返回实际搜索列表。');
    const clean = (value: unknown) => String(value ?? '').replace(/<[^>]*>/g,'').replace(/&(?:[a-z]+|#\d+);/gi,' ').trim();
    return { page, total: Number(data.numResults || 0), videos: data.result.slice(0,limit).filter((item: Obj) => /^BV[0-9A-Za-z]{10}$/.test(item.bvid)).map((item: Obj) => ({ platform: 'bilibili', bvid: item.bvid, title: clean(item.title), creator: clean(item.author), duration: String(item.duration || ''), description: clean(item.description).slice(0,600), url: `https://www.bilibili.com/video/${item.bvid}/` })), next_page: page < Number(data.numPages || 0) ? page + 1 : null };
  }
  async video(input: string, part?: number): Promise<Video> {
    const ref = await resolveVideo(input, part);
    const data = await this.request<Obj>('/x/web-interface/wbi/view', { bvid: ref.bvid }, true);
    if (!data.aid || !Array.isArray(data.pages)) throw new BiliError('UPSTREAM_FORMAT', 'B 站视频响应缺少分 P 信息。');
    const parts = data.pages.map((p: Obj) => ({ part: Number(p.page), cid: String(p.cid), title: String(p.part || ''), duration: Number(p.duration || 0) }));
    const selected = parts.find((p: Obj) => p.part === ref.part);
    if (!selected) throw new BiliError('INVALID_PART', `这个视频没有 P${ref.part}，已返回 ${parts.length} 个分 P。`);
    return { ...ref, aid: String(data.aid), cid: selected.cid, title: String(data.title || ''), description: String(data.desc || '').slice(0,5000), creator: String(data.owner?.name || ''), duration: selected.duration, parts };
  }
  async transcript(input: string, options: { part?: number; start?: number; end?: number; limit: number }): Promise<Transcript> {
    const video = await this.video(input, options.part);
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
    `));
    if (!response.ok || !Array.isArray(response.body) || !response.body.length) throw new BiliError('SUBTITLE_FETCH_FAILED', '未能读取字幕正文，不能据此声称已经看过视频。');
    const start = options.start ?? 0, end = options.end ?? video.duration;
    const all: Cue[] = response.body.map((c: Obj) => ({ start: Number(c.from), end: Number(c.to), text: String(c.content || ''), url: `${video.url}&t=${Number(c.from)}` })).filter(c => Number.isFinite(c.start) && Number.isFinite(c.end) && c.end >= start && c.start <= end);
    const cues = all.slice(0, options.limit);
    return { video, data_source: String(track.lan).startsWith('ai-') ? 'ai_subtitle' : 'subtitle', language: String(track.lan), cues, coverage: { part: video.part, requested_start_seconds: start, requested_end_seconds: end, start_seconds: cues.length ? Math.max(start,cues[0]!.start) : start, end_seconds: cues.length ? Math.min(end,cues[cues.length-1]!.end) : start, total_cues: all.length, returned_cues: cues.length, truncated: all.length > cues.length, ...(all.length > cues.length ? { next_start_seconds: all[cues.length]!.start } : {}), visuals_analyzed: false } };
  }
  async folders(): Promise<Folder[]> {
    const account = await this.account();
    if (!account.uid) throw new BiliError('LOGIN_REQUIRED', '请先登录 B 站。');
    return this.folderSnapshot(account.uid, '0');
  }
  private async folderSnapshot(uid: string, aid: string): Promise<(Folder & { selected?: boolean })[]> {
    const data = await this.request<Obj>('/x/v3/fav/folder/created/list-all', { up_mid: uid, type: 2, rid: aid });
    if (data.list === null || (data.count === 0 && !data.list)) return [];
    if (!Array.isArray(data.list)) throw new BiliError('UPSTREAM_FORMAT', 'B 站未返回收藏夹列表。');
    return data.list.map((item: Obj) => ({ id: String(item.id), title: String(item.title), count: Number(item.media_count || 0), ...(typeof item.fav_state === 'number' ? { selected: item.fav_state === 1 } : {}) }));
  }
  async contains(video: Video, target: SaveTarget, uid: string): Promise<boolean> {
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
          if (!response.ok) return {code:response.status};
          const data = await response.json();
          return {code: typeof data.code === 'number' ? data.code : -99003};
        } catch { return { code:-99004 }; }
      }, ${JSON.stringify({ endpoint, form, uid, folderId: target.kind === 'favorite' ? target.folder_id : null })});
    `));
    if (result.code === -99001) throw new BiliError('ACCOUNT_MISMATCH', '浏览器账号发生变化，未执行保存。请本人重新运行 setup 绑定。');
    if (result.code === -99002) throw new BiliError('FOLDER_NOT_OWNED', '目标收藏夹归属验证未通过，未执行保存。');
    if (result.code === -99004) throw new BiliError('WRITE_UNCERTAIN', '保存请求结果不确定，需要先回读状态。');
    if (result.code !== 0) this.upstreamError(result.code);
  }
  async frames(input: string, part?: number, requested?: number[]) {
    const video = await this.video(input,part);
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
  async close() { await this.browser.close(); }
}
