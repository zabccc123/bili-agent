# Bili Agent · B站资料助手

[![Check](https://github.com/zabccc123/bili-agent/actions/workflows/check.yml/badge.svg)](https://github.com/zabccc123/bili-agent/actions/workflows/check.yml) [![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)

在 Codex 或其他 MCP 客户端中搜索和阅读 B 站视频，把最终推荐加入本人稍后再看或收藏夹，并回读确认。

A local-first Bilibili MCP plugin for searching videos, reading timed subtitles, sampling frames, and saving selected resources to your watch-later list or favorite folders. It reuses Playwright MCP and the MCP TypeScript SDK. Account sessions stay on your computer.

第一版复用官方 Playwright MCP 和 MCP SDK v2。浏览器连接、协议和文件锁使用现有库；本项目维护 B 站业务工具、内容证据、保存偏好和回执。无需额外模型 API Key，字幕和采样画面由当前 Agent 阅读。

**可用功能**

- 现有 Chrome/Edge 扩展连接，以及独立持久化浏览器扫码登录。
- 搜索、元数据、分 P、人工／平台 AI 字幕、时间点链接和分页读取。
- 播放器画面采样，返回实际时间点的图片。
- 加入稍后再看、加入本人指定收藏夹，支持预览、查重、回读核验和持久化回执。
- Skill 在推荐资料时按本地偏好自动保存最终推荐集。
- 本地可视化资料工作台：搜索、字幕续读、保存队列、任务阶段与耗时、跨聊天保存回执。
- 有界内存缓存复用签名信息、视频详情与完整字幕；字幕按当前账号和分 P 隔离，续读使用精确游标。

不含本地 ASR；没有字幕时明确返回状态，可以采样画面但不能当作完整音视频理解。插件启用后的 Skill 和服务 instructions 提供相关任务的流程指导，不是对所有聊天回答的强制监听器。

**本地使用**

需要 Node.js 22.13+、已安装的 Chrome 或 Edge。推荐 Node.js 24。Windows 已在 Edge 上运行验证。

```powershell
git clone https://github.com/zabccc123/bili-agent.git
cd bili-agent
npm ci
npm run check
node dist/cli.js dashboard
```

打开命令输出的本机地址，点击“登录/连接 B站”，在受控浏览器扫码后再点击“已扫码，连接账号”，即可完成首次绑定。已有 Codex 插件安装时，可以直接说“打开 B站资料工作台”。

原 `setup` 命令仍可使用；复用现有浏览器或显式更换绑定时使用命令行选项。更换绑定前，先结束占用同一专用浏览器的控制台/MCP 服务，避免配置占用；不要删除 profile。

打包本地插件还需要 Python 3.9+，使用标准库生成 ZIP；日常运行无需 Python。

程序确认实际账号后绑定 UID，默认自动将最终推荐加入稍后再看。Windows 个人状态在 `%LOCALAPPDATA%\BiliAgent`，与项目和插件安装目录分离。升级插件不会覆盖登录态。

复用日常浏览器需要安装官方 [Playwright Extension](https://chromewebstore.google.com/detail/playwright-extension/mmlmfjhmonkocbjadbfplnigmagldckm)，然后运行：

```powershell
node dist/cli.js setup --mode extension --browser chrome
```

按照浏览器连接页提示选择 B 站标签页。两种登录模式通过配置切换；本人决定换账号时才使用 `--rebind-account`。项目和聊天均不需要接收 Cookie。

```powershell
node dist/cli.js doctor
node dist/cli.js doctor --online
node dist/cli.js dashboard
node dist/cli.js search --keyword 'MCP 开发 教程' --headless
node dist/cli.js inspect --video 'https://www.bilibili.com/video/BV1RNTtzMENj/' --headless
```

`dashboard` 会输出本机可点击地址。保持终端运行；若已有新版 MCP 服务，命令会连接它的控制台，复用同一浏览器与任务队列。Codex 中也可以说“打开 B站资料工作台”，由 `bilibili_open_dashboard` 获取地址。地址带本地连接码，只给本人使用。控制台仅监听 `127.0.0.1`。

`doctor` 默认只检查本地，明确区分“已绑定”与“已在线核验”；需要机器可读结果时加 `--json`。常规 MCP 使用不会为每个工具重启浏览器。命令行 `search` / `inspect` 则是一次性调用，不共享另一个进程的缓存。

**安装为 Codex 插件**

开发版本打包和安装：

```powershell
npm run package:local
codex plugin marketplace add ./artifacts/marketplace --json
codex plugin add bili-agent@bili-local --json
node scripts/configure-codex.mjs
```

打包目录包含编译结果、Skill 和生产依赖。安装后在 Codex 中重新加载插件或打开新聊天；必要时重启应用。插件安装结果与聊天工具列表可能需要不同的刷新周期。可用 `codex plugin list --marketplace bili-local --json` 检查本地安装。

`configure-codex.mjs` 仅为本插件的 `bilibili_save_videos` 添加逐工具自动批准设置，匹配本人要求的自动保存；其他工具和全局权限不变。已有同名逐工具设置时保留原设置。

在新聊天里说：

> 用 B站资料助手找几条 MCP 开发教程，读一下关键内容，把最终推荐加入稍后再看。

Skill 名称为 `$bilibili-research`。MCP 服务名为 `bili-agent`。所有工具名以 `bilibili_` 开头。

其他 MCP 客户端使用同一服务，配置格式示例：

```json
{
  "mcpServers": {
    "bili-agent": {
      "command": "node",
      "args": ["/absolute/path/to/bili-agent/dist/cli.js", "serve"]
    }
  }
}
```

**保存偏好**

`config.json` 只存 UID、浏览器模式和偏好；浏览器负责登录数据。可以运行 `setup --auto-save off` 暂停自动保存，或 `setup --auto-save on` 恢复。`setup --folder-id ID` 将默认目标改为本人收藏夹。也可以编辑 `default_targets`，同时包含：

```json
[{"kind":"watch_later"},{"kind":"favorite","folder_id":"真实收藏夹ID"}]
```

保存工具本身可用于用户明确要求的手动保存；`auto_save` 控制 Skill 是否在推荐时自动调用它。收藏夹目标需通过当前账号归属检查。

`saved` 和 `already_present` 表示成员状态已确认。`pending_verification` 表示结果不确定，需先调用回执工具再次查询。写入超时不自动重发。只有明确决定重试先前未确认动作时才使用 `retry_unconfirmed: true`，工具仍会先重新检查远端成员状态。

**验证和维护**

```powershell
npm run check
npm run smoke
node scripts/live-acceptance.mjs --frames
npm run benchmark:fixture
npm run benchmark:live -- --frames
```

`npm run preview:ui` 启动纯本地模拟工作台，包含多分 P、415 条字幕和待核验回执，所有保存只影响临时测试环境，不连接真实 B 站。适合界面开发与复验。`benchmark:live` 只读取和执行保存预览，不向账号新增内容；真实计时与合成请求次数分别记录，不能混用。

界面同时显示当前服务会话的 MCP 与网页操作。任务历史只保留本次进程；保存回执存储在本机并按当前绑定隔离。缓存也是进程内短期缓存，服务重启后重新建立。字幕续读优先使用 `coverage.next_cursor`，不重复下载整份字幕。

前一项不访问真实 B 站账号；它包含完整适配器的合成上游场景和真实 MCP stdio 协议测试。`smoke` 用独立测试状态目录检查官方浏览器桥接。`live-acceptance` 是登录后的只读验收；加 `--save` 才会把指定视频加入稍后再看，加 `--folder-id ID` 还会加入对应收藏夹。测试结果在被 Git 忽略的 `artifacts/acceptance`。该目录可含字幕和截图，不随插件分发。

维护时运行 `npm ci` 复现锁定依赖。站点变化集中在 `src/bilibili/`；浏览器层在 `src/browser.ts`；保存闭环在 `src/service.ts`。增加网站可以实现平台接口，新 Agent 宿主复用 MCP。远程 HTTP 和自动更新尚未实现。

专用 profile 一次由一个浏览器进程持有。使用 Codex 前请结束单独运行的 setup 或在线诊断；占用时等待原操作结束，不要删除 profile。项目会对同一账号的保存动作加跨进程锁。登录失效时重新运行 setup；验证码或权限问题在网页中处理。

从独立工作台切换到新的 Codex MCP 会话前，点击“释放浏览器”。工作台、绑定和回执会保留，专用浏览器连接被关闭；新会话再说“打开 B站资料工作台”，让它使用同一会话的界面与队列。并发共享一个专用 profile 的多会话模式尚未实现。

源码与复用归属见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

版本变化见 [CHANGELOG.md](CHANGELOG.md)，每轮评审、修复与实测证据见 [UX_ITERATIONS.md](UX_ITERATIONS.md)。

**参与和后续功能**

欢迎通过 [Issues](https://github.com/zabccc123/bili-agent/issues) 报告问题和讨论功能，通过 Pull Request 提交改进。开发流程见 [CONTRIBUTING.md](CONTRIBUTING.md)，本地验收范围见 [VALIDATION.md](VALIDATION.md)。报告问题时请保留错误码和运行版本，移除个人账号、Cookie、浏览器 profile、截图中的私人信息及带签名的媒体地址。

后续方向包括可选本地 ASR、更多浏览器与系统的在线验收，以及更完善的长视频任务恢复。功能以实际测试和资源投入为准。

本项目采用 [Apache License 2.0](LICENSE)，是独立第三方集成，与哔哩哔哩或 OpenAI 均无官方隶属关系。只操作本人有权访问的内容；验证码、会员权限或其他访问限制需要在网页中正常处理。
