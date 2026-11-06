The plugin requires a local Node.js 22.13+ runtime and Chrome or Edge.

Run commands from the plugin project or installed plugin root. Do not collect credentials through the chat.

```powershell
node dist/cli.js doctor
node dist/cli.js setup --mode managed --browser msedge
```

Managed mode opens an independent persistent browser. The user logs in on Bilibili, including scanning its normal QR code if needed. Setup verifies and binds the actual UID. Re-running setup renews expired login. Switching account requires the user's explicit `--rebind-account` command.

Existing-browser mode requires the official [Playwright Extension](https://chromewebstore.google.com/detail/playwright-extension/mmlmfjhmonkocbjadbfplnigmagldckm). Install it in the profile the user wants to use, then run:

```powershell
node dist/cli.js setup --mode extension --browser chrome
```

The extension asks the user to connect a Bilibili tab. For a specific profile, add `--profile-name "Profile 1"`. An optional `PLAYWRIGHT_MCP_EXTENSION_TOKEN` can be supplied through the local environment according to the official extension instructions; never request it in chat.

Settings and browser profile are outside the plugin installation: Windows `%LOCALAPPDATA%\BiliAgent`, Linux/macOS `~/.local/share/BiliAgent`, or `BILI_AGENT_DATA_DIR` when explicitly set. `config.json` stores preferences and the bound UID, not Cookies. Browser-owned login data stays in `browser-profile/` in managed mode. Do not commit or export that private state.

```powershell
node dist/cli.js setup --auto-save off
node dist/cli.js setup --auto-save on
node dist/cli.js setup --folder-id 123456789
```

The default target is watch later. To configure multiple targets, edit the non-secret `default_targets` list in the local config using `{"kind":"watch_later"}` and `{"kind":"favorite","folder_id":"..."}` entries. A target must belong to the bound account.

One managed browser profile can be owned by one browser process at a time. Close a separate setup/diagnostic process before using that same managed profile through Codex. If the browser is occupied, wait for the active operation to finish; do not delete the profile or copy its Cookies.
