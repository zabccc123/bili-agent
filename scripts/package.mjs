import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url));
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
for(const manifest of ['plugin.json','.codex-plugin/plugin.json']){
  if(JSON.parse(fs.readFileSync(path.join(root,manifest),'utf8')).version!==version)throw new Error('Plugin manifest versions do not match package.json');
}
const marketplace=path.join(root,'artifacts','marketplace');
const destination=path.join(marketplace,'plugins','bili-agent');
fs.mkdirSync(destination,{recursive:true});
for(const item of ['dist','skills','third-party','plugin.json','mcp.json','.codex-plugin','.mcp.json','package.json','package-lock.json','README.md','VALIDATION.md','UX_ITERATIONS.md','CHANGELOG.md','THIRD_PARTY_NOTICES.md','LICENSE','NOTICE']){
  fs.cpSync(path.join(root,item),path.join(destination,item),{recursive:true});
}
const npmCli=process.env.npm_execpath;
if(!npmCli)throw new Error('Run this script through npm run package:local');
const install=spawnSync(process.execPath,[npmCli,'ci','--omit=dev','--ignore-scripts','--no-fund'],{cwd:destination,stdio:'inherit'});
if(install.status!==0)process.exit(install.status??1);
const catalog={name:'bili-local',interface:{displayName:'Bili Agent 本地插件'},plugins:[{name:'bili-agent',source:{source:'local',path:'./plugins/bili-agent'},category:'Productivity'}]};
const catalogs=path.join(marketplace,'.agents','plugins');fs.mkdirSync(catalogs,{recursive:true});
fs.writeFileSync(path.join(catalogs,'marketplace.json'),JSON.stringify(catalog,null,2)+'\n');
const archive=path.join(root,'artifacts',`bili-agent-${version}.zip`);
const zip=spawnSync('python',['-X','utf8',path.join(root,'scripts','package_zip.py'),marketplace,archive],{stdio:'inherit'});
if(zip.status!==0)process.exit(zip.status??1);
console.log(JSON.stringify({marketplace,plugin:destination,zip:archive},null,2));
