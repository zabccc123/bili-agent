import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BiliFixture,FixtureBrowser,BVID,SECOND} from './fixture.js';
import {BrowserBilibili} from '../src/bilibili/platform.js';

/** Synthetic responses make request counts deterministic; no browser, account or network is used. */
class ReadingFixture extends BiliFixture {
  title='Original title';
  language='zh-CN';
  subtitleFailures=0;
  metadataFailures=0;
  override async fetch(input:string|URL,init:RequestInit={}){
    const url=new URL(String(input));
    if(url.pathname==='/x/player/wbi/v2'){
      this.requests.push({url:url.href,method:init.method??'GET'});
      return new Response(JSON.stringify({code:0,data:{subtitle:{subtitles:[{lan:this.language,subtitle_url:`https://aisubtitle.hdslb.com/bfs/subtitle/${url.searchParams.get('cid')}-${this.language}.json`}]}}}));
    }
    if(url.hostname==='aisubtitle.hdslb.com'){
      this.requests.push({url:url.href,method:init.method??'GET'});
      if(this.subtitleFailures-->0)return new Response('',{status:503});
      const marker=`${this.uid}:${url.pathname}`;
      return new Response(JSON.stringify({body:[{from:0,to:3,content:marker+':first'},{from:3,to:8,content:marker+':second'},{from:8,to:12,content:marker+':third'}]}));
    }
    const response=await super.fetch(input,init);
    if(url.pathname==='/x/web-interface/wbi/view'){
      if(this.metadataFailures-->0)return new Response(JSON.stringify({code:-403,data:{}}));
      const body=await response.json();body.data.title=this.title;
      return new Response(JSON.stringify(body));
    }
    return response;
  }
  count(pathname:string){return this.requests.filter(r=>new URL(r.url).pathname===pathname).length;}
  get subtitleReads(){return this.requests.filter(r=>new URL(r.url).hostname==='aisubtitle.hdslb.com').length;}
}
const bvid=(n:number)=>'BV1'+String(n).padStart(9,'0');

test('metadata shares a bounded public cache while selecting each requested part independently',async()=>{
  let now=0;
  const fixture=new ReadingFixture();
  const platform=new BrowserBilibili(new FixtureBrowser(fixture),()=>now);
  const first=await platform.video(BVID);
  const second=await platform.video(`https://www.bilibili.com/video/${BVID}/?p=2`);
  assert.equal(first.cid,'200');assert.equal(second.cid,'201');assert.equal(second.part,2);
  assert.match(second.url,/p=2/);
  assert.equal(fixture.count('/x/web-interface/wbi/view'),1,'part changes should reuse metadata, not the selected CID');
  fixture.title='Updated title';
  assert.equal((await platform.video(BVID)).title,'Original title');
  now+=120001;
  assert.equal((await platform.video(BVID)).title,'Updated title');
  assert.equal(fixture.count('/x/web-interface/wbi/view'),2);
  assert.equal(fixture.count('/x/web-interface/nav'),1,'metadata expiry should not expire WBI keys');
  now+=30*60*1000;
  await platform.video(BVID);
  assert.equal(fixture.count('/x/web-interface/nav'),2,'expired WBI keys must be refreshed');
  await platform.close();
});

test('metadata cache evicts old entries instead of retaining unbounded video histories',async()=>{
  const fixture=new ReadingFixture();
  const platform=new BrowserBilibili(new FixtureBrowser(fixture),()=>0);
  for(let n=0;n<65;n++)await platform.video(bvid(n));
  const before=fixture.count('/x/web-interface/wbi/view');
  await platform.video(bvid(64));
  assert.equal(fixture.count('/x/web-interface/wbi/view'),before);
  await platform.video(bvid(0));
  assert.equal(fixture.count('/x/web-interface/wbi/view'),before+1);
  await platform.close();
});

test('repeated transcript windows use cached full cues and avoid repeated player and subtitle fetches',async()=>{
  const fixture=new ReadingFixture();
  const platform=new BrowserBilibili(new FixtureBrowser(fixture),()=>0);
  const first=await platform.transcript(BVID,{limit:2});
  const before=fixture.requests.length;
  const second=await platform.transcript(BVID,{start:first.coverage.next_start_seconds,limit:2});
  assert.deepEqual([...first.cues,...second.cues].map(c=>c.text.split(':').at(-1)),['first','second','third']);
  assert.equal(second.coverage.truncated,false);
  assert.equal(second.coverage.visuals_analyzed,false);
  assert.equal(fixture.count('/x/player/wbi/v2'),1);
  assert.equal(fixture.subtitleReads,1);
  assert.equal(fixture.requests.length-before,1,'only a fresh account check should be needed for a cached page');
  assert.equal(new URL(fixture.requests.at(-1)!.url).pathname,'/x/web-interface/nav');
  await platform.close();
});

test('transcript cache does not leak a previous account or a different part into a read',async()=>{
  const fixture=new ReadingFixture();
  const platform=new BrowserBilibili(new FixtureBrowser(fixture),()=>0);
  const p1=await platform.transcript(BVID,{limit:10});
  const p2=await platform.transcript(BVID,{part:2,limit:10});
  assert.match(p1.cues[0]!.text,/42:.*200/);
  assert.match(p2.cues[0]!.text,/42:.*201/);
  assert.equal(p2.video.cid,'201');assert.equal(p2.coverage.part,2);
  assert.match(p2.cues[0]!.url,/p=2/);
  fixture.uid='99';
  const otherAccount=await platform.transcript(BVID,{limit:10});
  assert.match(otherAccount.cues[0]!.text,/^99:/);
  assert.equal(fixture.subtitleReads,3);
  await platform.close();
});

test('transcript expiry refreshes the chosen language and failed subtitle reads are not cached',async()=>{
  let now=0;
  const fixture=new ReadingFixture();
  const platform=new BrowserBilibili(new FixtureBrowser(fixture),()=>now);
  fixture.subtitleFailures=1;
  await assert.rejects(platform.transcript(BVID,{limit:10}),{code:'SUBTITLE_FETCH_FAILED'});
  const recovered=await platform.transcript(BVID,{limit:10});
  assert.equal(recovered.language,'zh-CN');
  assert.equal(fixture.subtitleReads,2);
  fixture.language='en';now=300001;
  const refreshed=await platform.transcript(BVID,{limit:10});
  assert.equal(refreshed.language,'en');assert.match(refreshed.cues[0]!.text,/-en\.json/);
  assert.equal(fixture.subtitleReads,3);
  await platform.close();
});

test('transcript cache evicts old full documents after twelve entries',async()=>{
  const fixture=new ReadingFixture();
  const platform=new BrowserBilibili(new FixtureBrowser(fixture),()=>0);
  for(let n=0;n<13;n++)await platform.transcript(bvid(n),{limit:1});
  const before=fixture.subtitleReads;
  await platform.transcript(bvid(12),{limit:1});
  assert.equal(fixture.subtitleReads,before);
  await platform.transcript(bvid(0),{limit:1});
  assert.equal(fixture.subtitleReads,before+1);
  await platform.close();
});

test('metadata errors are not cached, and account checks always read the live session',async()=>{
  const fixture=new ReadingFixture();
  const platform=new BrowserBilibili(new FixtureBrowser(fixture),()=>0);
  fixture.metadataFailures=1;
  await assert.rejects(platform.video(SECOND),{code:'ACCESS_DENIED'});
  await platform.video(SECOND);
  assert.equal(fixture.count('/x/web-interface/wbi/view'),2);
  assert.equal((await platform.account()).uid,'42');
  fixture.uid='99';assert.equal((await platform.account()).uid,'99');
  fixture.loggedIn=false;assert.equal((await platform.account()).logged_in,false);
  await platform.close();
});

test('caller mutations cannot alter cached metadata parts or transcript cues',async()=>{
  const fixture=new ReadingFixture(),platform=new BrowserBilibili(new FixtureBrowser(fixture),()=>0);
  const first=await platform.video(BVID);
  first.parts[0]!.cid='unexpected';first.parts[0]!.duration=999;first.title='Changed by caller';
  const again=await platform.video(BVID);
  assert.equal(again.cid,'200');assert.equal(again.duration,12);assert.equal(again.title,'Original title');
  const transcript=await platform.transcript(BVID,{limit:1});
  const original=transcript.cues[0]!.text;transcript.cues[0]!.text='Changed by caller';transcript.cues[0]!.start=999;
  const readAgain=await platform.transcript(BVID,{limit:1});
  assert.equal(readAgain.cues[0]!.text,original);assert.equal(readAgain.cues[0]!.start,0);
  await platform.close();
});

test('logout rechecks subtitle access instead of returning the previous private document',async()=>{
  class LoginRequiredSubtitles extends ReadingFixture {
    override async fetch(input:string|URL,init:RequestInit={}){
      const url=new URL(String(input));
      if(!this.loggedIn&&url.pathname==='/x/player/wbi/v2'){
        this.requests.push({url:url.href,method:init.method??'GET'});
        return new Response(JSON.stringify({code:0,data:{need_login_subtitle:true,subtitle:{subtitles:[]}}}));
      }
      return super.fetch(input,init);
    }
  }
  const fixture=new LoginRequiredSubtitles(),platform=new BrowserBilibili(new FixtureBrowser(fixture),()=>0);
  await platform.transcript(BVID,{limit:1});
  fixture.loggedIn=false;
  await assert.rejects(platform.transcript(BVID,{limit:1}),{code:'LOGIN_REQUIRED'});
  assert.equal(fixture.count('/x/player/wbi/v2'),2,'logged-out access must be checked with the upstream player');
  assert.equal(fixture.subtitleReads,1,'a rejected guest session cannot retrieve the old full document');
  fixture.loggedIn=true;
  await platform.transcript(BVID,{limit:1});
  assert.equal(fixture.subtitleReads,2,'returning to the previous UID requires a fresh subtitle document');
  await platform.close();
});
