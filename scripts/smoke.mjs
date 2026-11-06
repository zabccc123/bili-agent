import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url));
const state=fs.mkdtempSync(path.join(os.tmpdir(),'bili-agent-smoke-'));
// Use disposable state even when the caller has a real account configured.
const result=spawnSync(process.execPath,[path.join(root,'dist','cli.js'),'smoke'],{env:{...process.env,BILI_AGENT_DATA_DIR:state},stdio:'inherit'});
const resolved=fs.realpathSync(state);
if(path.dirname(resolved)===fs.realpathSync(os.tmpdir())&&path.basename(resolved).startsWith('bili-agent-smoke-'))fs.rmSync(resolved,{recursive:true,force:true});
process.exitCode=result.status??1;
