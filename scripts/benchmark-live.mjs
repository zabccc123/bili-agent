// Read-only timing of the actual browser path. Never invokes add() or non-preview save().
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {PlaywrightBridge} from '../dist/browser.js';
import {BrowserBilibili} from '../dist/bilibili/platform.js';
import {readConfig,dataDir} from '../dist/config.js';
import {BiliService} from '../dist/service.js';
import {ReceiptStore} from '../dist/store.js';
import {VERSION} from '../dist/version.js';
const config=readConfig(),bridge=new PlaywrightBridge(config,dataDir(),true);
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'bili-agent-live-timing-'));
const steps=[],calls=[];let current='initial';
const browser={async run(code,options){const start=performance.now();try{return await bridge.run(code,options);}finally{calls.push({stage:current,ms:Math.round(performance.now()-start)});}},async close(){await bridge.close();}};
const platform=new BrowserBilibili(browser),service=new BiliService(platform,new ReceiptStore(temporary),()=>config,temporary);
async function measure(name,fn){current=name;const start=performance.now(),before=calls.length;try{const result=await fn();steps.push({name,ms:Math.round(performance.now()-start),browser_calls:calls.length-before,ok:true});return result;}catch(error){steps.push({name,ms:Math.round(performance.now()-start),browser_calls:calls.length-before,ok:false,code:error.code??'UNKNOWN'});return null;}}
try{
  const account=await measure('cold_account',()=>platform.account());
  if(!account?.logged_in)throw new Error('Account unavailable; use local setup first.');
  await measure('warm_account',()=>platform.account());
  await measure('search_5',()=>platform.search('MCP 开发 教程',1,5));
  await measure('video_info',()=>platform.video('BV1RNTtzMENj'));
  await measure('transcript_full',()=>platform.transcript('BV1RNTtzMENj',{limit:500}));
  await measure('transcript_repeat',()=>platform.transcript('BV1RNTtzMENj',{limit:500}));
  const first=await measure('transcript_page_1_cached',()=>platform.transcript('BV1RNTtzMENj',{limit:200}));
  if(first?.coverage.next_cursor)await measure('transcript_page_2_cached',()=>platform.transcript('BV1RNTtzMENj',{limit:200,cursor:first.coverage.next_cursor}));
  await measure('save_preview_1',()=>service.save({videos:['BV1RNTtzMENj'],targets:[{kind:'watch_later'}],preview:true}));
  if(process.argv.includes('--frames'))await measure('sample_1_frame',()=>platform.frames('BV1RNTtzMENj',1,[100]));
}catch(error){process.exitCode=1;console.error(error.message);}
finally{
  await service.close();
  const resolved=fs.realpathSync(temporary);
  if(path.dirname(resolved)===fs.realpathSync(os.tmpdir())&&path.basename(resolved).startsWith('bili-agent-live-timing-'))fs.rmSync(resolved,{recursive:true,force:true});
  const directory=path.resolve('artifacts','diagnostics');fs.mkdirSync(directory,{recursive:true});
  const report={date:new Date().toISOString(),version:VERSION,mode:config.browser_mode,headless:true,account_writes:0,notes:'Single run on this machine/network. No model reasoning time included. save_preview is read-only.',steps,calls};
  fs.writeFileSync(path.join(directory,'performance-'+VERSION+'.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
