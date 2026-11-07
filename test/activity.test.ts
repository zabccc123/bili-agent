import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ActivityLog} from '../src/activity.js';
import {BiliService} from '../src/service.js';
import {BrowserBilibili} from '../src/bilibili/platform.js';
import {BiliFixture,FixtureBrowser} from './fixture.js';
import {ReceiptStore} from '../src/store.js';
import {defaultConfig} from '../src/config.js';

function setup(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'bili-agent-activity-'));
  const fixture=new BiliFixture();
  const service=new BiliService(new BrowserBilibili(new FixtureBrowser(fixture)),new ReceiptStore(root),defaultConfig,root);
  return{service,async close(){await service.close();fs.rmSync(root,{recursive:true,force:true});}};
}

test('queued and running tasks are immediately observable and serialize on the shared session',async()=>{
  const ctx=setup(),activity=new ActivityLog();
  let release!:()=>void,started!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const entered=new Promise<void>(resolve=>{started=resolve;});
  try{
    const first=activity.run(ctx.service,'read',async()=>{activity.stage('loading_transcript');started();await gate;return 'first';});
    await entered;
    let secondStarted=false;
    const second=activity.run(ctx.service,'search',async()=>{secondStarted=true;return 'second';});
    const pending=activity.recent();
    assert.equal(pending.find(t=>t.operation==='read')!.status,'running');
    assert.equal(pending.find(t=>t.operation==='read')!.stage,'loading_transcript');
    assert.equal(pending.find(t=>t.operation==='search')!.status,'queued');
    assert.equal(secondStarted,false);
    release();assert.deepEqual(await Promise.all([first,second]),['first','second']);
    const complete=activity.recent();
    assert.ok(complete.every(t=>t.status==='completed'&&t.finished_at&&t.elapsed_ms>=0));
    assert.ok(complete.find(t=>t.operation==='read')!.stages.some(s=>s.stage==='loading_transcript'));
    complete[0]!.stages[0]!.stage='local mutation';
    assert.notEqual(activity.recent()[0]!.stages[0]!.stage,'local mutation');
  }finally{release();await ctx.close();}
});

test('failed tasks retain a public error without leaking arbitrary exception details',async()=>{
  const ctx=setup(),activity=new ActivityLog();
  try{
    await assert.rejects(activity.run(ctx.service,'read',async()=>{throw new Error('SESSDATA=synthetic-private signed-url-secret');}));
    const task=activity.recent()[0]!;
    assert.equal(task.status,'failed');assert.equal(task.stage,'failed');assert.ok(task.finished_at);
    assert.equal(task.error?.code,'UNEXPECTED_ERROR');
    assert.ok(!JSON.stringify(task).includes('synthetic-private'));
    await activity.run(ctx.service,'search',async()=>true);
    assert.equal(activity.recent()[0]!.status,'completed','a failed operation must not poison the queue');
  }finally{await ctx.close();}
});

test('completed task history is bounded without dropping queued or running work',async()=>{
  const ctx=setup(),activity=new ActivityLog(2);
  try{
    for(let i=0;i<6;i++)await activity.run(ctx.service,'search',async()=>i);
    assert.equal(activity.recent().length,2);
    let release!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve;});
    const jobs=[activity.run(ctx.service,'read',()=>gate),activity.run(ctx.service,'read',async()=>1),activity.run(ctx.service,'read',async()=>2)];
    assert.equal(activity.recent().filter(t=>['queued','running'].includes(t.status)).length,3);
    release();await Promise.all(jobs);
    await activity.run(ctx.service,'search',async()=>true);
    assert.equal(activity.recent().length,2);
  }finally{await ctx.close();}
});
