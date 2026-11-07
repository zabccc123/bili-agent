#!/usr/bin/env node
import { parseArgs } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dataDir, readConfig, writeConfig, configPath } from './config.js';
import { PlaywrightBridge } from './browser.js';
import { BrowserBilibili } from './bilibili/platform.js';
import { BiliService } from './service.js';
import { serve } from './server.js';
import { BiliError, publicError } from './errors.js';
import { ActivityLog } from './activity.js';
import { startDashboard, existingDashboard } from './dashboard.js';
import { VERSION } from './version.js';

export async function runtime(root=dataDir(),headless=false) {
  const { ReceiptStore } = await import('./store.js');
  const config=readConfig(root);
  const activity=new ActivityLog();
  const browser=new PlaywrightBridge(config,root,headless);
  const platform=new BrowserBilibili(browser,{onStage:stage=>activity.stage(stage)});
  const service=new BiliService(platform,new ReceiptStore(root),()=>readConfig(root),root);
  return {browser,platform,service,activity};
}
const print=(data:unknown)=>process.stdout.write(JSON.stringify(data,null,2)+'\n');
async function main() {
  let args;
  try {args=parseArgs({allowPositionals:true,options:{help:{type:'boolean',short:'h'},json:{type:'boolean'},mode:{type:'string'},browser:{type:'string'},'profile-name':{type:'string'},'wait-seconds':{type:'string'},online:{type:'boolean'},headless:{type:'boolean'},'rebind-account':{type:'boolean'},'auto-save':{type:'string'},'folder-id':{type:'string'},video:{type:'string'},keyword:{type:'string'},part:{type:'string'}}});}
  catch {throw new BiliError('INVALID_ARGUMENT','命令参数不正确。请运行 node dist/cli.js --help 查看示例。');}
  const command=args.positionals[0]??'serve';
  const root=dataDir();
  if(command==='help'||args.values.help) {
    process.stdout.write(`Bili Agent v${VERSION} · B站资料助手

  dashboard                 打开本地资料工作台（输出可点击地址；保持终端运行）
  serve                     启动 MCP 服务，同时提供本地控制台
  doctor [--online] [--json] 检查环境；默认仅检查本地，不会核验登录
  setup                     打开受控浏览器，扫码登录并绑定账号
  search --keyword TEXT     搜索视频；--headless 可隐藏受控浏览器
  inspect --video URL       读取带时间戳字幕；--part 2 可指定分 P
  smoke                     用临时环境验证浏览器桥接

示例：
  node dist/cli.js dashboard
  node dist/cli.js doctor --online
  node dist/cli.js setup --mode managed --browser msedge
  node dist/cli.js inspect --video https://www.bilibili.com/video/BV1RNTtzMENj/

复用现有浏览器：setup --mode extension --browser chrome（需要官方 Playwright 扩展）。
setup 参数：--mode managed|extension、--browser chrome|msedge、--profile-name 名称、
  --rebind-account（本人显式更换绑定）、--auto-save on|off、--folder-id ID、--wait-seconds 300。
更换绑定前请结束占用同一专用浏览器的控制台/MCP 服务，再运行 setup；不要删除浏览器 profile。
续读、批量预览和保存回执可在控制台查看；Codex 使用原生 MCP 工具可复用连接和缓存。
个人状态保存在 ${root}，不会随插件打包。
`);return;
  }
  if(command==='doctor') {
    const require=createRequire(import.meta.url);
    const config=readConfig(root);
    const diagnostics={node:process.version,plugin_version:VERSION,playwright_mcp:require('@playwright/mcp/package.json').version,mcp_sdk:2,data_directory:root,config_exists:fs.existsSync(configPath(root)),account_bound:Boolean(config.expected_uid),browser_mode:config.browser_mode,browser:config.browser,online_checked:false,session_secrets_returned:false};
    const report=(result:typeof diagnostics & {connection?:string;error?:ReturnType<typeof publicError>})=>{
      if(args.values.json){print(result);return;}
      process.stdout.write(`Bili Agent v${VERSION} · ${result.online_checked?'已执行在线核验':'仅检查本地，尚未确认登录'}\n浏览器：${config.browser} · ${config.browser_mode==='managed'?'独立持久会话':'扩展连接'}\n账号：${result.connection??(result.account_bound?'本地已绑定，尚未在线核验':'尚未绑定，请运行 setup')}\nNode：${process.version}\n${result.error?'诊断码：'+result.error.code+' · '+result.error.message+'\n':''}可视化入口：node dist/cli.js dashboard\n`);
    };
    if(!args.values.online){report(diagnostics);return;}
    const {service}=await runtime(root,args.values.headless);
    try{const status=await service.status(true);if('account' in status)report({...diagnostics,online_checked:true,connection:status.account_matches?'已核验，当前账号与绑定一致':!status.account.logged_in?'登录失效，请重新运行 setup':!status.account_bound?'已登录但尚未绑定，请运行 setup':'当前账号与绑定不符，请切换账号后重试'});}
    catch(error){report({...diagnostics,error:publicError(error)});process.exitCode=1;}
    finally{await service.close();}return;
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
    const seconds=Number(args.values['wait-seconds']??300);
    if(!Number.isFinite(seconds)||seconds<0||seconds>3600)throw new BiliError('INVALID_WAIT','wait-seconds 必须在 0 到 3600 之间。');
    const {browser,platform,service}=await runtime(root,false);
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
    const {browser,service}=await runtime(root,true);
    try{
      const result=await browser.run(`async(page)=>{await page.goto('data:text/html,<title>Bili Agent bridge check</title><h1 id="probe">bridge-ready</h1>');return {__bili_agent:{title:await page.title(),text:await page.locator('#probe').textContent()}};}`);
      print({ok:true,check:'official-playwright-mcp-roundtrip',result});
    }finally{await service.close();}return;
  }
  if(command==='inspect'||command==='search') {
    if(command==='inspect'&&!args.values.video)throw new BiliError('VIDEO_REQUIRED','请提供 --video。例如：node dist/cli.js inspect --video https://www.bilibili.com/video/BV1RNTtzMENj/');
    if(command==='search'&&!args.values.keyword)throw new BiliError('KEYWORD_REQUIRED','请提供 --keyword。例如：node dist/cli.js search --keyword "MCP 教程"');
    if(args.values.part&&(!/^[1-9]\d*$/.test(args.values.part)||Number(args.values.part)>10000))throw new BiliError('INVALID_PART','--part 必须为 1 到 10000 之间的整数。');
    const {platform,service}=await runtime(root,Boolean(args.values.headless));
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
  if(command==='dashboard') {
    const running=await existingDashboard(root);
    if(running){print({ok:true,url:running,reused:true,message:'控制台已连接到现有服务。'});return;}
    const context=await runtime(root,Boolean(args.values.headless));
    const dashboard=await startDashboard({...context,root});
    print({ok:true,url:dashboard.url,reused:false,message:'在浏览器中打开此地址。保持本终端运行；Ctrl+C 结束。'});
    let stopping=false;
    const stop=async()=>{if(stopping)return;stopping=true;await dashboard.close();await context.service.close();};
    process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());return;
  }
  if(command!=='serve')throw new BiliError('UNKNOWN_COMMAND','未知命令。请运行 node dist/cli.js --help。');
  const context=await runtime(root);
  const dashboard=await startDashboard({...context,root});
  await serve(context.service,{activity:context.activity,dashboardUrl:dashboard.url,onClose:dashboard.close});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{process.stderr.write(JSON.stringify({ok:false,error:publicError(error)})+'\n');process.exitCode=1;});
