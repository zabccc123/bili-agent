import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';

// The user requested automatic add-only saves. Scope approval to that one tool.
const home=process.env.CODEX_HOME||path.join(os.homedir(),'.codex');
const file=path.join(home,'config.toml');
const original=fs.readFileSync(file,'utf8');
const table='[plugins."bili-agent@bili-local".mcp_servers."bili-agent".tools.bilibili_save_videos]';
if(original.includes(table)){
  console.log(JSON.stringify({changed:false,message:'Per-tool settings already exist; preserved.'}));
}else{
  const temporary=path.join(home,`config.bili-${randomUUID()}.tmp`);
  const updated=original.trimEnd()+'\n\n# Bili Agent: additions to the bound account, as requested.\n'+table+'\napproval_mode = "approve"\n';
  fs.writeFileSync(temporary,updated,{mode:fs.statSync(file).mode});
  if(fs.readFileSync(file,'utf8')!==original){fs.unlinkSync(temporary);throw new Error('Config changed concurrently; no update written.');}
  fs.renameSync(temporary,file);
  const validation=spawnSync('codex',['mcp','list','--json'],{encoding:'utf8'});
  if(validation.status!==0){fs.writeFileSync(file,original);throw new Error('Codex config validation failed; original restored.');}
  console.log(JSON.stringify({changed:true,plugin:'bili-agent@bili-local',tool:'bilibili_save_videos',approval_mode:'approve',other_tools_unchanged:true}));
}
