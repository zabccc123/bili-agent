#!/usr/bin/env node
import { parseArgs } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dataDir, readConfig, writeConfig, configPath } from './config.js';
import { PlaywrightBridge } from './browser.js';
import { BrowserBilibili } from './bilibili/platform.js';
import { ReceiptStore } from './store.js';
import { BiliService } from './service.js';
import { serve } from './server.js';
import { BiliError, publicError } from './errors.js';

export function runtime(root=dataDir(),headless=false) {
  const config=readConfig(root);
  const browser=new PlaywrightBridge(config,root,headless);
  const platform=new BrowserBilibili(browser);
  const service=new BiliService(platform,new ReceiptStore(root),()=>readConfig(root),root);
  return {browser,platform,service};
}
const print=(data:unknown)=>process.stdout.write(JSON.stringify(data,null,2)+'\n');
async function main() {
  const args=parseArgs({allowPositionals:true,options:{mode:{type:'string'},browser:{type:'string'},'profile-name':{type:'string'},'wait-seconds':{type:'string'},online:{type:'boolean'},headless:{type:'boolean'},'rebind-account':{type:'boolean'},'auto-save':{type:'string'},'folder-id':{type:'string'},video:{type:'string'},keyword:{type:'string'},part:{type:'string'}}});
  const command=args.positionals[0]??'serve';
  const root=dataDir();
  if(command==='help'||command==='--help') {
    process.stdout.write('bili-agent serve | doctor [--online] | setup [--mode managed|extension] [--browser chrome|msedge] | smoke | inspect --video URL | search --keyword TEXT\n个人状态保存在 '+root+'\n');return;
  }
  if(command==='doctor') {
    const require=createRequire(import.meta.url);
    const config=readConfig(root);
    const diagnostics={node:process.version,plugin_version:'0.1.0',playwright_mcp:require('@playwright/mcp/package.json').version,mcp_sdk:2,data_directory:root,config_exists:fs.existsSync(configPath(root)),...config,session_secrets_returned:false};
    if(!args.values.online){print(diagnostics);return;}
    const {service}=runtime(root,args.values.headless);
    try{print({...diagnostics,status:await service.status(true)});}finally{await service.close();}return;
  }
  if(command==='setup') {
    const config=readConfig(root);
    if(args.values.mode){if(!['managed','extension'].includes(args.values.mode))throw new BiliError('INVALID_MODE','mode 必须为 managed 或 extension。');config.browser_mode=args.values.mode as typeof config.browser_mode;}
    if(args.values.browser){if(!['chrome','msedge'].includes(args.values.browser))throw new BiliError('INVALID_BROWSER','browser 必须为 chrome 或 msedge。');config.browser=args.values.browser as typeof config.browser;}
    if(args.values['profile-name'])config.profile_name=args.values['profile-name'];
    if(args.values['auto-save']){
      if(!['on','off'].includes(args.values['auto-save']))throw new BiliError('INVALID_PREFERENCE','auto-save 必须为 on 或 off。');
      config.auto_save=args.values['auto-save']==='on';
    }
    if(args.values['folder-id']){
      if(!/^[1-9]\d*$/.test(args.values['folder-id']))throw new BiliError('INVALID_FOLDER','folder-id 必须为收藏夹 ID。');
      config.default_targets=[{kind:'favorite',folder_id:args.values['folder-id']}];
    }
    writeConfig(config,root);
    const {browser,platform,service}=runtime(root,false);
    const seconds=Number(args.values['wait-seconds']??300);
    if(!Number.isFinite(seconds)||seconds<0||seconds>3600)throw new BiliError('INVALID_WAIT','wait-seconds 必须在 0 到 3600 之间。');
    try {
      process.stderr.write(config.browser_mode==='managed'?'正在打开 B 站专用浏览器。请点击网页右上角登录，使用 B 站 App 扫码。\n':'正在连接现有浏览器。请安装官方 Playwright Extension，并在连接页面选择已登录的 B 站标签页。\n');
      await browser.run(`async(page)=>{await page.goto('https://www.bilibili.com/',{waitUntil:'domcontentloaded',timeout:30000});return {__bili_agent:{opened:true}};}`);
      const deadline=Date.now()+seconds*1000;
      do {
        const account=await platform.account();
        if(account.logged_in&&account.uid){
          if(config.expected_uid&&config.expected_uid!==account.uid&&!args.values['rebind-account'])throw new BiliError('ACCOUNT_MISMATCH','当前账号与原绑定不同。本人决定更换时请显式使用 --rebind-account。');
          if(config.default_targets.some(t=>t.kind==='favorite')){
            const folders=await platform.folders();
            for(const target of config.default_targets)if(target.kind==='favorite'&&!folders.some(f=>f.id===target.folder_id))throw new BiliError('FOLDER_NOT_OWNED','配置的收藏夹不属于当前账号。');
          }
          config.expected_uid=account.uid;writeConfig(config,root);
          print({ok:true,account,browser_mode:config.browser_mode,config_file:configPath(root),auto_save:config.auto_save,default_targets:config.default_targets});return;
        }
        if(Date.now()>=deadline)break;
        await new Promise(resolve=>setTimeout(resolve,2500));
      }while(true);
      print({ok:false,code:'LOGIN_PENDING',message:'尚未完成登录。再次运行 setup 可继续，专用浏览器会保留已经建立的会话。'});process.exitCode=2;
    }finally{await service.close();}return;
  }
  if(command==='smoke') {
    const {browser,service}=runtime(root,true);
    try{
      const result=await browser.run(`async(page)=>{await page.goto('data:text/html,<title>Bili Agent bridge check</title><h1 id="probe">bridge-ready</h1>');return {__bili_agent:{title:await page.title(),text:await page.locator('#probe').textContent()}};}`);
      print({ok:true,check:'official-playwright-mcp-roundtrip',result});
    }finally{await service.close();}return;
  }
  if(command==='inspect'||command==='search') {
    const {platform,service}=runtime(root,Boolean(args.values.headless));
    try{
      if(command==='inspect'){
        if(!args.values.video)throw new BiliError('VIDEO_REQUIRED','请提供 --video。');
        print(await platform.transcript(args.values.video,{part:args.values.part?Number(args.values.part):undefined,limit:50}));
      }else{
        if(!args.values.keyword)throw new BiliError('KEYWORD_REQUIRED','请提供 --keyword。');
        print(await platform.search(args.values.keyword,1,5));
      }
    }finally{await service.close();}return;
  }
  if(command!=='serve')throw new BiliError('UNKNOWN_COMMAND','未知命令。请运行 help。');
  await serve(runtime(root).service);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{process.stderr.write(JSON.stringify({ok:false,error:publicError(error)})+'\n');process.exitCode=1;});
