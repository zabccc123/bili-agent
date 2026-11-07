import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Client,InMemoryTransport} from '@modelcontextprotocol/client';
import {createServer} from '../src/server.js';
import {BiliFixture,FixtureBrowser,BVID,SECOND} from './fixture.js';
import {BrowserBilibili} from '../src/bilibili/platform.js';
import {BiliService} from '../src/service.js';
import {ReceiptStore} from '../src/store.js';
import {defaultConfig} from '../src/config.js';
import {ActivityLog} from '../src/activity.js';

async function setup(fixture=new BiliFixture()){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'bili-agent-mcp-session-'));
  const store=new ReceiptStore(root),config={...defaultConfig(),expected_uid:'42' as string|undefined};
  const activity=new ActivityLog();
  const platform=new BrowserBilibili(new FixtureBrowser(fixture),{onStage:stage=>activity.stage(stage)});
  const service=new BiliService(platform,store,()=>config,root,[0]);
  const dashboardUrl='http://127.0.0.1:12345/#'+'a'.repeat(64);
  const server=createServer(service,{activity,dashboardUrl});
  const client=new Client({name:'bili-agent-session-tests',version:'0.2.0'});
  const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);await client.connect(clientTransport);
  return{store,config,service,activity,client,dashboardUrl,async close(){await client.close();await server.close();await service.close();fs.rmSync(root,{recursive:true,force:true});}};
}
function data(result:Awaited<ReturnType<Client['callTool']>>){return JSON.parse(result.content.filter(c=>c.type==='text').map(c=>c.text).join(''));}

test('dashboard entry responds while the browser queue is occupied by a long-running tool',async()=>{
  let release!:()=>void,entered!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
  class GatedSearch extends BiliFixture {
    override async fetch(input:string|URL,init:RequestInit={}){
      if(new URL(String(input)).pathname==='/x/web-interface/wbi/search/type'){entered();await gate;}
      return super.fetch(input,init);
    }
  }
  const ctx=await setup(new GatedSearch());
  let pendingSearch:Promise<Awaited<ReturnType<Client['callTool']>>>|undefined;
  try{
    pendingSearch=ctx.client.callTool({name:'bilibili_search',arguments:{keyword:'fixture topic'}});
    await started;
    assert.ok(ctx.activity.recent().some(t=>t.operation==='bilibili_search'&&t.status==='running'));
    const opened=await ctx.client.callTool({name:'bilibili_open_dashboard',arguments:{}},{timeout:500});
    assert.equal(opened.isError,undefined);
    assert.equal(data(opened).data.url,ctx.dashboardUrl);
    assert.ok(ctx.activity.recent().some(t=>t.operation==='bilibili_search'&&t.status==='running'),'the URL must arrive before the blocked operation finishes');
    release();assert.equal((await pendingSearch).isError,undefined);
  }finally{release();await pendingSearch?.catch(()=>{});await ctx.close();}
});

test('MCP receipt listing filters the current binding before applying the requested limit',async()=>{
  const ctx=await setup();try{
    const makeReceipt=(uid:string,bvid:string,date:string)=>({action_id:randomUUID(),account_uid:uid,bvid,title:'Synthetic receipt',target:{kind:'watch_later' as const},status:'saved' as const,created_at:date,updated_at:date});
    const a=ctx.store.put(makeReceipt('42',BVID,'2024-01-01T00:00:00.000Z'));
    const b=ctx.store.put(makeReceipt('99',SECOND,'2025-01-01T00:00:00.000Z'));
    const list=async()=>data(await ctx.client.callTool({name:'bilibili_get_save_receipt',arguments:{limit:1}})).data;
    assert.equal((await list())[0].action_id,a.action_id,'a newer receipt for another account must not hide the current account record');
    assert.equal(ctx.service.receipts(1)[0]!.account_uid,'42');
    ctx.config.expected_uid='99';assert.equal((await list())[0].action_id,b.action_id);
    ctx.config.expected_uid=undefined;assert.deepEqual(await list(),[]);
  }finally{await ctx.close();}
});
