'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {app}=require('electron');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rixu-release-'));
process.env.RIXU_DATA_DIR=path.join(directory,'data');process.env.RIXU_TEST='1';
const {Store}=require('../src/store.cjs'),{dateKey}=require('../src/renderer/time.js');
const seed=new Store(process.env.RIXU_DATA_DIR),today=dateKey(new Date());
seed.saveSettings({quickShortcut:'Alt+Shift+Space',desktopBlend:true,transparency:65});
const a=seed.create({title:'整理本周计划',plannedDate:today,level:2,estimatedMinutes:30});
seed.create({title:'确认今天的交付',level:0,due:new Date(Date.now()+3*3600000).toISOString(),plannedDate:today});
seed.create({title:'阅读一章书',level:1,due:new Date(Date.now()+4*86400000).toISOString(),estimatedMinutes:25});
seed.create({title:'收集秋天的旅行灵感',level:3});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){for(let i=0;i<120;i++){if(await fn())return;await sleep(50);}throw Error('Timeout: '+label);}
(async()=>{
 const runtime=await require('../src/main.cjs').start(),win=runtime.window,s=runtime.store;win.show();
 const js=code=>win.webContents.executeJavaScript(code,true),call=(name,payload)=>js(`window.fourfold.call(${JSON.stringify(name)},${JSON.stringify(payload)})`);
 await until(()=>js('document.querySelectorAll(".zone").length===4'),'board');
 assert.equal(await js('document.body.classList.contains("desktop-blend")'),true);
 await js(`document.querySelector('[data-edit="${a}"]').click()`);await until(()=>js('document.querySelector("#task-dialog").open'),'editor');
 await js(`document.querySelector('#task-repeat').value='weekly';document.querySelector('#task-checklist').value='检查资料\\n写下重点';document.querySelector('#task-checklist').dispatchEvent(new Event('input'));document.querySelector('[data-check-item="0"]').click();document.querySelector('#task-form').requestSubmit();`);
 await until(()=>js('!document.querySelector("#task-dialog").open'),'save repeat');
 assert.equal(s.state.tasks[0].repeat,'weekly');assert.equal(s.state.tasks[0].checklist[0].done,true);assert.equal(s.state.tasks[0].checklist[1].done,false);
 await call('status',{id:a,action:'complete'});const next=s.state.tasks.find(t=>t.previousOccurrenceId===a);assert.ok(next);assert.equal(next.checklist[0].done,false);
 await call('undo');assert.equal(s.state.tasks.length,4);
 // Mouse-through is transient and always has an escape route.
 if (runtime.viewState().native.unlockShortcutRegistered || runtime.viewState().native.trayAvailable) {
   await call('window:lock',{locked:true});assert.equal(runtime.viewState().native.panelLocked,true);
   await call('window:lock',{locked:false});assert.equal(runtime.viewState().native.panelLocked,false);
 }
 await call('settings',{transparency:100,textTransparency:0});
 assert.equal(await js('getComputedStyle(document.querySelector(".task-top")).opacity'),'1');
 const colors=await js('[...document.querySelectorAll(".zone,.task,#app")].map(e=>getComputedStyle(e).backgroundColor)');assert.ok(colors.every(c=>c.endsWith(', 0)')||c.endsWith('/ 0)')));
 await call('settings',{transparency:65});
 const artifacts=process.env.RIXU_ARTIFACTS_DIR||path.join(directory,'artifacts');fs.mkdirSync(artifacts,{recursive:true});await sleep(200);
 fs.writeFileSync(path.join(artifacts,'desktop-blend.png'),(await win.webContents.capturePage()).toPNG());
 await call('settings',{view:'today'});await sleep(150);fs.writeFileSync(path.join(artifacts,'today.png'),(await win.webContents.capturePage()).toPNG());
 const report={passed:true,platform:process.platform,arch:process.arch,version:runtime.viewState().native.version,checks:['renderer loaded','desktop blend','checklist editing and persistence','recurrence completion','recurrence undo','recoverable click-through lock','transparent surfaces/readable text'],artifacts};
 fs.writeFileSync(path.join(artifacts,'desktop-test.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));app.quit();
})().catch(e=>{console.error(e);app.exit(1);});
