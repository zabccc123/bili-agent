import { BiliError } from './errors.js';
import type { VideoRef } from './types.js';

const BV = /^BV[0-9A-Za-z]{10}$/;
export function videoRef(input: string, part?: number): VideoRef {
  let bvid = input.trim();
  let selected = part;
  if (!BV.test(bvid)) {
    let url: URL;
    try { url = new URL(input); } catch { throw new BiliError('INVALID_VIDEO', '请输入 BV 号或 B 站视频链接。'); }
    if (url.protocol !== 'https:' || !['www.bilibili.com', 'bilibili.com', 'm.bilibili.com'].includes(url.hostname) || url.username || url.password || url.port) throw new BiliError('INVALID_VIDEO', '仅接受 HTTPS B 站视频链接。');
    const match = url.pathname.match(/^\/video\/(BV[0-9A-Za-z]{10})\/?$/);
    if (!match) throw new BiliError('INVALID_VIDEO', '链接中没有有效的 BV 号。');
    bvid = match[1]!;
    if (selected === undefined && url.searchParams.has('p')) selected = Number(url.searchParams.get('p'));
  }
  selected ??= 1;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > 10000) throw new BiliError('INVALID_PART', '分 P 必须为正整数。');
  return { platform: 'bilibili', bvid, part: selected, url: `https://www.bilibili.com/video/${bvid}/?p=${selected}` };
}
export async function resolveVideo(input: string, part?: number): Promise<VideoRef> {
  if (!/^https:\/\/(?:www\.)?b23\.tv\//i.test(input.trim())) return videoRef(input, part);
  let url = new URL(input);
  for (let hop = 0; hop < 5; hop++) {
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !['b23.tv', 'www.b23.tv', 'www.bilibili.com', 'bilibili.com', 'm.bilibili.com'].includes(url.hostname)) throw new BiliError('INVALID_VIDEO', '短链接跳转到了不支持的地址。');
    if (url.hostname.endsWith('bilibili.com')) return videoRef(url.href, part);
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location) throw new BiliError('SHORT_LINK_FAILED', '无法展开 B 站短链接。');
    url = new URL(location, url);
  }
  throw new BiliError('SHORT_LINK_FAILED', '短链接跳转次数过多。');
}
