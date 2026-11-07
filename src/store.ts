import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Receipt } from './types.js';

export class ReceiptStore {
  private db: DatabaseSync;
  constructor(root: string) {
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(root, 'actions.sqlite'));
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS receipts (action_id TEXT PRIMARY KEY, body TEXT NOT NULL, updated_at TEXT NOT NULL); PRAGMA user_version=1;');
  }
  put(receipt: Receipt) {
    this.db.prepare('INSERT INTO receipts(action_id, body, updated_at) VALUES(?,?,?) ON CONFLICT(action_id) DO UPDATE SET body=excluded.body, updated_at=excluded.updated_at').run(receipt.action_id, JSON.stringify(receipt), receipt.updated_at);
    return receipt;
  }
  get(id: string): Receipt | undefined {
    const row = this.db.prepare('SELECT body FROM receipts WHERE action_id=?').get(id);
    return row ? JSON.parse(String(row.body)) : undefined;
  }
  recent(limit = 20, uid?: string): Receipt[] {
    const rows = uid === undefined
      ? this.db.prepare('SELECT body FROM receipts ORDER BY updated_at DESC, rowid DESC LIMIT ?').all(limit)
      : this.db.prepare("SELECT body FROM receipts WHERE json_extract(body,'$.account_uid')=? ORDER BY updated_at DESC, rowid DESC LIMIT ?").all(uid, limit);
    return rows.map(row => JSON.parse(String(row.body)));
  }
  latest(uid: string, bvid: string, target: Receipt['target']): Receipt | undefined {
    const row = this.db.prepare("SELECT body FROM receipts WHERE json_extract(body,'$.account_uid')=? AND json_extract(body,'$.bvid')=? AND json_extract(body,'$.target.kind')=? AND coalesce(json_extract(body,'$.target.folder_id'),'')=? ORDER BY updated_at DESC, rowid DESC LIMIT 1").get(uid,bvid,target.kind,target.kind === 'favorite' ? target.folder_id : '');
    return row ? JSON.parse(String(row.body)) : undefined;
  }
  close() { this.db.close(); }
}
