import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
const {values}=parseArgs({options:{video:{type:'string',default:'BV1RNTtzMENj'},save:{type:'boolean'},frames:{type:'boolean'},'folder-id':{type:'string'},'plugin-root':{type:'string'}}});
const root=path.resolve(values['plugin-root']??'.');
const out=path.resolve('artifacts','acceptance');fs.mkdirSync(out,{recursive:true});
const report={date:new Date().toISOString(),plugin_root:root,video:values.video,checks:[]};
const client=new Client({name:'bili-agent-live-acceptance',version:'0.1.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(root,'dist','cli.js'),'serve'],stderr:'pipe'});
transport.stderr.on('data',()=>{});
function parse(result){const text=result.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');return JSON.parse(text);}
async function call(name,args){const result=await client.callTool({name,arguments:args},{timeout:180000});const data=parse(result);if(result.isError)throw new Error(JSON.stringify(data));return data;}
try{
  await client.connect(transport);
  const status=await call('bilibili_auth_status',{online:true});
  report.checks.push({name:'bound-account',ok:status.data.account_matches,mode:status.data.browser_mode});
  const text=await call('bilibili_read_video',{video:values.video,limit:500});
  report.checks.push({name:'timed-subtitles',ok:true,title:text.data.video.title,cues:text.data.cues.length,data_source:text.data.data_source,coverage:text.data.coverage});
  // Retain reading evidence locally, not browser logs or account credentials.
  fs.writeFileSync(path.join(out,'transcript.json'),JSON.stringify(text.data,null,2));
  if(values.frames){
    const result=await client.callTool({name:'bilibili_sample_frames',arguments:{video:values.video,times:[100,400]}},{timeout:180000});
    const metadata=parse(result);if(result.isError)throw new Error(JSON.stringify(metadata));
    let index=0;for(const content of result.content)if(content.type==='image')fs.writeFileSync(path.join(out,`frame-${++index}.jpg`),Buffer.from(content.data,'base64'));
    report.checks.push({name:'sampled-frames',ok:index>0,count:index,metadata});
  }
  if(values.save){
    if(!status.data.account_matches)throw new Error('Account is not bound');
    const targets=values['folder-id']?[{kind:'watch_later'},{kind:'favorite',folder_id:values['folder-id']}]:[{kind:'watch_later'}];
    const saved=await call('bilibili_save_videos',{videos:[values.video],targets});
    report.checks.push({name:'save-and-readback',ok:saved.data.all_verified,receipts:saved.data.receipts,errors:saved.data.errors});
    const repeated=await call('bilibili_save_videos',{videos:[values.video],targets});
    report.checks.push({name:'repeat-is-idempotent',ok:repeated.data.all_verified&&repeated.data.receipts.every(r=>r.status==='already_present'),receipts:repeated.data.receipts});
  }
  report.ok=report.checks.every(check=>check.ok);
}catch(error){report.ok=false;report.error=String(error);process.exitCode=1;}
finally{await client.close();await transport.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
