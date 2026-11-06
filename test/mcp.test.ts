import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';

test('real MCP stdio handshake, discovery, local status, and input validation',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'bili-agent-mcp-'));
  const client=new Client({name:'bili-agent-tests',version:'0.1.0'});
  const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/cli.js'),'serve'],env:{...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>typeof entry[1]==='string')),BILI_AGENT_DATA_DIR:root},stderr:'pipe'});
  transport.stderr?.on('data',()=>{});
  try{
    await client.connect(transport);
    const {tools}=await client.listTools();
    assert.equal(tools.length,8);
    assert.equal(tools.find(t=>t.name==='bilibili_save_videos')!.annotations?.readOnlyHint,false);
    const status=await client.callTool({name:'bilibili_auth_status',arguments:{online:false}});
    assert.equal(status.isError,undefined);
    const parsed=JSON.parse(status.content.filter(c=>c.type==='text').map(c=>c.text).join(''));
    assert.equal(parsed.ok,true);assert.equal(parsed.data.account_bound,false);assert.equal(parsed.data.online_checked,false);
    assert.ok(!JSON.stringify(status).includes('SESSDATA'));
    const invalid=await client.callTool({name:'bilibili_save_videos',arguments:{videos:[],cookie:'not-accepted'}}).catch(error=>error);
    assert.ok(invalid instanceof Error || invalid.isError===true);
  }finally{await client.close();await transport.close();fs.rmSync(root,{recursive:true,force:true});}
});
