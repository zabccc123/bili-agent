import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const cli=path.join(path.dirname(require.resolve('@playwright/mcp/package.json')),'cli.js');
const transport=new StdioClientTransport({command:process.execPath,args:[cli,'--headless','--browser','msedge','--snapshot-mode','none','--no-webmcp'],stderr:'pipe'});
transport.stderr.on('data',data=>process.stderr.write(data));
const client=new Client({name:'bili-agent-probe',version:'0.1.0'});
try {await client.connect(transport);console.log(JSON.stringify((await client.listTools()).tools.filter(t=>t.name.includes('run_code')),null,2));}
catch(error){console.error(error);process.exitCode=1;}
finally{await client.close();await transport.close();}
