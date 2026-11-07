export const dashboardHtml = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bili Agent · 资料工作台</title><link rel="stylesheet" href="/style.css"><script src="/app.js" defer></script></head>
<body><header><div class="brand"><span class="mark">b.</span><div><strong>Bili Agent</strong><span class="sub">B 站资料工作台</span></div></div><div class="local">本机运行 <span id="version"></span></div></header>
<main><section class="intro"><div><p class="eyebrow">找资料 · 读字幕 · 留下值得回看的内容</p><h1>让每一次阅读，都有迹可循。</h1><p class="muted">在这里查看执行进度、实际阅读范围和保存结果。</p></div><div class="connection"><strong id="connection">正在连接本地服务…</strong><span id="mode" class="muted"></span><div class="button-row"><button id="check">核验登录</button><button id="open-browser" class="secondary">登录/连接 B站</button></div></div></section>
<div id="notice" role="status" aria-live="polite" hidden></div><div class="layout"><div class="workspace">
<section class="panel"><div class="section-heading"><h2>搜索视频</h2><span class="muted">候选不会自动保存</span></div><form id="search-form" class="input-row"><label class="sr-only" for="keyword">搜索关键词</label><input id="keyword" placeholder="例如：MCP 开发教程" maxlength="200" required><button type="submit">搜索</button></form><div id="search-results" class="results"><p class="empty">输入关键词，或直接在下方粘贴视频链接。</p></div></section>
<section class="panel" id="reader-panel"><div class="section-heading"><h2>阅读视频</h2><span class="muted">字幕为主，按需采样画面</span></div><form id="read-form" class="input-row"><label class="sr-only" for="video">视频链接或 BV 号</label><input id="video" placeholder="粘贴 B 站视频链接或 BV 号" maxlength="2048" required><label class="sr-only" for="part">选择分 P</label><select id="part"><option value="">按链接选择分 P</option></select><button type="submit">读取字幕</button></form><div id="reader"><p class="empty">读取后会标明字幕来源、分 P 和覆盖范围。字幕与少量画面不能代表完整音视频理解。</p></div></section>
<section class="panel"><div class="section-heading"><h2>保存队列</h2><span class="muted">收藏以整条视频为单位，分 P 会合并</span></div><label for="queue" class="field-label">选中搜索结果，或每行粘贴一个视频链接</label><textarea id="queue" rows="3" placeholder="https://www.bilibili.com/video/…"></textarea><div class="queue-controls"><span id="queue-count" class="muted">0 个视频</span><div class="target"><label for="target">保存到</label><select id="target"><option value="default">本地默认目标</option><option value="watch_later">稍后再看</option></select><button id="load-folders" class="text-button">选择收藏夹</button></div></div><div class="button-row"><button id="preview" class="secondary">预览保存</button><button id="save">加入保存目标</button></div><p class="hint">预览不会添加视频。保存超时后先查看回执，待核验项目只复核状态。</p><div id="save-result" aria-live="polite"></div></section>
<section class="panel"><div class="section-heading"><h2>最近保存回执</h2><button id="refresh-receipts" class="text-button">刷新</button></div><p class="hint">保存在本机，跨聊天与服务重启仍可查询。只显示当前绑定账号的记录。</p><div id="receipts"><p class="empty">正在读取…</p></div></section>
</div><aside class="panel activity-panel"><div class="section-heading"><h2>执行进度</h2><span class="pulse" aria-hidden="true"></span></div><p class="hint">包含此服务收到的 Codex 工具调用与控制台操作。任务列表保留本次服务会话；保存回执会持久保留。</p><div id="tasks" aria-live="polite"><p class="empty">还没有任务。可以先核验登录。</p></div></aside></div>
<footer><strong>第一次使用？</strong> 点击上方“登录/连接 B站”，在打开的浏览器中扫码，再回到这里点击“已扫码，连接账号”。已有绑定可直接核验。连接不会静默更换绑定账号。<details><summary>连接失效或遇到问题</summary><p>重新让 Codex 打开工作台，或运行 <code>node dist/cli.js dashboard</code> 获取地址。专用浏览器一次由一个进程使用，占用时先结束独立 setup/诊断进程，再重试。复用已有 Chrome/Edge 或更换绑定可使用 <code>node dist/cli.js setup --help</code>。无字幕时可打开视频或采样画面，当前版本不提供语音转写。</p></details></footer>
</main></body></html>`;

export const dashboardCss = `:root{font-family:Inter,"Microsoft YaHei",system-ui,sans-serif;color:#172334;background:#f4f6f9;font-size:14px;line-height:1.6;--blue:#2365d3;--border:#dfe5ed}*{box-sizing:border-box}body{margin:0}header{height:78px;border-bottom:1px solid var(--border);background:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 max(28px,calc((100vw - 1360px)/2));gap:20px}.brand{display:flex;gap:12px;align-items:center}.mark{display:grid;place-items:center;background:#172b4d;color:#fff;width:42px;height:42px;border-radius:13px;font-size:28px;font-weight:750}.brand strong{display:block;font-size:17px}.sub{font-size:12px;color:#738094}.local{font-size:12px;color:#657389;border:1px solid var(--border);padding:5px 12px;border-radius:20px}main{max-width:1360px;margin:auto;padding:30px 28px}.intro{display:flex;justify-content:space-between;align-items:center;gap:24px;margin:4px 0 28px}.eyebrow{font-size:12px;color:#456484;letter-spacing:.08em;margin:0}h1{font-size:29px;letter-spacing:-.04em;margin:8px 0}h2{font-size:17px;margin:0}.muted{color:#6c7a8d;font-size:12px}.intro .muted{margin:4px 0}.connection{min-width:270px;border-left:3px solid #adc7eb;padding:4px 0 4px 18px;display:flex;flex-direction:column;gap:5px}.connection strong{font-size:14px}.layout{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:22px;align-items:start}.workspace{display:grid;gap:20px}.panel{background:#fff;border:1px solid var(--border);border-radius:16px;padding:22px;box-shadow:0 4px 18px #172b4d03;min-width:0}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}.input-row{display:flex;gap:9px}input,select,textarea{font:inherit;color:inherit;background:#fafbfd;border:1px solid #cdd6e2;border-radius:8px;padding:10px 12px;min-width:0}input{flex:1}select{max-width:210px}textarea{width:100%;resize:vertical}input:focus,select:focus,textarea:focus{outline:3px solid #bcd6ff;outline-offset:1px;border-color:var(--blue)}button{font:inherit;border:1px solid var(--blue);border-radius:8px;background:var(--blue);color:#fff;padding:9px 15px;cursor:pointer;white-space:nowrap;font-weight:550;transition:background .15s}button:hover{background:#174fae}button:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid #8fb7f3;outline-offset:3px}button:disabled{opacity:.5;cursor:wait}.secondary{background:#fff;color:#2358a5;border-color:#c5d4e8}.secondary:hover{background:#edf4ff}.text-button{border:0;color:var(--blue);background:none;padding:3px 0;font-size:12px}.text-button:hover{background:none;color:#123d85;text-decoration:underline}.button-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.button-row button{font-size:12px;padding:7px 11px}.empty{color:#8490a0;font-size:13px;padding:12px 0 2px;margin-bottom:0}.results{margin-top:14px}.result-item{display:flex;gap:11px;align-items:flex-start;border-top:1px solid #edf0f5;padding:13px 0}.result-item input{flex:0;margin-top:6px;accent-color:var(--blue)}.result-content{flex:1;min-width:0}.result-title{font-weight:600;display:block;margin-bottom:2px}a{color:#24589e;text-decoration:none}a:hover{text-decoration:underline}.result-actions{display:flex;gap:14px;margin-top:5px}.badge{display:inline-block;border-radius:5px;padding:2px 7px;font-size:11px;background:#edf3fb;color:#456584;margin-right:6px}.success{color:#137345;background:#ecf8f0}.warning{color:#9a6500;background:#fff6dd}.failure{color:#b44141;background:#fff0ef}.field-label{font-size:12px;color:#657389;display:block;margin-bottom:7px}.queue-controls{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0}.target{display:flex;gap:8px;align-items:center;font-size:12px}.target select{padding:5px 8px}.hint{font-size:12px;color:#7c8797;margin:8px 0 14px}.activity-panel{position:sticky;top:20px}.task{padding:13px 0;border-top:1px solid #edf0f5}.task-title{display:flex;justify-content:space-between;gap:8px;font-size:12px;font-weight:600}.task .stage{font-size:12px;color:#697c91;margin-top:3px}.task small{font-size:11px;color:#8995a5}.task.active{border-left:3px solid var(--blue);padding-left:10px}.task details{font-size:11px;color:#708094}.pulse{width:7px;height:7px;border-radius:50%;background:#5cb991}#notice{padding:12px 16px;border:1px solid #b8d2f5;background:#eef5ff;border-radius:10px;margin-bottom:18px;white-space:pre-wrap;font-size:13px}#notice.error{background:#fff3ed;border-color:#edc7ae;color:#8d4a24}.reader-heading{margin:18px 0 4px;font-size:16px}.coverage{background:#f1f6fd;border-radius:9px;padding:12px 14px;margin:12px 0;font-size:12px}.cues{max-height:400px;overflow:auto;border:1px solid #e9edf2;border-radius:8px}.cue{display:flex;gap:16px;padding:9px 12px;border-bottom:1px solid #f0f2f5;font-size:13px}.cue a{font-size:11px;white-space:nowrap;padding-top:2px;font-variant-numeric:tabular-nums}.cue p{margin:0}.receipt{border-top:1px solid #edf0f5;padding:12px 0;font-size:13px}.receipt-title{font-weight:550}.receipt .muted{display:block;margin:4px 0}.frames{display:grid;gap:12px;margin-top:14px}.frames img{max-width:100%;border-radius:8px}.frames figcaption{font-size:12px;color:#6c7a8d}figure{margin:0}footer{font-size:12px;color:#6d7c90;margin:28px 0 10px;line-height:1.9}footer strong{color:#415774}code{background:#e9eef5;padding:2px 5px;border-radius:4px;font-size:11px;overflow-wrap:anywhere}details summary{cursor:pointer}footer details{margin-top:8px}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:1080px){.layout{grid-template-columns:minmax(0,1fr) 270px}main{padding:24px 20px}.panel{padding:18px}.intro{align-items:flex-start}h1{font-size:24px}.input-row{flex-wrap:wrap}.input-row input{flex-basis:60%}}@media(max-width:760px){header{padding:0 18px}.intro{flex-direction:column;gap:18px}.layout{grid-template-columns:1fr}.activity-panel{position:static;grid-row:1}.connection{width:100%}main{padding:22px 14px}.section-heading{flex-wrap:wrap}.queue-controls{align-items:flex-start;flex-direction:column}.input-row input{flex-basis:100%}.target{flex-wrap:wrap}h1{font-size:25px}.local{font-size:10px}.activity-panel #tasks{max-height:260px;overflow:auto}}`;

// Explicit dimensions prevent the shared text-input flex rule from collapsing checkboxes.
export const dashboardCheckboxCss = '.result-item input[type="checkbox"]{flex:0 0 18px;width:18px;height:18px;padding:0;margin:4px 0 0;cursor:pointer}';

export const dashboardJs = String.raw`'use strict';
const $ = id => document.getElementById(id);
let token = location.hash.slice(1) || sessionStorage.getItem('bili-agent-token') || '';
if (token) { sessionStorage.setItem('bili-agent-token', token); history.replaceState(null, '', '/'); }
let busy = false, currentRead = null, maxBatch = 10, lastSearch = null;
const labels = {check:'核验登录',connect:'登录与连接',open_browser:'打开浏览器',search:'搜索视频',read:'读取字幕',frames:'采样画面',folders:'读取收藏夹',preview:'预览保存',save:'保存视频',verify:'复核回执',bilibili_auth_status:'检查状态',bilibili_search:'搜索视频',bilibili_get_video:'读取视频详情',bilibili_read_video:'读取字幕',bilibili_sample_frames:'采样画面',bilibili_save_videos:'保存视频',bilibili_list_favorite_folders:'读取收藏夹',bilibili_get_save_receipt:'查询回执'};
const stages = {queued:'正在排队',starting:'准备执行',checking_account:'核验当前账号',loading_signing_keys:'准备请求签名',searching:'正在搜索',loading_video:'获取视频详情',video_cache_hit:'复用视频详情缓存',checking_subtitle_access:'核验字幕读取身份',loading_transcript:'获取字幕',transcript_cache_hit:'复用已读取的字幕',checking_membership:'检查是否已经保存',verifying_folder:'核验收藏夹归属',saving:'提交添加请求',sampling_frames:'加载播放器并采样画面',opening_browser:'打开 B 站页面',completed:'操作完成',failed:'操作未完成'};
const statuses = {prepared:['准备中','warning'],saved:['已确认保存','success'],already_present:['已经存在','success'],pending_verification:['待核验','warning'],failed:['保存失败','failure']};
function el(tag, text, cls) { const node = document.createElement(tag); if (text !== undefined) node.textContent = String(text); if (cls) node.className = cls; return node; }
function link(text, url) { const a=el('a',text); try { const u=new URL(url); if(u.protocol==='https:' && (u.hostname==='www.bilibili.com'||u.hostname==='bilibili.com')) { a.href=u.href;a.target='_blank';a.rel='noopener noreferrer'; } }catch{} return a; }
function notice(text, error=false) { const node=$('notice');node.hidden=false;node.className=error?'error':'';node.textContent=text; }
const guidance={LOGIN_REQUIRED:'登录已失效。请点击“登录/连接 B站”重新扫码，完成后再次连接。',SETUP_REQUIRED:'还没有绑定账号。请点击“登录/连接 B站”，在受控浏览器扫码后再次点击连接。',ACCOUNT_MISMATCH:'当前浏览器账号与绑定账号不同。请切回原账号；更换绑定需要本人显式运行 setup --rebind-account。',BROWSER_START_FAILED:'浏览器没有启动。请运行 doctor，确认 Edge/Chrome 已安装。',BROWSER_CONNECTION_FAILED:'浏览器可能被另一进程占用，或扩展尚未连接。结束单独运行的 setup/诊断后重试；扩展模式请连接 B 站标签页。',NO_SUBTITLES:'未取得字幕，尚未完成内容阅读。你可以打开原视频或采样画面；当前没有语音转写。',DASHBOARD_AUTH_REQUIRED:'控制台地址已过期。请重新获取控制台地址，使用带连接码的完整链接打开。',NETWORK_ERROR:'与本地服务的连接中断。请先刷新并检查最近回执，再决定是否继续，避免重复保存。'};
guidance.SUBTITLE_UNAVAILABLE = guidance.NO_SUBTITLES;
guidance.CURSOR_EXPIRED = '字幕内容或语言已更新，请重新读取当前视频后继续。';
function showError(error) {
  const connection={LOGIN_REQUIRED:'登录已失效 · 请重新扫码',ACCOUNT_MISMATCH:'账号与绑定不符',SETUP_REQUIRED:'尚未绑定账号',BROWSER_CONNECTION_FAILED:'浏览器连接未完成',DASHBOARD_AUTH_REQUIRED:'控制台连接已失效',NETWORK_ERROR:'本地服务未连接'};
  if(connection[error.code])$('connection').textContent=connection[error.code];
  notice((guidance[error.code]||error.message||'操作未完成。')+'\n诊断码：'+(error.code||'NETWORK_ERROR'),true);
}
async function api(route, body) { try { const response=await fetch(route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok||!result.ok)throw result.error||{code:'NETWORK_ERROR'};return result.data; }catch(error){if(error&&error.code)throw error;throw {code:'NETWORK_ERROR',message:'本地服务未连接。'};} }
function setBusy(value) { busy=value;document.querySelectorAll('button').forEach(button=>button.disabled=value && !['refresh-receipts'].includes(button.id));document.querySelectorAll('input,textarea,select').forEach(input=>input.disabled=value); }
async function action(name,args={}) { if(busy)return;setBusy(true);notice((labels[name]||name)+'已提交，右侧可查看进度。');try { const data=await api('/api/action',{action:name,args});notice((labels[name]||name)+'完成。');return data;}catch(error){showError(error);throw error;}finally{setBusy(false);await refreshTasks();await refreshReceipts();} }
function time(seconds) { const s=Math.max(0,Math.floor(seconds));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }
function queueVideos() { const values=$('queue').value.split(/\s+/).map(v=>v.trim()).filter(Boolean);return [...new Map(values.map(value=>[value.match(/BV[0-9A-Za-z]{10}/)?.[0]||value,value])).values()]; }
function updateQueue() {
  const videos=queueVideos(), ids=new Set(videos.map(v=>v.match(/BV[0-9A-Za-z]{10}/)?.[0]||v));
  $('queue-count').textContent=videos.length+' 个视频 · 单次最多 '+maxBatch+' 个'+(videos.length>maxBatch?'，请分批保存':'');
  $('search-results').querySelectorAll('input[data-bvid]').forEach(check=>check.checked=ids.has(check.dataset.bvid));
  sessionStorage.setItem('bili-agent-queue',$('queue').value);
}
function addToQueue(value) {const current=queueVideos();if(!current.some(item=>(item.match(/BV[0-9A-Za-z]{10}/)?.[0]||item)===(value.match(/BV[0-9A-Za-z]{10}/)?.[0]||value)))current.push(value);$('queue').value=current.join('\n');updateQueue();}
function targets() {const value=$('target').value;return value==='default'?undefined:value==='watch_later'?[{kind:'watch_later'}]:[{kind:'favorite',folder_id:value}];}
function button(text,fn,cls='text-button') {const node=el('button',text,cls);node.type='button';node.disabled=busy;node.addEventListener('click',()=>Promise.resolve(fn()).catch(()=>{}));return node;}
async function refreshTasks() {
  try {
    const tasks=await api('/api/tasks'),container=$('tasks');
    const open=new Set([...container.querySelectorAll('.task details[open]')].map(node=>node.closest('.task').dataset.taskId));
    const focused=container.contains(document.activeElement)?document.activeElement.closest('.task')?.dataset.taskId:null;
    const scroll=container.scrollTop;
    const active=tasks.filter(task=>['queued','running'].includes(task.status)).sort((a,b)=>(a.status==='running'?-1:1)-(b.status==='running'?-1:1));
    const shown=[...active,...tasks.filter(task=>!['queued','running'].includes(task.status)).slice(0,Math.max(0,12-active.length))];
    container.replaceChildren();
    if(!shown.length){container.append(el('p','还没有任务。可以先核验登录。','empty'));return;}
    for(const task of shown){
      const box=el('div',undefined,'task'+(['queued','running'].includes(task.status)?' active':''));box.dataset.taskId=task.id;
      const title=el('div',undefined,'task-title');title.append(el('span',labels[task.operation]||task.operation),el('span',(task.elapsed_ms/1000).toFixed(1)+' 秒'));
      box.append(title,el('div',stages[task.stage]||task.stage,'stage'));
      if(task.error)box.append(el('div',(guidance[task.error.code]||task.error.message),'hint'));
      const cache=task.stages.filter(item=>item.stage.endsWith('_cache_hit'));
      if(cache.length)box.append(el('small','已复用缓存 · '+[...new Set(cache.map(item=>stages[item.stage]))].join('、')));
      if(task.stages.length){const details=el('details');details.open=open.has(task.id);details.append(el('summary','阶段记录'));for(const item of task.stages)details.append(el('div',new Date(item.at).toLocaleTimeString()+' '+(stages[item.stage]||item.stage)));box.append(details);}
      container.append(box);
      if(focused===task.id)box.querySelector('summary')?.focus({preventScroll:true});
    }
    container.scrollTop=scroll;
  }catch(error){if(error.code==='DASHBOARD_AUTH_REQUIRED')showError(error);}
}
function renderReceipt(receipt, container, allowVerify=true) {const box=el('div',undefined,'receipt');const status=statuses[receipt.status]||[receipt.status,'warning'];box.append(el('span',status[0],'badge '+status[1]),link(receipt.title||receipt.bvid,'https://www.bilibili.com/video/'+receipt.bvid+'/'));box.append(el('span',(receipt.target.kind==='favorite'?'收藏夹 '+receipt.target.folder_id:'稍后再看')+' · 最后更新 '+new Date(receipt.updated_at).toLocaleString(),'muted'));if(receipt.status==='pending_verification')box.append(el('span','当前尚未确认在目标中；不会自动重新添加。','muted'));if(receipt.error_code)box.append(el('span','诊断码：'+receipt.error_code,'muted'));if(allowVerify && ['pending_verification','prepared'].includes(receipt.status))box.append(button('只核验，不重新添加',async()=>{const result=await action('verify',{action_id:receipt.action_id});if(result)notice('核验结果：'+(statuses[result.status]?.[0]||result.status));}));container.append(box);}
let receiptsSnapshot='';
async function refreshReceipts(){try {const receipts=await api('/api/receipts'),snapshot=JSON.stringify(receipts);if(snapshot===receiptsSnapshot)return;receiptsSnapshot=snapshot;$('receipts').replaceChildren();if(!receipts.length)$('receipts').append(el('p','还没有当前账号的保存记录。','empty'));for(const receipt of receipts.slice(0,20))renderReceipt(receipt,$('receipts'));}catch{} }
async function readVideo(value,part,cursor){const continuing=Boolean(cursor);if(!continuing){currentRead=null;$('reader').replaceChildren(el('p','正在获取字幕，右侧可查看执行进度。','empty'));}try {const data=await action('read',{video:value,...(part?{part:Number(part)}:{}),...(cursor?{cursor}:{}),limit:200});if(!data)return;currentRead=continuing&&currentRead?{...data,cues:[...currentRead.cues,...data.cues]}:data;renderReader();}catch(error){if(!continuing){$('reader').replaceChildren(el('p',guidance[error.code]||error.message,'empty'));const actions=el('div',undefined,'button-row');actions.append(link('打开原视频',/^BV/.test(value)?'https://www.bilibili.com/video/'+value+'/':value),button('采样画面',()=>sampleFrames(value,part),'secondary'));$('reader').append(actions);}}}
function renderReader(){
  const data=currentRead,video=data.video,container=$('reader'),coverage=data.coverage;
  const previous=container.querySelector('.cues'),scroll=previous?.scrollTop||0;
  container.replaceChildren();
  container.append(el('h3',video.title,'reader-heading'),el('p','UP 主：'+video.creator+' · P'+video.part+' '+(video.parts.find(p=>p.part===video.part)?.title||'')+' · '+time(video.duration),'muted'));
  const info=el('div',undefined,'coverage');
  const displayedStart=data.cues.length?Math.min(...data.cues.map(cue=>cue.start)):coverage.start_seconds;
  const displayedEnd=data.cues.length?Math.max(...data.cues.map(cue=>cue.end)):coverage.end_seconds;
  info.append(el('span',data.data_source==='ai_subtitle'?'平台 AI 字幕，可能有识别错误':'人工/平台字幕','badge'),el('span','语言：'+data.language,'badge'),el('div','已显示 '+data.cues.length+' / '+coverage.total_cues+' 条字幕，时间范围 '+time(displayedStart)+'–'+time(displayedEnd)+'；'+(coverage.truncated?'还有字幕未显示。':'当前请求范围已显示完。')),el('div','此处为字幕证据，尚未完整分析画面与声音。'));
  container.append(info);
  const actions=el('div',undefined,'button-row');
  actions.append(link('打开原视频',video.url),button('加入保存队列',()=>{addToQueue(video.url);notice('已加入本地保存队列，尚未添加到 B 站。');},'secondary'),button('采样 1 张画面',()=>sampleFrames(video.url,video.part),'secondary'));
  container.append(actions);
  const cues=el('div',undefined,'cues');
  for(const cue of data.cues){const row=el('div',undefined,'cue');row.append(link(time(cue.start),cue.url),el('p',cue.text));cues.append(row);}
  container.append(cues);cues.scrollTop=scroll;
  if(coverage.truncated&&coverage.next_cursor)container.append(button('继续读取字幕',()=>readVideo(video.url,video.part,coverage.next_cursor),'secondary'));
  const select=$('part');select.replaceChildren();
  for(const p of video.parts){const option=el('option','P'+p.part+' · '+p.title);option.value=String(p.part);select.append(option);}
  select.value=String(video.part);$('video').value=video.url;
}
async function sampleFrames(value,part){const data=await action('frames',{video:value,...(part?{part:Number(part)}:{}),times:currentRead?[Math.round(currentRead.video.duration/2)]:[0]});if(!data)return;const frames=el('div',undefined,'frames');frames.append(el('p','采样画面仅代表这些时间点，不代表已看完整段视频。','hint'));for(const frame of data.frames){const figure=el('figure');const image=el('img');image.src='data:image/jpeg;base64,'+frame.data;image.alt='视频 '+time(frame.time_seconds)+' 的采样画面';figure.append(image,el('figcaption',time(frame.time_seconds)));frames.append(figure);}if(data.failures.length)frames.append(el('p','有 '+data.failures.length+' 个时间点未取得画面。','hint'));$('reader').append(frames);}
async function searchVideos(keyword,page=1){
  try{
    const data=await action('search',{keyword,limit:5,page});if(!data)return;
    lastSearch={keyword,page};
    const container=$('search-results'),items=data.videos||[];container.replaceChildren();
    container.append(el('p','第 '+data.page+' 页 · 显示 '+items.length+' 条候选 · 搜索命中约 '+data.total+' 条','hint'));
    if(!items.length)container.append(el('p','没有找到结果，可以换一个关键词。','empty'));
    for(const item of items){
      const value=item.url||'https://www.bilibili.com/video/'+item.bvid+'/';
      const box=el('div',undefined,'result-item'),check=el('input');check.type='checkbox';check.dataset.bvid=item.bvid;
      check.setAttribute('aria-label','把 '+item.title+' 加入保存队列');
      check.addEventListener('change',()=>{if(check.checked)addToQueue(value);else{$('queue').value=queueVideos().filter(v=>!v.includes(item.bvid)).join('\n');updateQueue();}});
      const content=el('div',undefined,'result-content');content.append(link(item.title,value),el('div',(item.creator||'')+' · '+(item.duration||''),'muted'));
      const actions=el('div',undefined,'result-actions');actions.append(button('读取字幕',()=>readVideo(value)),link('打开视频',value));content.append(actions);box.append(check,content);container.append(box);
    }
    const paging=el('div',undefined,'button-row');
    if(page>1)paging.append(button('上一页',()=>searchVideos(keyword,page-1),'secondary'));
    if(data.next_page)paging.append(button('下一页',()=>searchVideos(keyword,data.next_page),'secondary'));
    container.append(paging);updateQueue();
  }catch{}
}
$('search-form').addEventListener('submit',event=>{event.preventDefault();searchVideos($('keyword').value.trim());});
$('read-form').addEventListener('submit',event=>{event.preventDefault();readVideo($('video').value.trim(),$('part').value).catch(()=>{});});
$('video').addEventListener('input',()=>{$('part').replaceChildren(el('option','按链接选择分 P'));$('part').firstChild.value='';});
$('part').addEventListener('change',()=>{if(currentRead)readVideo(currentRead.video.url,$('part').value).catch(()=>{});});
$('queue').addEventListener('input',updateQueue);
$('check').addEventListener('click',async()=>{try{const result=await action('check');if(!result)return;const verified=result.logged_in&&result.account_matches;$('connection').textContent=verified?'已核验登录'+(result.name?' · '+result.name:'')+'（'+new Date().toLocaleTimeString()+'）':!result.account_bound?'尚未绑定账号':!result.logged_in?'登录已失效':'账号与绑定不符';notice(verified?'登录核验通过。可以读取资料和保存。':!result.account_bound?guidance.SETUP_REQUIRED:!result.logged_in?guidance.LOGIN_REQUIRED:guidance.ACCOUNT_MISMATCH,!verified);}catch{}});
$('open-browser').addEventListener('click',async()=>{
  try{
    const result=await action('connect');if(!result)return;
    if(result.login_pending){$('connection').textContent='等待扫码 · 完成后再次点击连接';$('open-browser').textContent='已扫码，连接账号';notice('已打开受控 B 站浏览器。请在独立 Edge/Chrome 窗口扫码，完成后回到这里点击“已扫码，连接账号”。');}
    else if(result.logged_in&&result.account_matches){$('connection').textContent='已核验并连接'+(result.name?' · '+result.name:'')+'（'+new Date().toLocaleTimeString()+'）';$('open-browser').textContent='登录/连接 B站';notice('账号已连接，可以读取资料并保存推荐。');}
  }catch{}
});
$('load-folders').addEventListener('click',async()=>{try{const result=await action('folders');if(!result)return;const select=$('target');select.querySelectorAll('option[data-folder]').forEach(n=>n.remove());for(const folder of result){const option=el('option',folder.title);option.value=folder.id;option.dataset.folder='true';select.append(option);}notice('已加载 '+result.length+' 个本人收藏夹，请在保存目标中选择。');}catch{}});
for(const name of ['preview','save'])$(name).addEventListener('click',async()=>{const videos=queueVideos();if(!videos.length){notice('请先选择视频或粘贴链接。',true);return;}if(videos.length>maxBatch){notice('本次有 '+videos.length+' 个视频，单次最多 '+maxBatch+' 个，请分批保存。',true);return;}try{const data=await action(name,{videos,...(targets()?{targets:targets()}:{})});if(!data)return;const container=$('save-result');container.replaceChildren();if(data.preview){container.append(el('p','仅预览，尚未向 B 站添加任何视频。','badge warning'));for(const item of data.planned)container.append(el('div',item.title+' · '+(item.target.kind==='favorite'?'收藏夹 '+item.target.folder_id:'稍后再看')+' · '+(item.would_add?'将添加':'已存在，无需添加'),'receipt'));}else{for(const receipt of data.receipts)renderReceipt(receipt,container);notice(data.all_verified?'本批次保存状态均已确认。':'部分项目未确认，请查看逐条结果并只核验待确认项。',!data.all_verified);}for(const error of data.errors)container.append(el('p',error.video+'：'+(guidance[error.error.code]||error.error.message),'hint failure'));}catch{}});
$('refresh-receipts').addEventListener('click',refreshReceipts);
async function init(){try{const data=await api('/api/status');$('version').textContent='v'+data.version+(data.demo?' · 演示数据':'');maxBatch=data.max_save_batch||10;$('connection').textContent=data.account_bound?'本地已绑定 · 尚未在线核验':'尚未绑定账号';$('mode').textContent=(data.browser_mode==='managed'?'独立持久浏览器':'复用现有浏览器')+' · '+data.browser+' · 自动保存推荐'+(data.auto_save?'开启':'关闭');const defaults=data.default_targets.map(t=>t.kind==='watch_later'?'稍后再看':'收藏夹 '+t.folder_id).join(' + ');$('target').options[0].textContent='默认：'+defaults;$('queue').value=sessionStorage.getItem('bili-agent-queue')||'';if(data.demo)notice('当前为本地模拟数据，所有操作只影响临时测试环境，不会连接真实 B 站。');updateQueue();await refreshTasks();await refreshReceipts();}catch(error){$('connection').textContent='本地服务未连接';showError(error);}}
init();setInterval(refreshTasks,1000);setInterval(refreshReceipts,5000);
`;
