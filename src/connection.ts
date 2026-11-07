import type { BrowserExecutor } from './browser.js';
import type { Account, BilibiliPlatform, Config } from './types.js';
import { readConfig, writeConfig } from './config.js';
import { BiliError } from './errors.js';

export interface ConnectionResult {
  login_pending: boolean;
  account_bound: boolean;
  logged_in: boolean;
  account_matches: boolean;
  name?: string;
}

function pending(config: Config): ConnectionResult {
  return { login_pending: true, account_bound: Boolean(config.expected_uid), logged_in: false, account_matches: false };
}

function matched(account: Account): ConnectionResult {
  return { login_pending: false, account_bound: true, logged_in: true, account_matches: true, ...(account.name ? { name: account.name } : {}) };
}

function checkIdentity(account: Account, expected?: string): string {
  if (!account.uid || !/^[1-9]\d*$/.test(account.uid)) throw new BiliError('UPSTREAM_FORMAT', 'B 站登录响应缺少有效账号标识，尚未绑定账号。');
  if (expected && account.uid !== expected) throw new BiliError('ACCOUNT_MISMATCH', '当前浏览器账号与绑定账号不同。请切回原账号；本人决定更换时才运行 setup --rebind-account。');
  return account.uid;
}

function browserChoice(config: Config): string {
  return JSON.stringify([config.browser_mode, config.browser, config.profile_name ?? '']);
}

/** Connect the existing visible browser. No polling, new browser, or credential export. */
export async function connectAccount(root: string, browser: BrowserExecutor, platform: BilibiliPlatform): Promise<ConnectionResult> {
  const initial = readConfig(root);
  await browser.run(`async(page)=>{await page.goto('https://www.bilibili.com/',{waitUntil:'domcontentloaded',timeout:30000});return {__bili_agent:{opened:true}};}`);
  const account = await platform.account();
  const current = readConfig(root);
  if (!account.logged_in) return pending(current);
  const uid = checkIdentity(account, initial.expected_uid);
  checkIdentity(account, current.expected_uid);
  if (browserChoice(current) !== browserChoice(initial)) throw new BiliError('CONFIG_CHANGED', '浏览器设置刚发生变化。请重新启动本地控制台后再连接，尚未修改账号绑定。');
  if (current.expected_uid) return matched(account);

  let ownedFolders: Set<string> | undefined;
  // A preference update may add a favorite target while the first identity
  // check is in flight. Fetch all owned folders once, then verify the latest
  // targets, rather than writing an obsolete copy of the configuration.
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = readConfig(root);
    if (before.default_targets.some(target => target.kind === 'favorite') && !ownedFolders) {
      ownedFolders = new Set((await platform.folders()).map(folder => folder.id));
    }
    const verified = await platform.account();
    const latest = readConfig(root);
    if (!verified.logged_in) return pending(latest);
    checkIdentity(verified, uid);
    checkIdentity(verified, latest.expected_uid);
    if (browserChoice(latest) !== browserChoice(initial)) throw new BiliError('CONFIG_CHANGED', '浏览器设置刚发生变化。请重新启动本地控制台后再连接，尚未修改账号绑定。');
    if (latest.expected_uid) return matched(verified);

    const favorites = latest.default_targets.filter(target => target.kind === 'favorite');
    if (favorites.length && !ownedFolders) continue;
    if (favorites.some(target => !ownedFolders!.has(target.folder_id))) throw new BiliError('FOLDER_NOT_OWNED', '配置的收藏夹不属于当前登录账号，尚未绑定账号。请调整保存目标后重新连接。');
    // No asynchronous work between this final read and write. Preserve every
    // concurrently updated preference; only add the newly verified binding.
    writeConfig({ ...latest, expected_uid: uid }, root);
    return matched(verified);
  }
  throw new BiliError('CONFIG_CHANGED', '保存目标刚发生变化，尚未绑定账号。请重新连接以核验最新设置。');
}
