import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Config } from './types.js';
import { BiliError } from './errors.js';

export const targetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('watch_later') }).strict(),
  z.object({ kind: z.literal('favorite'), folder_id: z.string().regex(/^[1-9]\d*$/) }).strict(),
]);
export const configSchema = z.object({
  schema_version: z.literal(1),
  browser_mode: z.enum(['managed', 'extension']),
  browser: z.enum(['chrome', 'msedge']),
  profile_name: z.string().min(1).max(100).optional(),
  expected_uid: z.string().regex(/^[1-9]\d*$/).optional(),
  auto_save: z.boolean(),
  default_targets: z.array(targetSchema).min(1).max(6),
  max_save_batch: z.number().int().min(1).max(20),
}).strict();
export function dataDir(): string {
  return path.resolve(process.env.BILI_AGENT_DATA_DIR || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'BiliAgent'));
}
export function defaultConfig(): Config {
  return { schema_version: 1, browser_mode: 'managed', browser: process.platform === 'win32' ? 'msedge' : 'chrome', auto_save: true, default_targets: [{ kind: 'watch_later' }], max_save_batch: 10 };
}
export function configPath(root = dataDir()) { return path.join(root, 'config.json'); }
export function readConfig(root = dataDir()): Config {
  const file = configPath(root);
  if (!fs.existsSync(file)) return defaultConfig();
  try { return configSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8'))); }
  catch { throw new BiliError('CONFIG_INVALID', '本地配置格式不正确；请在本地修复 config.json，或重新运行 setup。'); }
}
export function writeConfig(config: Config, root = dataDir()): void {
  const parsed = configSchema.parse(config);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const temporary = path.join(root, `config-${randomUUID()}.tmp`);
  fs.writeFileSync(temporary, JSON.stringify(parsed, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temporary, configPath(root));
}
