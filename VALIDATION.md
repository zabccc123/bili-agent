# v0.2.0 validation

Validation: 2026-11-07; final installation and release checks: 2026-11-08, Asia/Shanghai. Local platform: Windows, Node.js 24.11.0, Microsoft Edge. Dependencies remain pinned in package-lock.json.

| Check | Result |
|---|---|
| TypeScript build and workflow/protocol regressions | 61 tests passed |
| Cache behavior | TTL, capacity, account/part isolation, logout, failed fetch and returned-object mutation covered |
| Exact subtitle pagination | Overlapping/equal-start cues at limits 1/2/3 return once and terminate; cursor identity/revision validated |
| Save correctness | UID immediately before POST, folder ownership, add-only deduplication, member readback, uncertain-outcome recovery covered |
| Local HTTP workspace | Bearer, exact Host/Origin, input/body limits, split UTF-8, queue limit and binding-scoped receipts covered |
| Account connection | Pending/bind/reconnect/mismatch, final identity/ownership checks and concurrent preference changes covered |
| MCP | Nine tools, real stdio, same-service tasks; dashboard entry responds while browser work is blocked |
| CLI | Help variants, clear offline diagnostics, no premature browser/database initialization |
| Interactive workspace | Root operated actual browser against synthetic data; search, connection, paging, P2, queue, preview, partial receipts and refresh behavior verified |
| Real Bilibili reads | Search, metadata, full subtitles, cached reread and pagination, save preview, player frame capture passed |
| Real Bilibili writes during this update | None |
| Production archive | 9.93 MB; workspace modules included; no private account/profile/database files |
| Codex installed copy | bili-agent@bili-local 0.2.0 installed and enabled |
| Installed production acceptance, 2026-11-08 | Nine tools, authenticated local workspace, bound account, 461 timed subtitle cues, two player frames at 100/400 s all passed; no account additions |

The public live sample is [从零编写MCP并发布上线，超简单！手把手教程 — 技术爬爬虾](https://www.bilibili.com/video/BV1RNTtzMENj/). The timing run used a managed headless browser; it does not include model reasoning time. Timing comparisons and separate review scopes are documented in [UX_ITERATIONS.md](UX_ITERATIONS.md).

Developer and test agents worked independently; two other agents supplied simulated novice/power-user reviews. These are not external human participants. A reviewer encountered browser-tool failures; root completed the actual UI checks. The original v0.1.0 had separately verified one real watch-later addition and repeat readback on 2026-11-06; this update deliberately used synthetic writes and real read-only checks instead.

Reproduce with `npm run check`, `npm run smoke`, `npm run preview:ui`, `npm run benchmark:fixture`, and optionally `npm run benchmark:live -- --frames`. The last command reads the configured account but never adds content. `scripts/live-acceptance.mjs --save` is a separate, explicit write mode and was not used for this update.

Account state and evidence are not bundled with the plugin. Real acceptance output is ignored under artifacts/; browser profiles/config/action history stay in the private application data directory. Task history and short-term caches are process-local; save receipts persist across sessions. One managed profile may be owned by one browser process at a time.

Known limits: extension mode remains implemented but has no new live acceptance here; real favorite-folder writes were not performed. No ASR. Subtitle or sampled-frame evidence is not full audiovisual coverage. First browser launch still has startup cost. The website and network can change. Current Windows and Ubuntu CI results are available in [GitHub Actions](https://github.com/zabccc123/bili-agent/actions/workflows/check.yml).
