import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { BiliService } from './service.js';
import type { BrowserExecutor } from './browser.js';
import { ActivityLog } from './activity.js';
import { BiliError, publicError } from './errors.js';
import { targetSchema, readConfig } from './config.js';
import { VERSION } from './version.js';
import { dashboardHtml, dashboardCss, dashboardCheckboxCss, dashboardJs } from './dashboard-page.js';
import { connectAccount } from './connection.js';

export interface DashboardEndpoint { origin: string; token: string; pid: number; version: string }
export interface DashboardOptions { service: BiliService; activity: ActivityLog; browser: BrowserExecutor; root: string; demo?: boolean }
const video = z.string().min(1).max(2048);
const part = z.number().int().min(1).max(10000).optional();
const targets = z.array(targetSchema).min(1).max(6).optional();
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('check'), args: z.object({}).strict() }).strict(),
  z.object({ action: z.literal('connect'), args: z.object({}).strict() }).strict(),
  z.object({ action: z.literal('open_browser'), args: z.object({}).strict() }).strict(),
  z.object({ action: z.literal('search'), args: z.object({ keyword: z.string().trim().min(1).max(200), page: z.number().int().min(1).max(50).default(1), limit: z.number().int().min(1).max(20).default(5) }).strict() }).strict(),
  z.object({ action: z.literal('read'), args: z.object({ video, part, cursor: z.string().max(2048).optional(), limit: z.number().int().min(1).max(500).default(200) }).strict() }).strict(),
  z.object({ action: z.literal('frames'), args: z.object({ video, part, times: z.array(z.number().min(0)).min(1).max(6).optional() }).strict() }).strict(),
  z.object({ action: z.literal('folders'), args: z.object({}).strict() }).strict(),
  z.object({ action: z.enum(['preview', 'save']), args: z.object({ videos: z.array(video).min(1).max(20), targets }).strict() }).strict(),
  z.object({ action: z.literal('verify'), args: z.object({ action_id: z.string().uuid() }).strict() }).strict(),
]);

export async function startDashboard(options: DashboardOptions) {
  const { service, browser, activity, root } = options;
  const token = randomBytes(32).toString('hex');
  let origin = '';
  let pending = 0;
  const server = http.createServer(async (request, response) => {
    const send = (status: number, data: unknown) => {
      if (!response.writableEnded) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(data)); }
    };
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      if (request.headers.host !== new URL(origin).host || (request.headers.origin && request.headers.origin !== origin)) { send(403, { ok: false, error: { code: 'LOCAL_ORIGIN_REQUIRED', message: '请从本机控制台地址访问。' } }); return; }
      const route = new URL(request.url ?? '/', origin).pathname;
      if (request.method === 'GET' && ['/', '/app.js', '/style.css'].includes(route)) {
        const content = route === '/' ? dashboardHtml : route === '/app.js' ? dashboardJs : dashboardCss + dashboardCheckboxCss;
        response.writeHead(200, { 'Content-Type': route === '/' ? 'text/html; charset=utf-8' : route === '/app.js' ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8' }); response.end(content); return;
      }
      const supplied = Buffer.from(request.headers.authorization ?? '');
      const expected = Buffer.from('Bearer ' + token);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { send(401, { ok: false, error: { code: 'DASHBOARD_AUTH_REQUIRED', message: '控制台连接已失效。请重新获取控制台地址。' } }); return; }
      if (request.method === 'GET' && route === '/api/health') { send(200, { ok: true, version: VERSION }); return; }
      if (request.method === 'GET' && route === '/api/status') {
        const status = await service.status(false);
        send(200, { ok: true, data: { version: VERSION, demo: Boolean(options.demo), browser_mode: status.browser_mode, browser: status.browser, account_bound: status.account_bound, auto_save: status.auto_save, default_targets: status.default_targets, max_save_batch: readConfig(root).max_save_batch, online_checked: false, task_history: 'process_local' } }); return;
      }
      if (request.method === 'GET' && route === '/api/tasks') { send(200, { ok: true, data: activity.recent() }); return; }
      if (request.method === 'GET' && route === '/api/receipts') {
        // Account-bound receipts only: a new setup must never reveal another binding's history.
        const status = await service.status(false);
        const receipts = service.receipts(100).filter(receipt => receipt.account_uid === status.expected_uid);
        send(200, { ok: true, data: receipts.map(({ account_uid: _uid, ...receipt }) => receipt) }); return;
      }
      if (request.method !== 'POST' || route !== '/api/action') { send(404, { ok: false, error: { code: 'NOT_FOUND', message: '没有这个操作。' } }); return; }
      if (!request.headers['content-type']?.startsWith('application/json')) { send(415, { ok: false, error: { code: 'JSON_REQUIRED', message: '请使用 JSON 请求。' } }); return; }
      if (pending >= 16) { send(429, { ok: false, error: { code: 'QUEUE_FULL', message: '任务较多，请等当前操作结束后再试。' } }); return; }
      // Decode after joining: an HTTP chunk may split a multi-byte Chinese character.
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > 32768) { send(413, { ok: false, error: { code: 'REQUEST_TOO_LARGE', message: '单次最多处理 20 个视频。' } }); return; }
        chunks.push(bytes);
      }
      const body = Buffer.concat(chunks).toString('utf8');
      let input: z.infer<typeof actionSchema>;
      try { input = actionSchema.parse(JSON.parse(body)); }
      catch { send(400, { ok: false, error: { code: 'INVALID_INPUT', message: '参数不正确。请检查视频链接、分 P 和数量。' } }); return; }
      if (pending >= 16) { send(429, { ok: false, error: { code: 'QUEUE_FULL', message: '任务较多，请等当前操作结束后再试。' } }); return; }
      pending++;
      try {
        const data = await activity.run(service, input.action, async () => {
          switch (input.action) {
            case 'connect':
              activity.stage('opening_browser');
              return connectAccount(root, browser, service.platform);
            case 'check': {
              const status = await service.status(true);
              if (!('account' in status)) throw new BiliError('STATUS_UNAVAILABLE', '尚未完成在线核验。');
              return { online_checked: true, logged_in: status.account.logged_in, account_matches: status.account_matches, account_bound: status.account_bound, name: status.account.name ?? null };
            }
            case 'open_browser':
              activity.stage('opening_browser');
              return browser.run(`async(page)=>{await page.goto('https://www.bilibili.com/',{waitUntil:'domcontentloaded',timeout:30000});return {__bili_agent:{opened:true}};}`);
            case 'search': return service.platform.search(input.args.keyword, input.args.page, input.args.limit);
            case 'read': return service.platform.transcript(input.args.video, { part: input.args.part, cursor: input.args.cursor, limit: input.args.limit });
            case 'frames': {
              if (!service.platform.frames) throw new BiliError('CAPABILITY_UNAVAILABLE', '当前驱动不支持画面采样。');
              return service.platform.frames(input.args.video, input.args.part, input.args.times);
            }
            case 'folders': return service.platform.folders();
            case 'preview': case 'save': return service.save({ ...input.args, preview: input.action === 'preview' });
            case 'verify': return service.verifyReceipt(input.args.action_id);
          }
        });
        send(200, { ok: true, data });
      } catch (error) { send(400, { ok: false, error: publicError(error) }); }
      finally { pending--; }
    } catch { send(500, { ok: false, error: { code: 'DASHBOARD_ERROR', message: '本地控制台未完成请求。请刷新后查看任务与回执；不要直接重发保存。' } }); }
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Dashboard did not bind a loopback port');
  origin = `http://127.0.0.1:${address.port}`;
  const endpoint: DashboardEndpoint = { origin, token, pid: process.pid, version: VERSION };
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const endpointFile = path.join(root, 'dashboard.json');
  fs.writeFileSync(endpointFile, JSON.stringify(endpoint), { mode: 0o600 });
  return {
    url: `${origin}/#${token}`,
    origin,
    token,
    close: async () => {
      try { const saved = JSON.parse(fs.readFileSync(endpointFile, 'utf8')); if (saved.token === token) fs.unlinkSync(endpointFile); } catch { /* Another server may now own the registry. */ }
      await new Promise<void>(resolve => { server.close(() => resolve()); server.closeIdleConnections(); });
    },
  };
}

export async function existingDashboard(root: string): Promise<string | undefined> {
  try {
    const saved: unknown = JSON.parse(fs.readFileSync(path.join(root, 'dashboard.json'), 'utf8'));
    const endpoint = z.object({ origin: z.string().regex(/^http:\/\/127\.0\.0\.1:\d{1,5}$/), token: z.string().regex(/^[a-f0-9]{64}$/) }).passthrough().parse(saved);
    const response = await fetch(endpoint.origin + '/api/health', { headers: { Authorization: 'Bearer ' + endpoint.token }, signal: AbortSignal.timeout(1500), redirect: 'error' });
    const data = await response.json() as { ok?: boolean };
    return response.ok && data.ok ? `${endpoint.origin}/#${endpoint.token}` : undefined;
  } catch { return undefined; }
}
