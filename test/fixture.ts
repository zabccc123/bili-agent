import vm from 'node:vm';
import type { BrowserExecutor } from '../src/browser.js';

export const BVID='BV1Eb411u7Fw';
export const SECOND='BV1xx411c7mD';
export class BiliFixture {
  uid='42';
  loggedIn=true;
  writes=0;
  loseWriteResponse=false;
  rejectWrites=false;
  delayVisibility=0;
  private visibilityReads=0;
  toview=new Set<string>();
  favorites=new Set<string>();
  requests: {url:string;method:string;body?:string}[]=[];
  async fetch(input: string|URL, init: RequestInit = {}): Promise<Response> {
    const url=new URL(String(input));
    const method=init.method??'GET';
    const body=init.body?.toString();
    this.requests.push({url:url.href,method,body});
    const json=(data:unknown,code=0)=>Promise.resolve(new Response(JSON.stringify({code,data}),{headers:{'Content-Type':'application/json'}}));
    if(url.hostname==='aisubtitle.hdslb.com')return new Response(JSON.stringify({body:[{from:0,to:3,content:'第一段内容'},{from:3,to:8,content:'第二段内容'},{from:8,to:12,content:'第三段内容'}]}));
    if(url.pathname==='/x/web-interface/nav')return json({isLogin:this.loggedIn,mid:this.loggedIn?Number(this.uid):0,uname:'Fixture user',wbi_img:{img_url:'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png',sub_url:'https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png'}},this.loggedIn?0:-101);
    if(url.pathname==='/x/web-interface/wbi/search/type')return json({numResults:2,numPages:1,result:[{bvid:BVID,title:'<em>测试</em>视频',author:'UP主',duration:'12:00'},{bvid:SECOND,title:'另一个视频'}]});
    if(url.pathname==='/x/web-interface/wbi/view'){
      const bvid=url.searchParams.get('bvid')??BVID;
      return json({bvid,aid:bvid===BVID?100:101,title:'Fixture video',desc:'Source description',owner:{name:'Fixture creator'},pages:[{page:1,cid:200,part:'P1',duration:12},{page:2,cid:201,part:'P2',duration:20}]});
    }
    if(url.pathname==='/x/player/wbi/v2')return json({subtitle:{subtitles:[{lan:'ai-zh',subtitle_url:'https://aisubtitle.hdslb.com/bfs/ai_subtitle/fixture.json'}]}});
    if(url.pathname==='/x/v3/fav/folder/created/list-all'){
      const selected=this.favorites.has(url.searchParams.get('rid')??'');
      return json({count:1,list:[{id:900,title:'Study',media_count:this.favorites.size,fav_state:selected?1:0}]});
    }
    if(url.pathname==='/x/v2/history/toview'){
      this.visibilityReads++;
      return json({list:this.visibilityReads<=this.delayVisibility?[]:[...this.toview].map(aid=>({aid:Number(aid)}))});
    }
    if(method==='POST'){
      if(!this.loggedIn)return json({},-101);
      if(this.rejectWrites)return json({},-403);
      const form=new URLSearchParams(body);
      if(form.get('csrf')!=='fixture-csrf')return json({},-111);
      this.writes++;
      this.visibilityReads=0;
      if(url.pathname==='/x/v2/history/toview/add')this.toview.add(form.get('aid')!);
      else if(url.pathname==='/x/v3/fav/resource/deal')this.favorites.add(form.get('rid')!);
      else throw new Error('Unexpected write endpoint');
      if(this.loseWriteResponse)throw new Error('Simulated connection lost after commit');
      return json({});
    }
    throw new Error('Unexpected request: '+url.pathname);
  }
}
export class FixtureBrowser implements BrowserExecutor {
  private url='about:blank';
  constructor(readonly fixture:BiliFixture){}
  async run<T>(code:string):Promise<T>{
    const context=vm.createContext({URL,URLSearchParams,AbortSignal,fetch:this.fixture.fetch.bind(this.fixture),document:{cookie:'bili_jct=fixture-csrf'},setTimeout,clearTimeout});
    const fn=vm.runInContext('('+code+')',context);
    const page={url:()=>this.url,goto:async(url:string)=>{this.url=url;},evaluate:async(callback:Function,args:unknown)=>callback(args)};
    const result=await fn(page);
    return result.__bili_agent;
  }
  async close(){}
}
