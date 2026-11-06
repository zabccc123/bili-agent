import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {BiliFixture,FixtureBrowser,BVID,SECOND} from './fixture.js';
import {BrowserBilibili} from '../src/bilibili/platform.js';
import {BiliService} from '../src/service.js';
import {ReceiptStore} from '../src/store.js';
import {defaultConfig} from '../src/config.js';
import {videoRef} from '../src/resolve.js';
import {signWbi} from '../src/bilibili/wbi.js';

function setup(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'bili-agent-test-'));
  const fixture=new BiliFixture();
  const platform=new BrowserBilibili(new FixtureBrowser(fixture));
  const config={...defaultConfig(),expected_uid:'42'};
  const store=new ReceiptStore(root);
  const service=new BiliService(platform,store,()=>config,root,[0,0,0]);
  return{root,fixture,platform,config,store,service,async close(){await service.close();fs.rmSync(root,{recursive:true,force:true});}};
}
test('URL selection retains P and rejects foreign domains',()=>{
  assert.equal(videoRef(`https://www.bilibili.com/video/${BVID}/?p=2`).part,2);
  assert.equal(videoRef(`https://www.bilibili.com/video/${BVID}/?p=2`,3).part,3);
  assert.throws(()=>videoRef(`https://www.bilibili.com.evil.test/video/${BVID}/`));
  assert.throws(()=>videoRef(`https://www.bilibili.com/video/${BVID}/?p=0`));
});
test('WBI agrees with a published reference vector',()=>{
  const query=signWbi({foo:'114',bar:'514',zab:1919810},'7cd084941338484aae1ad9425b84077c','4932caff0ff746eab6f01bf08b70ac45',1702204169);
  assert.equal(query.get('w_rid'),'8f6f2b5b3d485fe1886cec6a0be8c5d4');
});
test('search candidates are not saved; metadata and transcript preserve P2 evidence',async()=>{
  const t=setup();try{
    const search=await t.platform.search('测试',1,5);
    assert.equal(search.videos.length,2);assert.equal(t.fixture.writes,0);
    const transcript=await t.platform.transcript(`https://www.bilibili.com/video/${BVID}/?p=2`,{limit:2});
    assert.equal(transcript.video.cid,'201');assert.equal(transcript.data_source,'ai_subtitle');
    assert.equal(transcript.coverage.truncated,true);assert.equal(transcript.coverage.next_start_seconds,8);
    assert.equal(transcript.coverage.end_seconds,8);assert.equal(transcript.coverage.requested_end_seconds,20);
    assert.equal(transcript.coverage.visuals_analyzed,false);assert.match(transcript.cues[0]!.url,/p=2&t=0/);
    assert.ok(t.fixture.requests.find(r=>new URL(r.url).pathname==='/x/player/wbi/v2'&&new URL(r.url).searchParams.get('cid')==='201'));
  }finally{await t.close();}
});
test('saving only the final set deduplicates videos and returns verified target receipts',async()=>{
  const t=setup();try{
    await t.platform.search('topic',1,5);
    const saved=await t.service.save({videos:[BVID,BVID],targets:[{kind:'watch_later'},{kind:'favorite',folder_id:'900'}]});
    assert.equal(t.fixture.writes,2);assert.equal(saved.receipts.length,2);assert.equal(saved.all_verified,true);
    const again=await t.service.save({videos:[BVID],targets:[{kind:'watch_later'},{kind:'favorite',folder_id:'900'}]});
    assert.equal(t.fixture.writes,2);assert.ok(again.receipts.every(r=>r.status==='already_present'));
    assert.equal(t.fixture.toview.has('101'),false);assert.equal(t.fixture.favorites.has('101'),false);
  }finally{await t.close();}
});
test('preview does not write or create action receipts',async()=>{
  const t=setup();try{
    const result=await t.service.save({videos:[BVID],preview:true});
    assert.equal(result.planned!.length,1);assert.equal(t.fixture.writes,0);assert.equal(t.store.recent().length,0);
  }finally{await t.close();}
});
test('account switch and wrong folder prevent POST requests',async()=>{
  const t=setup();try{
    t.fixture.uid='99';await assert.rejects(t.service.save({videos:[BVID]}),{code:'ACCOUNT_MISMATCH'});
    t.fixture.uid='42';const result=await t.service.save({videos:[BVID],targets:[{kind:'favorite',folder_id:'901'}]});
    assert.equal(result.errors[0]!.error.code,'FOLDER_NOT_OWNED');assert.equal(t.fixture.writes,0);
  }finally{await t.close();}
});
test('lost POST response is reconciled by reading, without resending',async()=>{
  const t=setup();try{
    t.fixture.loseWriteResponse=true;
    const saved=await t.service.save({videos:[BVID]});
    assert.equal(saved.receipts[0]!.status,'saved');assert.equal(t.fixture.writes,1);
    await t.service.save({videos:[BVID]});assert.equal(t.fixture.writes,1);
  }finally{await t.close();}
});
test('unconfirmed result survives database reopening and is not blindly submitted again',async()=>{
  const t=setup();try{
    t.fixture.delayVisibility=100;
    const first=await t.service.save({videos:[BVID]});
    assert.equal(first.receipts[0]!.status,'pending_verification');assert.equal(t.fixture.writes,1);
    const reopened=new ReceiptStore(t.root);
    assert.equal(reopened.get(first.receipts[0]!.action_id)!.status,'pending_verification');reopened.close();
    await t.service.save({videos:[BVID]});assert.equal(t.fixture.writes,1);
    t.fixture.delayVisibility=0;
    assert.equal((await t.service.verifyReceipt(first.receipts[0]!.action_id)).status,'saved');
  }finally{await t.close();}
});
test('explicit rejection stays failed and does not count as saved',async()=>{
  const t=setup();try{
    t.fixture.rejectWrites=true;
    const result=await t.service.save({videos:[SECOND]});
    assert.equal(result.receipts[0]!.status,'failed');assert.equal(result.all_verified,false);
  }finally{await t.close();}
});
