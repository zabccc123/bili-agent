import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import type { Config } from './types.js';
import { BiliError } from './errors.js';

export interface BrowserExecutor { run<T>(code: string): Promise<T>; close(): Promise<void> }
export class PlaywrightBridge implements BrowserExecutor {
  private client?: Client;
  private transport?: StdioClientTransport;
  private connecting?: Promise<Client>;
  private runTool = 'browser_run_code';
  constructor(private config: Config, private root: string, private headless = false) {}

  private async connect(): Promise<Client> {
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
      const require = createRequire(import.meta.url);
      const cli = path.join(path.dirname(require.resolve('@playwright/mcp/package.json')), 'cli.js');
      const args = [cli, '--browser', this.config.browser, '--snapshot-mode', 'none', '--console-level', 'error', '--no-webmcp', '--output-dir', path.join(this.root, 'browser-output'), '--timeout-navigation', '30000'];
      if (this.config.browser_mode === 'extension') {
        args.push('--extension');
        if (this.config.profile_name) args.push('--profile-dir-name', this.config.profile_name);
      } else {
        args.push('--user-data-dir', path.join(this.root, 'browser-profile'));
        if (this.headless) args.push('--headless');
      }
      const env: Record<string, string> = {};
      for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'HOME', 'DISPLAY', 'PLAYWRIGHT_MCP_EXTENSION_TOKEN']) {
        if (process.env[key]) env[key] = process.env[key]!;
      }
      const transport = new StdioClientTransport({ command: process.execPath, args, env, cwd: this.root, stderr: 'pipe' });
      // Do not forward browser logs: they may include signed URLs or page content.
      transport.stderr?.on('data', () => {});
      const client = new Client({ name: 'bili-agent-browser', version: '0.1.0' });
      try {
        await client.connect(transport);
        const { tools } = await client.listTools();
        const runner = tools.find(tool => tool.name === 'browser_run_code') ?? tools.find(tool => tool.name === 'browser_run_code_unsafe');
        if (!runner) throw new Error('Missing browser code runner');
        this.runTool = runner.name;
      } catch {
        await transport.close().catch(() => {});
        throw new BiliError('BROWSER_START_FAILED', 'Playwright MCP 未启动。请运行 doctor，确认 Node 和浏览器安装正常。');
      }
      this.client = client;
      this.transport = transport;
      client.onclose = () => { this.client = undefined; this.transport = undefined; };
      return client;
    })();
    try { return await this.connecting; } finally { this.connecting = undefined; }
  }
  async run<T>(code: string): Promise<T> {
    const client = await this.connect();
    let response;
    try { response = await client.callTool({ name: this.runTool, arguments: { code } }, { timeout: 180000 }); }
    catch { throw new BiliError('BROWSER_CONNECTION_FAILED', '浏览器连接未完成或已断开。扩展模式请在浏览器中连接 B 站标签页；专用模式请关闭占用相同专用配置的另一个进程后重试。'); }
    const raw = response.content.filter(item => item.type === 'text').map(item => item.text).join('\n');
    if (response.isError) throw new BiliError('BROWSER_OPERATION_FAILED', '浏览器操作未完成。请检查登录、扩展连接或网络，然后重试。');
    const section = raw.match(/### Result\r?\n([\s\S]*?)(?=\r?\n### |$)/)?.[1]?.trim();
    try {
      const parsed = JSON.parse(section || raw);
      if (parsed && typeof parsed === 'object' && '__bili_agent' in parsed) return parsed.__bili_agent as T;
    } catch { /* Never return raw MCP output to the caller. */ }
    throw new BiliError('BROWSER_PROTOCOL_ERROR', '浏览器结果格式不匹配。请保留当前锁文件并运行 smoke 检查桥接兼容性。');
  }
  async close() {
    await this.client?.close().catch(() => {});
    await this.transport?.close().catch(() => {});
    this.client = undefined;
    this.transport = undefined;
  }
}

export function biliPageCode(body: string): string {
  return `async (page) => {
    const current = new URL(page.url() === 'about:blank' ? 'https://invalid.local' : page.url());
    if (current.protocol !== 'https:' || !['www.bilibili.com', 'bilibili.com'].includes(current.hostname)) {
      await page.goto('https://www.bilibili.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
    return { __bili_agent: await (async () => { ${body} })() };
  }`;
}
