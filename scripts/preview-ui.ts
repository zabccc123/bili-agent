// Disposable synthetic account for interactive UX testing. Never connects to Bilibili.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {BiliFixture,FixtureBrowser,BVID,SECOND} from '../test/fixture.js';
import {BrowserBilibili} from '../src/bilibili/platform.js';
import {BiliService} from '../src/service.js';
import {ReceiptStore} from '../src/store.js';
import {defaultConfig,writeConfig} from '../src/config.js';
import {ActivityLog} from '../src/activity.js';
import {startDashboard} from '../src/dashboard.js';

class PreviewFixture extends BiliFixture {
  override async fetch(input:string|URL,init:RequestInit={}) {
    const url=new URL(String(input));
    if(url.hostname==='aisubtitle.hdslb.com')return new Response(JSON.stringify({body:Array.from({length:415},(_,i)=>({from:i*3,to:i*3+3,content:`演示字幕 ${i+1}：本地模拟资料，不是来自实际视频。可以测试续读、时间点与画面覆盖提示。`}))}));
    if(url.pathname==='/x/web-interface/wbi/search/type') {
      await new Promise(resolve=>setTimeout(resolve,650));
      return new Response(JSON.stringify({code:0,data:{numResults:4,numPages:2,result:[{bvid:BVID,title:'MCP 入门：工具、资源与实践',author:'演示作者',duration:'20:45'},{bvid:SECOND,title:'从真实需求设计 Agent 工作流',author:'演示作者',duration:'18:20'}]}}));
    }
    const response=await super.fetch(input,init);
    if(url.pathname==='/x/web-interface/wbi/view') {
      const data=await response.json();
      data.data.title='MCP 开发入门 · 本地演示视频';
      data.data.pages=[{page:1,cid:200,part:'基础与工具设计',duration:1245},{page:2,cid:201,part:'连接与工作流实践',duration:1245}];
      return new Response(JSON.stringify(data));
    }
    return response;
  }
}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'bili-agent-ui-preview-'));
const config={...defaultConfig(),expected_uid:'42'};writeConfig(config,root);
const fixture=new PreviewFixture(),browser=new FixtureBrowser(fixture),activity=new ActivityLog();
const platform=new BrowserBilibili(browser,{onStage:stage=>activity.stage(stage)}),store=new ReceiptStore(root);
const service=new BiliService(platform,store,()=>config,root,[0,0]);
store.put({action_id:randomUUID(),account_uid:'42',bvid:BVID,title:'演示：等待核验的保存记录',target:{kind:'watch_later'},status:'pending_verification',created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
const dashboard=await startDashboard({service,browser,activity,root,demo:true});
console.log(JSON.stringify({url:dashboard.url,demo:true,root}));
let stopping=false;
async function stop(){if(stopping)return;stopping=true;await dashboard.close();await service.close();const resolved=fs.realpathSync(root);if(path.dirname(resolved)===fs.realpathSync(os.tmpdir())&&path.basename(resolved).startsWith('bili-agent-ui-preview-'))fs.rmSync(resolved,{recursive:true,force:true});}
process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
