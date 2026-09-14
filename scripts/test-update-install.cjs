'use strict';
// Run inside an isolated desktop/CI session, using only temporary installations and data.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const version=require('../package.json').version;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function prepare(){
 const [targetFile,candidateFile,directory,port]=process.argv.slice(3);
 const {prepareInstall,launchInstall}=require('../src/update-installer.cjs');
 const target=JSON.parse(fs.readFileSync(targetFile)),candidate=JSON.parse(fs.readFileSync(candidateFile));
 const plan=await prepareInstall({candidate,target,directory});
 if(process.platform==='linux'&&process.env.CI){const helper=path.join(plan.prepared,'chrome-sandbox');execFileSync('sudo',['chown','root:root',helper]);execFileSync('sudo',['chmod','4755',helper]);}
 plan.restartArgs=['--remote-debugging-port='+port];
 await launchInstall({plan,directory});
}
async function test(binary, candidateFile, kind){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rixu-update-integration-')),data=path.join(directory,'data');
 const {Store}=require('../src/store.cjs');const store=new Store(data);store.create({title:'Keep through update / 更新保留',notes:'unchanged'});store.saveSettings({language:'en',autoUpdates:false,quickCapture:false});const tasks=JSON.stringify(store.snapshot().tasks);
 const electron=require('electron');let root,executable;
 if(kind==='mac') {root=path.join(directory,'日序.app');fs.cpSync(path.resolve(binary,'../../..'),root,{recursive:true,verbatimSymlinks:true});executable=path.join(root,'Contents','MacOS',path.basename(binary));}
 else {root=path.join(directory,'installed');fs.cpSync(path.dirname(binary),root,{recursive:true});executable=path.join(root,path.basename(binary));}
 if(process.platform==='linux'&&process.env.CI){execFileSync('sudo',['chown','root:root',path.join(root,'chrome-sandbox')]);execFileSync('sudo',['chmod','4755',path.join(root,'chrome-sandbox')]);}
 const server=require('node:net').createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
 fs.writeFileSync(path.join(directory,'target.json'),JSON.stringify({kind,root,executable}));fs.writeFileSync(path.join(directory,'candidate.json'),JSON.stringify({kind,file:candidateFile,version}));
 const env={...process.env,RIXU_DATA_DIR:data,ELECTRON_RUN_AS_NODE:'1'};
 const child=spawn(electron,[__filename,'prepare',path.join(directory,'target.json'),path.join(directory,'candidate.json'),directory,String(port)],{env,stdio:'inherit'});
 await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('update helper preparation failed: '+code)));});
 let page;
 for(let i=0;i<200;i++) {try{page=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(p=>p.type==='page'&&p.url.endsWith('/renderer/index.html'));if(page)break;}catch{}await sleep(100);}
 assert.ok(page,'the installed update restarts its real renderer');
 const socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});let sequence=0;const pending=new Map();socket.addEventListener('message',e=>{const d=JSON.parse(e.data),p=pending.get(d.id);if(p){pending.delete(d.id);d.error?p.reject(Error(JSON.stringify(d.error))):p.resolve(d.result);}});
 const evaluate=expression=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve:r=>r.exceptionDetails?reject(Error(JSON.stringify(r.exceptionDetails))):resolve(r.result.value),reject});socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));});
 try {
 let state;for(let i=0;i<100;i++){state=await evaluate('window.fourfold?.call("state")');if(state?.tasks)break;await sleep(50);}
 assert.equal(state.native.version,version);assert.equal(JSON.stringify(state.tasks),tasks);assert.equal(state.settings.language,'en');await sleep(3500);if(kind!=='nsis')assert.ok(fs.readdirSync(directory).some(n=>n.includes('.before-update-')));
 console.log('Real update replacement, helper handoff, restart and data preservation passed:',kind);
 }finally{evaluate('window.fourfold.call("window:quit")').catch(()=>{});await sleep(1000);socket.close();}
 return 'real '+kind+' update replacement, restart, backup runtime and data preservation';
}
if(process.argv[2]==='prepare')prepare().catch(e=>{console.error(e);try{console.error(fs.readFileSync(path.join(process.argv[5],'install.log'),'utf8'));}catch{}process.exitCode=1;});
module.exports={test};
