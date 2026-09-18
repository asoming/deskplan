// Run with Electron in an isolated display: electron scripts/capture-demo.cjs en|zh-CN.
// Uses disposable sample tasks only. Never opens the user's saved planner data.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {app,BrowserWindow}=require('electron');
const lang=process.argv[2]==='zh-CN'?'zh-CN':'en',cn=lang==='zh-CN';
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'deskplan-demo-'));
process.env.RIXU_DATA_DIR=temporary;process.env.RIXU_TEST='1';
const out=process.env.RIXU_ARTIFACTS_DIR||path.join(temporary,'frames');fs.mkdirSync(out,{recursive:true});
const {Store}=require('../src/store.cjs'),{dateKey}=require('../src/renderer/time.js');
const seed=new Store(temporary),today=dateKey(new Date());
const a=seed.create({title:cn?'准备周五的分享':'Prepare Friday’s presentation',level:1,due:new Date(Date.now()+3*86400000).toISOString(),plannedDate:today,estimatedMinutes:45});
const b=seed.create({title:cn?'读完下一章':'Read the next chapter',level:2,plannedDate:today,estimatedMinutes:20});
seed.create({title:cn?'收集周末出游灵感':'Collect weekend trip ideas',level:3});seed.plan(a,{day:today,focus:true});seed.plan(b,{day:today,focus:true});
seed.saveSettings({language:lang,theme:'light',view:'quadrants',windowSize:'normal',windowFixed:false,windowPosition:'manual',transparency:0,textTransparency:0,desktopBlend:false,quietControls:false,calendarOpen:false,quickCapture:false,autoCheckUpdates:false});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const runtime=await require('../src/main.cjs').start(),win=runtime.window;win.setBounds({x:50,y:50,width:980,height:600});win.show();
 const js=x=>win.webContents.executeJavaScript(x,true),call=(name,payload)=>js(`window.fourfold.call(${JSON.stringify(name)},${JSON.stringify(payload)})`);
 await pause(400);
 const frame=new BrowserWindow({width:1040,height:720,frame:false,show:false,webPreferences:{sandbox:true}});
 let count=0;const shots=[];
 async function shot(caption,duration=1800,poster=false){
  await pause(300);const png=(await win.webContents.capturePage()).toPNG();
  if(poster)fs.writeFileSync(path.join(__dirname,'../site/assets',`planner-${lang}.png`),png);
  const tiny=win.getSize()[0]<500;
  await frame.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(`<!doctype html><html><body style="margin:0;background:#eaf1ee;color:#193b35;font:20px system-ui"><div style="height:650px;display:flex;align-items:center;justify-content:center"><img style="max-width:980px;max-height:600px;border:1px solid #cadbd2;border-radius:12px;box-shadow:0 14px 36px #173d3520;${tiny?'width:390px':''}" src="data:image/png;base64,${png.toString('base64')}"></div><div style="padding:0 30px;display:flex;justify-content:space-between"><b>DeskPlan <span style="font-weight:400">· ${caption}</span></b><small style="font-size:14px">${cn?'真实应用 · 示例任务':'Actual app · Sample tasks'}</small></div></body></html>`));
  const name=String(count++).padStart(2,'0')+'.png';fs.writeFileSync(path.join(out,name),(await frame.webContents.capturePage()).toPNG());shots.push({name,duration});
 }
 await shot(cn?'把任务放在桌面':'Keep your plan on the desktop',1700);
 const file=path.join(temporary,cn?'发布方案.md':'Launch brief.md');fs.writeFileSync(file,'Sample project brief for the public demo.');
 win.webContents.debugger.attach('1.3');
 await js(`(()=>{const i=document.createElement('input');i.type='file';i.id='demo-file';i.hidden=true;document.body.append(i)})()`);
 const doc=await win.webContents.debugger.sendCommand('DOM.getDocument');const node=await win.webContents.debugger.sendCommand('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#demo-file'});
 await win.webContents.debugger.sendCommand('DOM.setFileInputFiles',{nodeId:node.nodeId,files:[file]});
 await js(`(()=>{const dt=new DataTransfer();dt.items.add(document.querySelector('#demo-file').files[0]);document.querySelector('[data-level="0"]').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));})()`);
 await pause(300);const dropped=runtime.store.state.tasks.find(t=>t.files.some(f=>f.path===file));assert(dropped,'Native file drop must create a linked task');
 win.webContents.debugger.detach();await shot(cn?'拖入文件，变成任务':'Drop a file. Make it a task.',2200);
 await call('update',{id:dropped.id,patch:{due:new Date(Date.now()+10*3600000).toISOString(),plannedDate:today,estimatedMinutes:30,checklist:[{id:require('node:crypto').randomUUID(),text:cn?'整理资料':'Gather notes',done:true},{id:require('node:crypto').randomUUID(),text:cn?'检查并发送':'Review and send',done:false}]}});
 await pause(2500);await shot(cn?'截止时间与步骤，一眼看清':'Deadlines and steps, at a glance',2300,true);
 await call('settings',{view:'today'});await shot(cn?'今天，先做好最重要的事':'Today: start with what matters',2200);
 await call('plan',{id:b,day:dateKey(new Date(Date.now()+86400000))});await call('settings',{view:'week'});await shot(cn?'本周，给每件事安排时间':'This week: give each task a day',2200);
 await call('settings',{view:'quadrants'});await call('current',{id:dropped.id});await call('window:compact',{enabled:true});await shot(cn?'缩成小窗，留出工作空间':'Go small. Leave room to work.',2200);
 await call('window:compact',{enabled:false});await shot(cn?'无需账号，离线可用':'No account. Works offline.',2200);
 fs.writeFileSync(path.join(out,'frames.json'),JSON.stringify(shots,null,2));console.log(JSON.stringify({passed:true,language:lang,frames:shots.length,duration:shots.reduce((n,s)=>n+s.duration,0),directory:out}));app.exit(0);
})().catch(e=>{console.error(e);app.exit(1)});
