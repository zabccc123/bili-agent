// Modified from BrowserMCP adapters/bilibili/_shared.js, Apache-2.0.
// Changes: standalone typed signer; keys and timestamp are injected for testing.
// Upstream: 847790e4e57b5d3de137829bf51e20c5fb357d73. See THIRD_PARTY_NOTICES.md.
import { createHash } from 'node:crypto';
import { BiliError } from '../errors.js';

const MIXIN = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
export function signWbi(params: Record<string, string | number>, img: string, sub: string, now = Math.floor(Date.now() / 1000)): URLSearchParams {
  if (!/^[0-9a-f]{32}$/i.test(img) || !/^[0-9a-f]{32}$/i.test(sub)) throw new BiliError('WBI_KEYS_MISSING', 'B 站未返回有效的读取签名信息。');
  const raw = img + sub;
  const key = MIXIN.map(index => raw[index]).join('').slice(0, 32);
  const all: Record<string, string | number> = { ...params, wts: now };
  const sorted = new URLSearchParams();
  for (const name of Object.keys(all).sort()) sorted.set(name, String(all[name]).replace(/[!'()*]/g, ''));
  const query = sorted.toString().replace(/\+/g, '%20');
  sorted.set('w_rid', createHash('md5').update(query + key).digest('hex'));
  return sorted;
}
