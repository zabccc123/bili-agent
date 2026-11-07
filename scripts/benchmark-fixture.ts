import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {BiliFixture,FixtureBrowser,BVID} from '../test/fixture.js';
import {BrowserBilibili} from '../src/bilibili/platform.js';
import {BiliService} from '../src/service.js';
import {ReceiptStore} from '../src/store.js';
import {defaultConfig} from '../src/config.js';

// This benchmark never connects to a browser or the network. Compare request counts,
// not synthetic elapsed times, with real-browser timings collected separately.
const root=fs.mkdtempSync(path.join(os.tmpdir(),'bili-agent-count-benchmark-'));
const fixture=new BiliFixture();
const delegate=new FixtureBrowser(fixture);
let browserCalls=0;
const browser={async run<T>(code:string){browserCalls++;return delegate.run<T>(code);},async close(){await delegate.close();}};
const platform=new BrowserBilibili(browser);
const store=new ReceiptStore(root);
const service=new BiliService(platform,store,()=>({...defaultConfig(),expected_uid:'42'}),root,[0]);
const measurements:{scenario:string;browser_calls:number;http_requests:number;elapsed_fixture_ms:number}[]=[];
async function measure(scenario:string,fn:()=>Promise<unknown>){
  const calls=browserCalls,requests=fixture.requests.length,start=performance.now();
  await fn();
  measurements.push({scenario,browser_calls:browserCalls-calls,http_requests:fixture.requests.length-requests,elapsed_fixture_ms:Math.round((performance.now()-start)*10)/10});
}
try{
  await measure('metadata_cold',()=>platform.video(BVID));
  await measure('metadata_other_part_warm',()=>platform.video(BVID,2));
  await measure('transcript_cold',()=>platform.transcript(BVID,{limit:2}));
  await measure('transcript_next_window_warm',()=>platform.transcript(BVID,{start:8,limit:2}));
  await measure('transcript_repeat_warm',()=>platform.transcript(BVID,{limit:2}));
  await measure('search_warm_keys',()=>platform.search('fixture topic',1,5));
  await measure('save_preview_warm_metadata',()=>service.save({videos:[BVID],preview:true}));
  if(fixture.writes!==0)throw new Error('Benchmark must never issue writes');
  console.log(JSON.stringify({kind:'synthetic_request_count_benchmark',notes:'Synthetic remote responses. Elapsed times exclude real network/browser/LLM work and are not product speed claims.',measurements,network_writes:fixture.writes},null,2));
}finally{await service.close();fs.rmSync(root,{recursive:true,force:true});}
