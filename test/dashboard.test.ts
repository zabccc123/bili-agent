import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {startDashboard,existingDashboard} from '../src/dashboard.js';
import {ActivityLog} from '../src/activity.js';
import {BiliService} from '../src/service.js';
import {BrowserBilibili} from '../src/bilibili/platform.js';
import {BiliFixture,FixtureBrowser,BVID} from './fixture.js';
import {ReceiptStore} from '../src/store.js';
import {defaultConfig} from '../src/config.js';

async function setup(fixture=new BiliFixture(),browser=new FixtureBrowser(fixture)){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'bili-agent-dashboard-'));
  const activity=new ActivityLog();
  const config={...defaultConfig(),expected_uid:'42'};
  const platform=new BrowserBilibili(browser,{onStage:stage=>activity.stage(stage)});
  const service=new BiliService(platform,new ReceiptStore(root),()=>config,root,[0,0]);
  const dashboard=await startDashboard({service,browser,activity,root});
  const get=(route:string,headers:Record<string,string>={})=>fetch(dashboard.origin+route,{headers:{Authorization:'Bearer '+dashboard.token,...headers}});
  const action=(action:string,args:unknown={})=>fetch(dashboard.origin+'/api/action',{method:'POST',headers:{Authorization:'Bearer '+dashboard.token,'Content-Type':'application/json'},body:JSON.stringify({action,args})});
  return{root,fixture,browser,config,service,dashboard,activity,get,action,async close(){await dashboard.close();await service.close();fs.rmSync(root,{recursive:true,force:true});}};
}

class ReconnectingBrowser extends FixtureBrowser {
  closeCount=0;
  sessions=0;
  active=false;
  override async run<T>(code:string):Promise<T>{
    if(!this.active){this.active=true;this.sessions++;}
    return super.run<T>(code);
  }
  override async close(){this.closeCount++;this.active=false;}
}

test('loopback API requires bearer auth and exact host/origin, never a query token or CORS exception',async()=>{
  const ctx=await setup();try{
    assert.match(ctx.dashboard.origin,/^http:\/\/127\.0\.0\.1:\d+$/);
    assert.ok(new URL(ctx.dashboard.url).hash.length>1);
    assert.equal(new URL(ctx.dashboard.url).search,'');
    assert.equal((await fetch(ctx.dashboard.origin+'/api/status')).status,401);
    assert.equal((await ctx.get('/api/status',{Authorization:'Bearer wrong'})).status,401);
    assert.equal((await fetch(ctx.dashboard.origin+'/api/status?token='+ctx.dashboard.token)).status,401);
    const evilOrigin=await ctx.get('/api/status',{Origin:'https://attacker.invalid'});
    assert.equal(evilOrigin.status,403);assert.equal(evilOrigin.headers.get('access-control-allow-origin'),null);
    const spoofedHostStatus=await new Promise<number|undefined>((resolve,reject)=>{
      const request=http.get(ctx.dashboard.origin+'/api/status',{headers:{Host:'attacker.invalid',Authorization:'Bearer '+ctx.dashboard.token}},response=>{response.resume();response.on('end',()=>resolve(response.statusCode));});
      request.on('error',reject);
    });
    assert.equal(spoofedHostStatus,403);
    const status=await ctx.get('/api/status',{Origin:ctx.dashboard.origin});assert.equal(status.status,200);
    assert.equal(status.headers.get('cache-control'),'no-store');
    assert.equal(status.headers.get('x-content-type-options'),'nosniff');
    const payload=await status.json();
    assert.equal(payload.data.account_bound,true);assert.equal(payload.data.online_checked,false);
    assert.equal(payload.data.expected_uid,undefined);assert.equal(payload.data.account,undefined);
    assert.equal(ctx.fixture.requests.length,0,'loading status must not pretend to have checked online login');
    const page=await fetch(ctx.dashboard.origin+'/');
    assert.match(page.headers.get('content-security-policy')??'',/frame-ancestors 'none'/);
    assert.ok(!(await page.text()).includes(ctx.dashboard.token),'public assets must not embed this session token');
  }finally{await ctx.close();}
});

test('actions reject unknown fields, missing JSON, oversized requests and arbitrary browser execution',async()=>{
  const ctx=await setup();try{
    for(const [action,args] of [['search',{keyword:'topic',cookie:'not-supported'}],['execute',{code:'arbitrary'}],['open_browser',{url:'https://attacker.invalid'}],['save',{videos:[]}]] as const){
      const response=await ctx.action(action,args);assert.equal(response.status,400);
      assert.equal((await response.json()).error.code,'INVALID_INPUT');
    }
    assert.equal((await fetch(ctx.dashboard.origin+'/api/action',{method:'POST',headers:{Authorization:'Bearer '+ctx.dashboard.token},body:'{}'})).status,415);
    assert.equal((await fetch(ctx.dashboard.origin+'/api/action',{method:'POST',headers:{Authorization:'Bearer '+ctx.dashboard.token,'Content-Type':'application/json'},body:' '.repeat(33000)})).status,413);
    assert.equal(ctx.fixture.requests.length,0);assert.equal(ctx.fixture.writes,0);
    assert.equal(ctx.activity.recent().length,0,'invalid requests must not enter the task queue');
  }finally{await ctx.close();}
});

test('Chinese JSON survives a UTF-8 character split across incoming HTTP chunks',async()=>{
  const ctx=await setup();try{
    const keyword='中文搜索资料';
    const body=Buffer.from(JSON.stringify({action:'search',args:{keyword}}));
    const split=body.indexOf(Buffer.from(keyword))+1;
    const result=await new Promise<{status:number|undefined;body:string}>((resolve,reject)=>{
      const request=http.request(ctx.dashboard.origin+'/api/action',{method:'POST',headers:{Authorization:'Bearer '+ctx.dashboard.token,'Content-Type':'application/json','Content-Length':body.length}},response=>{
        let text='';response.setEncoding('utf8');response.on('data',chunk=>{text+=chunk;});response.on('end',()=>resolve({status:response.statusCode,body:text}));
      });
      request.on('error',reject);request.write(body.subarray(0,split));
      setTimeout(()=>request.end(body.subarray(split)),10);
    });
    assert.equal(result.status,200,result.body);
    const search=ctx.fixture.requests.find(r=>new URL(r.url).pathname==='/x/web-interface/wbi/search/type');
    assert.ok(search);assert.equal(new URL(search.url).searchParams.get('keyword'),keyword);
  }finally{await ctx.close();}
});

test('preview, saved, already present and pending verification remain distinct through HTTP',async()=>{
  const ctx=await setup();try{
    const preview=await (await ctx.action('preview',{videos:[BVID]})).json();
    assert.equal(preview.ok,true);assert.equal(preview.data.preview,true);assert.equal(preview.data.planned[0].would_add,true);
    assert.equal(ctx.fixture.writes,0);assert.equal(ctx.service.receipts(100).length,0);
    const saved=await (await ctx.action('save',{videos:[BVID]})).json();
    assert.equal(saved.data.receipts[0].status,'saved');assert.equal(ctx.fixture.writes,1);
    const already=await (await ctx.action('save',{videos:[BVID]})).json();
    assert.equal(already.data.receipts[0].status,'already_present');assert.equal(ctx.fixture.writes,1);
    const receipts=await (await ctx.get('/api/receipts')).json();
    assert.ok(receipts.data.length>0);assert.ok(receipts.data.every((r:any)=>r.account_uid===undefined));
    ctx.config.expected_uid='99';
    assert.equal((await (await ctx.get('/api/receipts')).json()).data.length,0,'a new account binding must not reveal the previous account history');
  }finally{await ctx.close();}
});

test('pending receipts can be reconciled through HTTP without another write',async()=>{
  const ctx=await setup();try{
    ctx.fixture.delayVisibility=100;
    const first=await (await ctx.action('save',{videos:[BVID]})).json();
    assert.equal(first.data.receipts[0].status,'pending_verification');assert.equal(first.data.all_verified,false);
    const id=first.data.receipts[0].action_id;
    const pending=await (await ctx.action('verify',{action_id:id})).json();
    assert.equal(pending.data.status,'pending_verification');assert.equal(ctx.fixture.writes,1);
    ctx.fixture.delayVisibility=0;
    const verified=await (await ctx.action('verify',{action_id:id})).json();
    assert.equal(verified.data.status,'saved');assert.equal(ctx.fixture.writes,1);
  }finally{await ctx.close();}
});

test('disconnect releases only the browser while local history remains available and the next read reconnects',async()=>{
  const fixture=new BiliFixture(),browser=new ReconnectingBrowser(fixture),ctx=await setup(fixture,browser);
  try{
    const receipt=ctx.service.store.put({action_id:randomUUID(),account_uid:'42',bvid:BVID,title:'Synthetic retained receipt',target:{kind:'watch_later'},status:'pending_verification',created_at:'2025-01-01T00:00:00.000Z',updated_at:'2025-01-01T00:00:00.000Z'});
    assert.equal((await ctx.action('read',{video:BVID,limit:2})).status,200);
    assert.equal(browser.sessions,1);assert.equal(browser.active,true);
    const released=await ctx.action('disconnect');
    assert.equal(released.status,200);assert.equal((await released.json()).data.released,true);
    assert.equal(browser.closeCount,1);assert.equal(browser.active,false);
    const offline=await ctx.get('/api/status');assert.equal(offline.status,200);assert.equal((await offline.json()).data.account_bound,true);
    const tasks=await (await ctx.get('/api/tasks')).json();
    assert.ok(tasks.data.some((task:any)=>task.operation==='read'&&task.status==='completed'));
    assert.ok(tasks.data.some((task:any)=>task.operation==='disconnect'&&task.status==='completed'));
    const receipts=await ctx.get('/api/receipts');assert.equal(receipts.status,200);
    assert.equal((await receipts.json()).data[0].action_id,receipt.action_id,'disconnect must not close SQLite or delete saved receipts');
    const reread=await ctx.action('read',{video:BVID,limit:2});assert.equal(reread.status,200);
    assert.equal((await reread.json()).data.cues.length,2);
    assert.equal(browser.sessions,2);assert.equal(browser.active,true,'the persistent service must be able to open another browser session');
    assert.equal(fixture.writes,0);assert.equal(fixture.requests.filter(request=>request.method==='POST').length,0);
  }finally{await ctx.close();}
});

test('disconnect rejects PID, path, force and profile parameters before touching the browser',async()=>{
  const fixture=new BiliFixture(),browser=new ReconnectingBrowser(fixture),ctx=await setup(fixture,browser);
  try{
    for(const args of [{pid:process.pid},{path:'C:\\synthetic-profile'},{force:true},{profile:'synthetic-profile'}]){
      const response=await ctx.action('disconnect',args);
      assert.equal(response.status,400);assert.equal((await response.json()).error.code,'INVALID_INPUT');
    }
    assert.equal(browser.closeCount,0);assert.equal(fixture.requests.length,0);
    assert.equal(ctx.activity.recent().length,0);
  }finally{await ctx.close();}
});

test('disconnect waits for active browser work instead of closing a session underneath it',async()=>{
  let release!:()=>void,entered!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
  class GatedSearch extends BiliFixture {
    override async fetch(input:string|URL,init:RequestInit={}){
      if(new URL(String(input)).pathname==='/x/web-interface/wbi/search/type'){entered();await gate;}
      return super.fetch(input,init);
    }
  }
  const fixture=new GatedSearch(),browser=new ReconnectingBrowser(fixture),ctx=await setup(fixture,browser);
  let search:Promise<Response>|undefined,disconnect:Promise<Response>|undefined;
  try{
    search=ctx.action('search',{keyword:'fixture blocking work'});await started;
    disconnect=ctx.action('disconnect');
    for(let i=0;i<30&&!ctx.activity.recent().some(task=>task.operation==='disconnect');i++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(ctx.activity.recent().find(task=>task.operation==='disconnect')?.status,'queued');
    assert.equal(browser.closeCount,0,'a queued release may not interrupt the active operation');
    release();assert.equal((await search).status,200);assert.equal((await disconnect).status,200);
    assert.equal(browser.closeCount,1);assert.equal(fixture.writes,0);
  }finally{release();await Promise.allSettled([search,disconnect].filter((item):item is Promise<Response>=>Boolean(item)));await ctx.close();}
});

test('a long action remains visible with its stage while a second action is queued',async()=>{
  let entered!:()=>void,release!:()=>void;
  const started=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  class SlowSearch extends BiliFixture {
    override async fetch(input:string|URL,init:RequestInit={}){
      if(new URL(String(input)).pathname==='/x/web-interface/wbi/search/type'){entered();await gate;}
      return super.fetch(input,init);
    }
  }
  const ctx=await setup(new SlowSearch());try{
    const first=ctx.action('search',{keyword:'sensitive fixture topic'});await started;
    const second=ctx.action('read',{video:BVID,limit:1});
    // Wait until the local HTTP handler has accepted the second request.
    for(let i=0;i<20&&ctx.activity.recent().length<2;i++)await new Promise(resolve=>setTimeout(resolve,5));
    const pending=await (await ctx.get('/api/tasks')).json();
    assert.equal(pending.data.find((t:any)=>t.operation==='search').status,'running');
    assert.equal(pending.data.find((t:any)=>t.operation==='read').status,'queued');
    assert.ok(!JSON.stringify(pending).includes('sensitive fixture topic'));
    release();assert.equal((await first).status,200);assert.equal((await second).status,200);
    const tasks=await (await ctx.get('/api/tasks')).json();assert.ok(tasks.data.every((t:any)=>t.status==='completed'));
    const bad=await ctx.action('read',{video:'https://attacker.invalid/video/'+BVID});
    assert.equal(bad.status,400);
    const failed=await (await ctx.get('/api/tasks')).json();assert.equal(failed.data[0].status,'failed');assert.ok(failed.data[0].error.code);
  }finally{release();await ctx.close();}
});

test('the pending limit also applies when many requests start with incomplete bodies',async()=>{
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  class GatedSearch extends BiliFixture {
    override async fetch(input:string|URL,init:RequestInit={}){
      if(new URL(String(input)).pathname==='/x/web-interface/wbi/search/type')await gate;
      return super.fetch(input,init);
    }
  }
  const ctx=await setup(new GatedSearch());
  const open:{request:http.ClientRequest;remaining:Buffer;result:Promise<number|undefined>}[]=[];
  const completed:number[]=[];
  try{
    for(let i=0;i<17;i++){
      const body=Buffer.from(JSON.stringify({action:'search',args:{keyword:'fixture '+i}}));
      const split=Math.floor(body.length/2);
      let request!:http.ClientRequest;
      const result=new Promise<number|undefined>((resolve,reject)=>{
        request=http.request(ctx.dashboard.origin+'/api/action',{method:'POST',headers:{Authorization:'Bearer '+ctx.dashboard.token,'Content-Type':'application/json','Content-Length':body.length}},response=>{
          response.resume();response.on('end',()=>{completed.push(response.statusCode!);resolve(response.statusCode);});
        });request.on('error',reject);request.flushHeaders();request.write(body.subarray(0,split));
      });
      open.push({request,remaining:body.subarray(split),result});
    }
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.equal(ctx.activity.recent().length,0,'partial JSON is not an accepted task');
    for(const item of open)item.request.end(item.remaining);
    for(let i=0;i<50&&!completed.includes(429)&&ctx.activity.recent().length<17;i++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.ok(ctx.activity.recent().length<=16,'the server must recheck capacity after reading each body');
    assert.ok(completed.includes(429),'excess work must be rejected rather than silently queued');
    release();const statuses=await Promise.all(open.map(item=>item.result));
    assert.equal(statuses.filter(status=>status===200).length,16);
    assert.equal(statuses.filter(status=>status===429).length,1);
  }finally{release();for(const item of open)if(!item.request.writableEnded)item.request.end(item.remaining);await Promise.allSettled(open.map(item=>item.result));await ctx.close();}
});

test('dashboard discovery checks a live authenticated server and shutdown removes its registry',async()=>{
  const ctx=await setup();try{
    assert.equal(await existingDashboard(ctx.root),ctx.dashboard.url);
    const registry=path.join(ctx.root,'dashboard.json');assert.equal(fs.existsSync(registry),true);
    await ctx.dashboard.close();
    assert.equal(fs.existsSync(registry),false);assert.equal(await existingDashboard(ctx.root),undefined);
  }finally{await ctx.close();}
});
