import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {BiliFixture,FixtureBrowser,BVID} from './fixture.js';
import {BrowserBilibili} from '../src/bilibili/platform.js';
import {BiliService} from '../src/service.js';
import {ReceiptStore} from '../src/store.js';
import {defaultConfig} from '../src/config.js';

function setup(fixture=new BiliFixture()){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'bili-agent-safety-'));
  const platform=new BrowserBilibili(new FixtureBrowser(fixture));
  const config={...defaultConfig(),expected_uid:'42'};
  const store=new ReceiptStore(root);
  const service=new BiliService(platform,store,()=>config,root,[0,0]);
  return{fixture,platform,config,store,service,async close(){await service.close();fs.rmSync(root,{recursive:true,force:true});}};
}
const posts=(fixture:BiliFixture)=>fixture.requests.filter(r=>r.method==='POST');

test('account change after membership read is caught at the write boundary',async()=>{
  class SwitchAfterRead extends BiliFixture {
    override async fetch(input:string|URL,init:RequestInit={}){
      const response=await super.fetch(input,init);
      if(new URL(String(input)).pathname==='/x/v2/history/toview')this.uid='99';
      return response;
    }
  }
  const t=setup(new SwitchAfterRead());try{
    const result=await t.service.save({videos:[BVID]});
    assert.equal(posts(t.fixture).length,0,'no POST may escape after the account switches');
    assert.equal(result.all_verified,false);
    assert.equal(result.receipts[0]?.error_code,'ACCOUNT_MISMATCH');
  }finally{await t.close();}
});

test('folder ownership is rechecked just before POST, even after a successful membership read',async()=>{
  class RemovedFolder extends BiliFixture {
    override async fetch(input:string|URL,init:RequestInit={}){
      const url=new URL(String(input));
      if(url.pathname==='/x/v3/fav/folder/created/list-all'&&url.searchParams.get('rid')==='0'){
        this.requests.push({url:url.href,method:init.method??'GET'});
        return new Response(JSON.stringify({code:0,data:{count:0,list:[]}}));
      }
      return super.fetch(input,init);
    }
  }
  const t=setup(new RemovedFolder());try{
    const result=await t.service.save({videos:[BVID],targets:[{kind:'favorite',folder_id:'900'}]});
    assert.equal(posts(t.fixture).length,0);
    assert.equal(result.receipts[0]?.status,'failed');
    assert.equal(result.receipts[0]?.error_code,'FOLDER_NOT_OWNED');
    assert.equal(result.all_verified,false);
  }finally{await t.close();}
});

test('warming public metadata never caches write authorization or folder membership',async()=>{
  const t=setup();try{
    const video=await t.platform.video(BVID);
    await t.platform.account();
    await t.platform.contains(video,{kind:'watch_later'},'42');
    t.fixture.uid='99';
    await assert.rejects(t.platform.add(video,{kind:'watch_later'},'42'),{code:'ACCOUNT_MISMATCH'});
    assert.equal(posts(t.fixture).length,0);
    t.fixture.uid='42';
    assert.equal(await t.platform.contains(video,{kind:'watch_later'},'42'),false);
    t.fixture.toview.add(video.aid);
    assert.equal(await t.platform.contains(video,{kind:'watch_later'},'42'),true);
  }finally{await t.close();}
});

test('duplicate video references and targets only issue add-only POSTs once per target',async()=>{
  const t=setup();try{
    const result=await t.service.save({videos:[BVID,`https://www.bilibili.com/video/${BVID}/?p=2`,BVID],targets:[{kind:'watch_later'},{kind:'watch_later'},{kind:'favorite',folder_id:'900'},{kind:'favorite',folder_id:'900'}]});
    assert.equal(result.receipts.length,2);
    assert.equal(posts(t.fixture).length,2);
    for(const request of posts(t.fixture)){
      const url=new URL(request.url),form=new URLSearchParams(request.body);
      assert.ok(['/x/v2/history/toview/add','/x/v3/fav/resource/deal'].includes(url.pathname));
      assert.equal(form.has('del_media_ids'),false);
      assert.equal(form.has('delete'),false);
    }
    await t.service.save({videos:[BVID],targets:[{kind:'watch_later'},{kind:'favorite',folder_id:'900'}]});
    assert.equal(posts(t.fixture).length,2,'already present items must never be toggled off');
  }finally{await t.close();}
});

test('receipt reconciliation is read-only and rejects receipts owned by a different bound account',async()=>{
  const t=setup();try{
    t.fixture.delayVisibility=100;
    const first=await t.service.save({videos:[BVID]});
    const id=first.receipts[0]!.action_id;
    assert.equal(first.receipts[0]!.status,'pending_verification');
    await t.service.verifyReceipt(id);
    assert.equal(posts(t.fixture).length,1);
    t.fixture.uid='99';t.config.expected_uid='99';
    await assert.rejects(t.service.verifyReceipt(id),{code:'ACCOUNT_MISMATCH'});
    assert.equal(posts(t.fixture).length,1);
  }finally{await t.close();}
});

test('gateway failures or malformed success responses after a commit stay uncertain and are never resent by default',async(t)=>{
  for(const outcome of ['http-500','http-502','missing-code','invalid-json'])await t.test(outcome,async()=>{
    class GatewayFailure extends BiliFixture {
      override async fetch(input:string|URL,init:RequestInit={}){
        const response=await super.fetch(input,init);
        if(init.method!=='POST')return response;
        if(outcome.startsWith('http-'))return new Response('',{status:Number(outcome.slice(5))});
        return new Response(outcome==='missing-code'?JSON.stringify({message:'upstream result lost'}):'not-json');
      }
    }
    const ctx=setup(new GatewayFailure());try{
      ctx.fixture.delayVisibility=100;
      const first=await ctx.service.save({videos:[BVID]});
      assert.equal(posts(ctx.fixture).length,1);
      assert.equal(first.receipts[0]?.status,'pending_verification');
      assert.equal(first.receipts[0]?.error_code,'WRITE_UNCERTAIN');
      await ctx.service.save({videos:[BVID]});
      assert.equal(posts(ctx.fixture).length,1,'an uncertain network outcome must be reconciled before retry');
    }finally{await ctx.close();}
  });
});
