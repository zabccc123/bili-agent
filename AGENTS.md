This is a local-first Bilibili MCP plugin, maintained in TypeScript.

- Use Node.js 24, `npm ci`, and `npm run check` for ordinary changes.
- Reuse Playwright MCP for browser control and the MCP SDK for the protocol. Keep Bilibili behavior in `src/bilibili/`.
- The managed browser profile, account binding, config, and action database live outside this repository. Never copy that private state into the plugin or output raw browser logs/cookies/signed media URLs.
- Tests under `test/` use synthetic remote responses and real stdio. `npm run smoke` uses a disposable browser state. Online validation is separate; `scripts/live-acceptance.mjs` is read-only unless `--save` is explicitly passed.
- Preserve add-only save semantics, UID checks immediately before writes, target ownership checks, member readback and unknown-outcome recovery. Do not replace them with UI toggles.
- New features must report actual content coverage. Transcript-only and sampled-frame observations are different evidence types; lack of subtitles is not a completed video analysis.
- Keep plugin manifests, Skill and CLI docs consistent with exposed tools. Package production dependencies with `npm run package:local`; never package artifacts/acceptance or user state.
- Changes to the adapted WBI signer must retain the upstream attribution and reference vector check.
