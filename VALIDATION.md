# v0.1.0 validation

Date: 2026-11-06, Asia/Shanghai. Platform: Windows, Node.js 24.11.0, Microsoft Edge. Dependencies are pinned in package-lock.json.

| Check | Result |
|---|---|
| TypeScript build | Passed |
| Automated workflow/protocol tests | 10 passed |
| Official Playwright MCP browser roundtrip | Passed in a disposable profile |
| Skill Creator frontmatter validation | Passed with Python UTF-8 mode |
| Personal-account login and UID binding | Passed with managed browser mode |
| Live video search | Passed |
| Full timed subtitle retrieval | 461 platform AI subtitle cues, P1, 0.12–970.22 seconds; no truncation |
| Actual player frame capture | Passed at 100 and 400 seconds; images inspected |
| Watch-later write and member readback | Passed; initial status saved |
| Repeated save | Passed; already_present, no additional write required |
| Production dependency packaging | Passed; runtime ZIP about 9.9 MB |
| Codex local marketplace install | bili-agent@bili-local 0.1.0 installed and enabled |
| Installed-copy protocol and real-account flow | Passed: login check, subtitles, frames and repeat-save readback |

The live sample was [从零编写MCP并发布上线，超简单！手把手教程 — 技术爬爬虾](https://www.bilibili.com/video/BV1RNTtzMENj/). It was intentionally added to the user's watch-later list as a relevant resource and end-to-end check. Only this video was added during live acceptance.

Account data and test output are not bundled with the plugin. Local acceptance evidence is in artifacts/acceptance; action history is in the private application data directory.

Known limits: existing-browser extension mode is implemented and documented, but was not live-tested because the official extension was absent from the checked default profiles. Favorite-folder additions passed synthetic integration tests; no live favorite target was chosen or modified. ASR is not implemented. Frame samples do not imply full visual coverage. Concurrent processes cannot own the same managed browser profile.

CI configuration is included for Windows and Ubuntu. Current hosted results are available in [GitHub Actions](https://github.com/zabccc123/bili-agent/actions/workflows/check.yml); the manual browser and account checks above were performed locally on Windows.
