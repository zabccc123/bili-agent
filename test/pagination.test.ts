import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BiliFixture,FixtureBrowser,BVID,SECOND} from './fixture.js';
import {BrowserBilibili} from '../src/bilibili/platform.js';
import type {Transcript} from '../src/types.js';

class OverlapFixture extends BiliFixture {
  language='zh-CN';
  noSubtitles=false;
  content=[{from:0,to:10,content:'long overlapping cue'},{from:0,to:3,content:'same start cue'},{from:2,to:6,content:'middle cue'},{from:6,to:8,content:'final cue'}];
  override async fetch(input:string|URL,init:RequestInit={}){
    const url=new URL(String(input));
    if(url.pathname==='/x/player/wbi/v2'){
      this.requests.push({url:url.href,method:init.method??'GET'});
      return new Response(JSON.stringify({code:0,data:{subtitle:{subtitles:this.noSubtitles?[]:[{lan:this.language,subtitle_url:'https://aisubtitle.hdslb.com/bfs/subtitle/overlap.json'}]}}}));
    }
    if(url.hostname==='aisubtitle.hdslb.com'){
      this.requests.push({url:url.href,method:init.method??'GET'});
      return new Response(JSON.stringify({body:this.content}));
    }
    return super.fetch(input,init);
  }
}

test('opaque cursor returns overlapping and equal-start cues exactly once and terminates at every page size',async()=>{
  for(const limit of [1,2,3]){
    const fixture=new OverlapFixture(),platform=new BrowserBilibili(new FixtureBrowser(fixture),()=>0);
    const full=await platform.transcript(BVID,{limit:50});
    const seen:string[]=[];
    const cursors=new Set<string>();
    let page:Transcript=await platform.transcript(BVID,{limit});
    for(let i=0;;i++){
      assert.ok(i<10,'pagination must terminate rather than repeat a timestamp forever');
      seen.push(...page.cues.map(c=>c.text));
      assert.equal(page.coverage.total_cues,full.cues.length);
      assert.equal(page.coverage.visuals_analyzed,false);
      if(!page.coverage.truncated){assert.equal(page.coverage.next_cursor,undefined);break;}
      const cursor=page.coverage.next_cursor;
      assert.ok(cursor);assert.equal(cursors.has(cursor),false,'each continuation must advance');cursors.add(cursor);
      page=await platform.transcript(BVID,{cursor,limit});
    }
    assert.deepEqual(seen,Array.from(full.cues,c=>c.text));
    assert.equal(fixture.requests.filter(r=>new URL(r.url).hostname==='aisubtitle.hdslb.com').length,1);
    await platform.close();
  }
});

test('cursor remains bound to its video, selected part, and requested time window',async()=>{
  const fixture=new OverlapFixture(),platform=new BrowserBilibili(new FixtureBrowser(fixture),()=>0);
  const first=await platform.transcript(`https://www.bilibili.com/video/${BVID}/?p=2`,{start:1,end:7,limit:1});
  const cursor=first.coverage.next_cursor;assert.ok(cursor);
  const next=await platform.transcript(BVID,{part:2,cursor,limit:2});
  assert.equal(next.video.cid,'201');
  assert.equal(next.coverage.requested_start_seconds,1);assert.equal(next.coverage.requested_end_seconds,7);
  await assert.rejects(platform.transcript(BVID,{part:1,cursor,limit:1}),{code:'CURSOR_EXPIRED'});
  await assert.rejects(platform.transcript(SECOND,{part:2,cursor,limit:1}),{code:'CURSOR_EXPIRED'});
  await assert.rejects(platform.transcript(BVID,{part:2,start:0,cursor,limit:1}),{code:'CURSOR_EXPIRED'});
  await assert.rejects(platform.transcript(BVID,{part:2,end:8,cursor,limit:1}),{code:'CURSOR_EXPIRED'});
  await platform.close();
});

test('content or language changes invalidate an old cursor after refresh instead of silently skipping cues',async()=>{
  let now=0;
  const fixture=new OverlapFixture(),platform=new BrowserBilibili(new FixtureBrowser(fixture),()=>now);
  const first=await platform.transcript(BVID,{limit:1});
  fixture.content.unshift({from:0,to:1,content:'new inserted cue'});now=300001;
  await assert.rejects(platform.transcript(BVID,{cursor:first.coverage.next_cursor,limit:1}),{code:'CURSOR_EXPIRED'});
  const fresh=await platform.transcript(BVID,{limit:1});
  assert.equal(fresh.cues[0]!.text,'new inserted cue');
  fixture.language='en';now+=300001;
  await assert.rejects(platform.transcript(BVID,{cursor:fresh.coverage.next_cursor,limit:1}),{code:'CURSOR_EXPIRED'});
  await platform.close();
});

test('malformed cursor is rejected before browser access and offset tampering cannot escape the document',async()=>{
  const fixture=new OverlapFixture(),platform=new BrowserBilibili(new FixtureBrowser(fixture),()=>0);
  for(const cursor of ['not-json','a'.repeat(2049),'https://example.test/?token=private']){
    await assert.rejects(platform.transcript(BVID,{cursor,limit:1}),{code:'INVALID_CURSOR'});
  }
  assert.equal(fixture.requests.length,0);
  const first=await platform.transcript(BVID,{limit:1});
  const cursor=JSON.parse(Buffer.from(first.coverage.next_cursor!,'base64url').toString());
  cursor.offset=10000;
  await assert.rejects(platform.transcript(BVID,{cursor:Buffer.from(JSON.stringify(cursor)).toString('base64url'),limit:1}),{code:'INVALID_CURSOR'});
  await platform.close();
});

test('absent subtitles remain a failed content read and do not become cached success',async()=>{
  const fixture=new OverlapFixture(),platform=new BrowserBilibili(new FixtureBrowser(fixture),()=>0);
  fixture.noSubtitles=true;
  await assert.rejects(platform.transcript(BVID,{limit:1}),{code:'SUBTITLE_UNAVAILABLE'});
  fixture.noSubtitles=false;
  const recovered=await platform.transcript(BVID,{limit:1});
  assert.equal(recovered.coverage.visuals_analyzed,false);
  assert.equal(recovered.coverage.returned_cues,1);
  assert.equal(recovered.coverage.truncated,true);
  await platform.close();
});
