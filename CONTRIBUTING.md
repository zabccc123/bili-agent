# Contributing

Use an issue to describe a bug or discuss a new capability, or submit a focused pull request with the change and its validation. Chinese and English contributions are welcome.

**Development**

Use Node.js 24 and a recent npm version:

```sh
npm ci
npm run check
```

The automated suite uses synthetic Bilibili responses and a real MCP stdio connection. It does not require an account or perform live Bilibili writes. CI runs the same checks on Windows and Ubuntu.

If you change browser integration, install Chrome or Edge and run `npm run smoke`. Live acceptance is separate: `node scripts/live-acceptance.mjs --frames` reads the configured account's chosen sample video. Use `--video BV...` to choose a sample. `--save` performs account additions and must be used intentionally with your own account. Never put account state, transcripts, screenshots or action databases in a pull request.

**Change boundaries**

- Keep platform behavior under `src/bilibili/` and continue reusing the official browser and MCP components.
- Preserve account binding, folder ownership checks, add-only actions, exact member verification and recovery of uncertain writes.
- Keep evidence honest: subtitles, automatic transcripts and sampled frames have different coverage and error modes.
- Update tool descriptions, Skill instructions and docs when behavior changes. Retain upstream attribution.
- Add regression coverage for an observable failure or new behavior. Avoid tests that only assert implementation wording.

For packaging, Python 3.9+ is needed for ZIP creation. `npm run package:local` produces a local marketplace with production dependencies and an archive under `artifacts/`. That output is ignored by Git. Keep package.json and both plugin manifest versions in sync for a release.

Bug reports should include the operation, public video link if applicable, error code, operating system, Node/browser versions, and plugin version. Remove Cookies, access tokens, private identifiers, browser data, and signed URLs. If a reproducer needs login, state that requirement without sharing the session.

Contributions are made under the repository's Apache-2.0 license.
