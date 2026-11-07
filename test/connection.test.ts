import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {connectAccount} from '../src/connection.js';
import {defaultConfig,readConfig,writeConfig,configPath} from '../src/config.js';
import {BrowserBilibili} from '../src/bilibili/platform.js';
import {BiliFixture,FixtureBrowser} from './fixture.js';
import type {Config} from '../src/types.js';
import {startDashboard} from '../src/dashboard.js';
import {ActivityLog} from '../src/activity.js';
import {BiliService} from '../src/service.js';
import {ReceiptStore} from '../src/store.js';

class HookFixture extends BiliFixture {
  afterResponse?: (url:URL)=>void;
  override async fetch(input:string|URL,init:RequestInit={}){
    const response=await super.fetch(input,init);this.afterResponse?.(new URL(String(input)));return response;
  }
}
function setup(config:Config|undefined=defaultConfig()){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'bili-agent-connect-'));
  if(config)writeConfig(config,root);
  const fixture=new HookFixture(),browser=new FixtureBrowser(fixture),platform=new BrowserBilibili(browser);
  const connect=()=>connectAccount(root,browser,platform);
  return{root,fixture,connect,async close(){assert.equal(fixture.writes,0,'connecting must never write to Bilibili');await platform.close();fs.rmSync(root,{recursive:true,force:true});}};
}
function afterFirstAccount(ctx:ReturnType<typeof setup>,change:()=>void){
  let done=false;
  ctx.fixture.afterResponse=url=>{if(!done&&url.pathname==='/x/web-interface/nav'){done=true;change();}};
}

test('logged-out connection returns pending promptly without creating an account binding',async()=>{
  const ctx=setup();try{
    fs.unlinkSync(configPath(ctx.root));ctx.fixture.loggedIn=false;
    const result=await ctx.connect();
    assert.equal(result.login_pending,true);assert.equal(result.logged_in,false);assert.equal(result.account_bound,false);
    assert.equal(fs.existsSync(configPath(ctx.root)),false);
    assert.equal(ctx.fixture.requests.filter(r=>new URL(r.url).pathname==='/x/web-interface/nav').length,1,'pending connection must not poll in a long blocking loop');
  }finally{await ctx.close();}
});

test('an unbound logged-in session is verified twice before adding only its UID to local config',async()=>{
  const ctx=setup({...defaultConfig(),auto_save:false,max_save_batch:4});try{
    const result=await ctx.connect();
    assert.equal(result.login_pending,false);assert.equal(result.logged_in,true);assert.equal(result.account_bound,true);assert.equal(result.account_matches,true);
    const config=readConfig(ctx.root);assert.equal(config.expected_uid,'42');assert.equal(config.auto_save,false);assert.equal(config.max_save_batch,4);
    assert.ok(ctx.fixture.requests.filter(r=>new URL(r.url).pathname==='/x/web-interface/nav').length>=2,'binding must check the current account again at the commit boundary');
    assert.ok(!JSON.stringify(result).includes('"uid"'),'public connect result need not expose the UID');
  }finally{await ctx.close();}
});

test('connecting a different account rejects without replacing an existing binding or preferences',async()=>{
  const config={...defaultConfig(),expected_uid:'99',auto_save:false};
  const ctx=setup(config);try{
    const before=fs.readFileSync(configPath(ctx.root),'utf8');
    await assert.rejects(ctx.connect(),{code:'ACCOUNT_MISMATCH'});
    assert.equal(fs.readFileSync(configPath(ctx.root),'utf8'),before);
  }finally{await ctx.close();}
});

test('reconnecting the same bound account does not rewrite its configuration',async()=>{
  const ctx=setup({...defaultConfig(),expected_uid:'42',auto_save:false});try{
    const before=fs.readFileSync(configPath(ctx.root),'utf8');
    const result=await ctx.connect();
    assert.equal(result.account_matches,true);assert.equal(result.account_bound,true);
    assert.equal(fs.readFileSync(configPath(ctx.root),'utf8'),before);
    assert.equal(ctx.fixture.requests.filter(r=>new URL(r.url).pathname==='/x/web-interface/nav').length,1);
  }finally{await ctx.close();}
});

test('a configured favorite folder must belong to the session before it can be bound',async()=>{
  const ctx=setup({...defaultConfig(),default_targets:[{kind:'favorite',folder_id:'901'}]});try{
    await assert.rejects(ctx.connect(),{code:'FOLDER_NOT_OWNED'});
    assert.equal(readConfig(ctx.root).expected_uid,undefined);
    assert.ok(ctx.fixture.requests.some(r=>new URL(r.url).pathname==='/x/v3/fav/folder/created/list-all'));
  }finally{await ctx.close();}
});

test('a session switching UID or logging out during connection cannot commit the first observed identity',async()=>{
  for(const kind of ['switch','logout']){
    const ctx=setup();try{
      afterFirstAccount(ctx,()=>{if(kind==='switch')ctx.fixture.uid='99';else ctx.fixture.loggedIn=false;});
      if(kind==='switch')await assert.rejects(ctx.connect(),{code:'ACCOUNT_MISMATCH'});
      else{const result=await ctx.connect();assert.equal(result.login_pending,true);assert.equal(result.logged_in,false);}
      assert.equal(readConfig(ctx.root).expected_uid,undefined);
    }finally{await ctx.close();}
  }
});

test('preference changes made while connection awaits the browser survive the new binding',async()=>{
  const ctx=setup();try{
    afterFirstAccount(ctx,()=>writeConfig({...readConfig(ctx.root),auto_save:false,max_save_batch:3,default_targets:[{kind:'favorite',folder_id:'900'}]},ctx.root));
    await ctx.connect();
    const config=readConfig(ctx.root);
    assert.equal(config.expected_uid,'42');assert.equal(config.auto_save,false);assert.equal(config.max_save_batch,3);
    assert.deepEqual(config.default_targets,[{kind:'favorite',folder_id:'900'}]);
    assert.ok(ctx.fixture.requests.some(r=>new URL(r.url).pathname==='/x/v3/fav/folder/created/list-all'),'a newly selected favorite also requires ownership validation');
  }finally{await ctx.close();}
});

test('a favorite selected during connection is rejected when it is not owned',async()=>{
  const ctx=setup();try{
    afterFirstAccount(ctx,()=>writeConfig({...readConfig(ctx.root),default_targets:[{kind:'favorite',folder_id:'901'}]},ctx.root));
    await assert.rejects(ctx.connect(),{code:'FOLDER_NOT_OWNED'});
    assert.equal(readConfig(ctx.root).expected_uid,undefined);
    assert.deepEqual(readConfig(ctx.root).default_targets,[{kind:'favorite',folder_id:'901'}]);
  }finally{await ctx.close();}
});

test('a favorite added at the final account check is validated in a second pass before binding',async()=>{
  const ctx=setup();try{
    let navs=0;
    ctx.fixture.afterResponse=url=>{
      if(url.pathname==='/x/web-interface/nav'&&++navs===2)writeConfig({...readConfig(ctx.root),default_targets:[{kind:'favorite',folder_id:'900'}],max_save_batch:2},ctx.root);
    };
    await ctx.connect();
    const config=readConfig(ctx.root);
    assert.equal(config.expected_uid,'42');assert.equal(config.max_save_batch,2);
    assert.deepEqual(config.default_targets,[{kind:'favorite',folder_id:'900'}]);
    const requests=ctx.fixture.requests.map(r=>new URL(r.url).pathname);
    const folderIndex=requests.indexOf('/x/v3/fav/folder/created/list-all');
    assert.ok(folderIndex>=0);
    assert.ok(requests.slice(folderIndex+1).includes('/x/web-interface/nav'),'identity must be checked again after folder ownership');
  }finally{await ctx.close();}
});

test('another binding or browser configuration written during connection cannot be overwritten',async()=>{
  for(const kind of ['binding','browser']){
    const ctx=setup();try{
      afterFirstAccount(ctx,()=>writeConfig({...readConfig(ctx.root),...(kind==='binding'?{expected_uid:'99'}:{browser_mode:'extension'})},ctx.root));
      await assert.rejects(ctx.connect(),{code:kind==='binding'?'ACCOUNT_MISMATCH':'CONFIG_CHANGED'});
      const config=readConfig(ctx.root);
      if(kind==='binding')assert.equal(config.expected_uid,'99');
      else{assert.equal(config.browser_mode,'extension');assert.equal(config.expected_uid,undefined);}
    }finally{await ctx.close();}
  }
});

test('dashboard connection supports pending, binding and reconnect while check alone never binds',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'bili-agent-connect-http-'));
  writeConfig(defaultConfig(),root);
  const fixture=new BiliFixture(),browser=new FixtureBrowser(fixture),activity=new ActivityLog();
  const platform=new BrowserBilibili(browser,{onStage:stage=>activity.stage(stage)});
  const service=new BiliService(platform,new ReceiptStore(root),()=>readConfig(root),root,[0]);
  const dashboard=await startDashboard({service,browser,activity,root});
  const action=async(action:string,args:unknown={})=>{
    const response=await fetch(dashboard.origin+'/api/action',{method:'POST',headers:{Authorization:'Bearer '+dashboard.token,'Content-Type':'application/json'},body:JSON.stringify({action,args})});
    return{status:response.status,body:await response.json()};
  };
  try{
    const initial=fs.readFileSync(configPath(root),'utf8');
    const invalid=await action('connect',{rebind:true});assert.equal(invalid.status,400);assert.equal(invalid.body.error.code,'INVALID_INPUT');
    const checked=await action('check');assert.equal(checked.body.data.logged_in,true);assert.equal(checked.body.data.account_bound,false);
    assert.equal(readConfig(root).expected_uid,undefined,'checking login must not quietly bind a previously unbound account');
    fixture.loggedIn=false;
    const pending=await action('connect');assert.equal(pending.status,200);assert.equal(pending.body.data.login_pending,true);
    assert.equal(fs.readFileSync(configPath(root),'utf8'),initial);
    const task=activity.recent().find(task=>task.operation==='connect')!;
    assert.equal(task.status,'completed');assert.ok(task.stages.some(stage=>stage.stage==='opening_browser'));
    fixture.loggedIn=true;
    const connected=await action('connect');assert.equal(connected.body.data.account_matches,true);assert.equal(readConfig(root).expected_uid,'42');
    const bound=fs.readFileSync(configPath(root),'utf8');
    assert.equal((await action('connect')).body.data.account_matches,true);assert.equal(fs.readFileSync(configPath(root),'utf8'),bound);
    fixture.uid='99';
    const mismatch=await action('connect');assert.equal(mismatch.status,400);assert.equal(mismatch.body.error.code,'ACCOUNT_MISMATCH');
    assert.equal(readConfig(root).expected_uid,'42');assert.equal(fixture.writes,0);
  }finally{await dashboard.close();await service.close();fs.rmSync(root,{recursive:true,force:true});}
});
