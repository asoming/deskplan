'use strict';
const {spawn,execFileSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
function findExecutable() {
 const dist=path.resolve(__dirname,'../dist');
 if(process.platform==='win32')return path.join(dist,'win-unpacked','rixu.exe');
 if(process.platform==='linux')return path.join(dist,'linux-unpacked','rixu');
 const folder=path.join(dist,process.arch==='arm64'?'mac-arm64':'mac','日序.app','Contents','MacOS');
 return path.join(folder,fs.readdirSync(folder).find(n=>!n.startsWith('.')));
}
const binary=process.argv[2]||findExecutable(),reopening=!!process.env.RIXU_SMOKE_REOPEN_DIR,directory=process.env.RIXU_SMOKE_REOPEN_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'rixu-package-'));
const flags=['--remote-debugging-port=0'];if(process.env.RIXU_CI_NO_SANDBOX==='1')flags.push('--no-sandbox');
const child=spawn(binary,flags,{env:{...process.env,RIXU_DATA_DIR:directory},stdio:['ignore','pipe','pipe']});
let buffer='',socket,seq=0,finished=false;const pending=new Map();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
function failStop(error) {
 console.error(error); clearTimeout(timeout); socket?.close(); child.kill(); process.exitCode=1;
 // Only terminate the test's own child if graceful shutdown is stuck.
 setTimeout(()=>{ if(child.exitCode===null)child.kill('SIGKILL');process.exit(1); },2000).unref();
}
const timeout=setTimeout(()=>failStop('Packaged app timeout: '+buffer),60000);
const endpoint=new Promise((resolve,reject)=>{child.stderr.on('data',chunk=>{buffer+=chunk.toString();const m=buffer.match(/DevTools listening on (ws:\/\/\S+)/);if(m)resolve(m[1]);});child.on('error',reject);child.on('exit',(code)=>{if(!finished)reject(Error('Packaged app exited before completion: '+code+' '+buffer));});});
function rpc(method,params){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await rpc('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
(async()=>{
 const url=new URL(await endpoint);let page;
 for(let i=0;i<100;i++){const pages=await(await fetch(`http://${url.host}/json/list`)).json();page=pages.find(p=>p.type==='page'&&p.url.endsWith('/renderer/index.html'));if(page)break;await sleep(100);}
 assert.ok(page,'packaged renderer page');socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 socket.addEventListener('message',e=>{const data=JSON.parse(e.data),item=pending.get(data.id);if(!item)return;pending.delete(data.id);data.error?item.reject(Error(JSON.stringify(data.error))):item.resolve(data.result);});
 for(let i=0;i<100;i++){if(await evaluate('!!window.fourfold && document.querySelectorAll(".zone").length===4'))break;await sleep(100);}
 const initial=await evaluate('window.fourfold.call("state")');assert.equal(initial.tasks.length,reopening?1:0);assert.equal(initial.native.version,require('../package.json').version);assert.equal(initial.native.autoStartSupported,true);
 if (!reopening) {
 await evaluate('document.querySelector("#new-task").click()');await sleep(150);
 await evaluate('document.querySelector("#task-title").value="Packaged save / 正式包保存";document.querySelector("#task-checklist").value="准备资料\\n检查结果";document.querySelector("#task-checklist").dispatchEvent(new Event("input"));document.querySelector("#task-form").requestSubmit()');
 for(let i=0;i<100;i++){if(fs.existsSync(path.join(directory,'tasks.json'))&&JSON.parse(fs.readFileSync(path.join(directory,'tasks.json'),'utf8')).tasks.length===1)break;await sleep(50);}
 await evaluate('document.querySelector("#board [data-card-step]").click()');
 for(let i=0;i<100;i++){if(JSON.parse(fs.readFileSync(path.join(directory,'tasks.json'),'utf8')).tasks[0].checklist[0].done)break;await sleep(50);}
 await evaluate('document.querySelector("#settings-button").click();const language=document.querySelector("[data-setting=language]");language.value="en";language.dispatchEvent(new Event("change",{bubbles:true}));');
 for(let i=0;i<100;i++){if(await evaluate('document.documentElement.lang==="en-US"'))break;await sleep(50);}
 } else { assert.equal(initial.settings.language,'en'); }
 assert.equal(await evaluate('document.documentElement.lang'),'en-US');
 assert.equal(await evaluate('document.title'),'Rixu');
 const saved=JSON.parse(fs.readFileSync(path.join(directory,'tasks.json'),'utf8'));assert.equal(saved.tasks[0].title,'Packaged save / 正式包保存');assert.equal(saved.schemaVersion,3);assert.equal(saved.settings.language,'en');
 assert.deepEqual(saved.tasks[0].checklist.map(i=>({text:i.text,done:i.done})),[{text:'准备资料',done:true},{text:'检查结果',done:false}]);
 assert.deepEqual(await evaluate('[...document.querySelectorAll("#board .card-step span")].map(e=>e.textContent)'),['准备资料','检查结果']);
 const result={passed:true,platform:process.platform,arch:process.arch,version:initial.native.version,checks:['packaged executable','asar preload and renderer','packaged integrations','UI create','durable schema 3 save','checklist steps visible and toggled in packaged app; retained after restart','clean exit'],sandbox:!flags.includes('--no-sandbox')};
 finished=true;evaluate('window.fourfold.call("window:quit")').catch(()=>{});const ended=await exit;assert.equal(ended.code,0);socket.close();clearTimeout(timeout);
 if (reopening) return;
 execFileSync(process.execPath,[__filename,binary],{env:{...process.env,RIXU_SMOKE_REOPEN_DIR:directory},stdio:'inherit',timeout:90000});
 result.checks.push('English switch through settings','language and tasks retained after full process restart');
 const artifacts=process.env.RIXU_ARTIFACTS_DIR;if(artifacts){fs.mkdirSync(artifacts,{recursive:true});fs.writeFileSync(path.join(artifacts,process.argv[2] ? 'installed-package-test.json' : 'package-test.json'),JSON.stringify(result,null,2));}console.log(JSON.stringify(result));
})().catch(failStop);
