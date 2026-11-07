export type BrowserMode = 'managed' | 'extension';
export type SaveTarget = { kind: 'watch_later' } | { kind: 'favorite'; folder_id: string };
export interface Config {
  schema_version: 1;
  browser_mode: BrowserMode;
  browser: 'chrome' | 'msedge';
  profile_name?: string;
  expected_uid?: string;
  auto_save: boolean;
  default_targets: SaveTarget[];
  max_save_batch: number;
}
export interface Account { logged_in: boolean; uid?: string; name?: string }
export interface VideoRef { platform: 'bilibili'; bvid: string; part: number; url: string }
export interface Video extends VideoRef {
  aid: string;
  cid: string;
  title: string;
  description: string;
  creator: string;
  duration: number;
  parts: { part: number; cid: string; title: string; duration: number }[];
}
export interface Folder { id: string; title: string; count: number }
export interface Cue { start: number; end: number; text: string; url: string }
export interface Transcript {
  video: Video;
  data_source: 'subtitle' | 'ai_subtitle';
  language: string;
  cues: Cue[];
  coverage: { part: number; requested_start_seconds: number; requested_end_seconds: number; start_seconds: number; end_seconds: number; total_cues: number; returned_cues: number; truncated: boolean; next_start_seconds?: number; next_cursor?: string; visuals_analyzed: false };
}
export type ReceiptStatus = 'prepared' | 'saved' | 'already_present' | 'pending_verification' | 'failed';
export interface Receipt {
  action_id: string;
  account_uid: string;
  bvid: string;
  title: string;
  target: SaveTarget;
  status: ReceiptStatus;
  created_at: string;
  updated_at: string;
  error_code?: string;
}
export interface BilibiliPlatform {
  account(): Promise<Account>;
  search(keyword: string, page: number, limit: number): Promise<unknown>;
  video(input: string, part?: number): Promise<Video>;
  transcript(input: string, options: { part?: number; start?: number; end?: number; limit: number; cursor?: string }): Promise<Transcript>;
  folders(): Promise<Folder[]>;
  contains(video: Video, target: SaveTarget, uid: string): Promise<boolean>;
  add(video: Video, target: SaveTarget, uid: string): Promise<void>;
  frames?(input: string, part: number | undefined, times?: number[]): Promise<{ video: Video; frames: { time_seconds: number; data: string; mimeType: 'image/jpeg' }[]; failures: { time_seconds: number; code: string }[] }>;
  close(): Promise<void>;
}
