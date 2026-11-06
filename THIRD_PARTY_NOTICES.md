# Third-party notices

- `@playwright/mcp` 0.0.84 and its Playwright dependencies, Microsoft Corporation, Apache-2.0: browser lifecycle, extension connection, browser automation, and screenshots. Their runtime packages retain their own LICENSE and NOTICE files in distributions.
- `@modelcontextprotocol/server` and `@modelcontextprotocol/client` 2.4.0, Apache-2.0: MCP protocol, tool discovery, validation and stdio transport. Their packages retain their license files.
- `proper-lockfile` 4.1.2, MIT: cross-process account action lock. Its license and dependency licenses are retained in node_modules.
- `zod` 4.6.7, MIT: input and configuration validation. Its license is retained in node_modules.
- `src/bilibili/wbi.ts` is modified from [BrowserMCP `_shared.js`](https://github.com/jackwener/BrowserMCP/blob/847790e4e57b5d3de137829bf51e20c5fb357d73/adapters/bilibili/_shared.js), Apache-2.0. The changes isolate and type the signer and inject the timestamp/keys. The original license is included in `third-party/BrowserMCP-LICENSE.txt`.
- Bilibili Web API operation shapes were checked against [BrowserMCP](https://github.com/jackwener/BrowserMCP) (Apache-2.0), and the [nuko777 Bilibili MCP](https://github.com/nuko777/bilibili-mcp/blob/1948b6d70a0480abdaed27f1fa99bdb622ce7997/src/api/actions.mjs) (MIT). No complete upstream server or account credentials are bundled.
- The WBI test uses the `foo/bar/zab` reference vector also recorded in [only3412's test suite](https://github.com/only3412/bilibili-mcp-agent/blob/86c4149e0bb9771b82d29059072286a9fe3c2452/tests/test_core.py).

Bilibili names and content belong to their respective owners. This is an independent local integration. No affiliation or official API authorization is implied.
