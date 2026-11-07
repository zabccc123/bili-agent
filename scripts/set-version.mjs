import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const version=process.argv[2];
if(!/^\d+\.\d+\.\d+(?:-[a-z]+\.\d+)?$/.test(version??''))throw new Error('Provide a semantic version, e.g. 0.2.0');
for(const name of ['package.json','package-lock.json','plugin.json','.codex-plugin/plugin.json']){
  const file=path.join(root,name),data=JSON.parse(fs.readFileSync(file,'utf8'));
  data.version=version;
  if(name==='package-lock.json')data.packages[''].version=version;
  fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
}
fs.writeFileSync(path.join(root,'src','version.ts'),`// Kept in sync with package.json and plugin manifests by the release check.\nexport const VERSION = '${version}';\n`);
console.log('Set Bili Agent version to '+version);
