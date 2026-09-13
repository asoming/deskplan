'use strict';
const assert=require('node:assert/strict');
const {screen,BrowserWindow}=require('electron');
const {panelBounds}=require('../src/window-layout.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
module.exports=async function checkWindow(runtime,js,call){
 const win=runtime.window;
 const area=screen.getDisplayMatching(win.getBounds()).workArea;
 assert.deepEqual(win.getBounds(),panelBounds(runtime.store.state.settings,win.getBounds(),area));
 assert.equal(win.isAlwaysOnTop(),false);
 assert.equal(await js('getComputedStyle(document.querySelector(".rail-spacer")).webkitAppRegion'),'no-drag');
 assert.equal(await js('document.querySelectorAll(".brand,.tool-rail img").length'),0);
 const rail=await js('(()=>{const r=document.querySelector(".tool-rail");return {width:r.getBoundingClientRect().width,scroll:r.scrollHeight,height:r.clientHeight,buttons:[...r.querySelectorAll("button")].every(b=>b.title&&b.getAttribute("aria-label"))}})()');
 assert.equal(rail.width,44);assert.ok(rail.scroll<=rail.height,'full sidebar fits');assert.equal(rail.buttons,true);
 const initial=win.getBounds();
 assert.equal(initial.x+initial.width,area.x+area.width);assert.equal(initial.y,area.y);
 assert.equal(await js('document.querySelectorAll("#position-status,#view-caption,header.toolbar").length'),0);
 assert.equal(await js('getComputedStyle(document.body).paddingTop'), '0px');
 assert.equal(await js('document.querySelector("#app").getBoundingClientRect().right'),initial.width);
 assert.equal(await js('document.querySelector("#app").getBoundingClientRect().top'),0);
 await js('document.querySelector("#position-toggle").click()');await sleep(100);
 assert.equal(runtime.store.state.settings.positionFixed,false);
 assert.equal(runtime.store.state.settings.windowPosition,'manual');
 assert.equal(await js('getComputedStyle(document.querySelector(".rail-spacer")).webkitAppRegion'),'drag');
 win.setPosition(area.x+64,area.y+80);await sleep(100);
 await js('document.querySelector("#position-toggle").click()');await sleep(100);
 const manual=win.getBounds();
 await call('settings',{language:'en',transparency:45});assert.deepEqual(win.getBounds(),manual);
 assert.equal(await js('document.querySelector("#position-toggle").title'),'Unlock position');
 await call('window:compact',{enabled:true});assert.equal(win.isAlwaysOnTop(),false);
 await call('window:compact',{enabled:false});assert.deepEqual(win.getBounds(),manual);
 await call('settings',{windowPosition:'top-right',desktopInset:96});
 assert.equal(win.getBounds().x,initial.x-96);
 await js('document.querySelector("#dock-right").click()');await sleep(100);
 assert.equal(runtime.store.state.settings.positionFixed,true);assert.equal(win.getBounds().x,initial.x);
 assert.equal(runtime.store.state.settings.desktopInset,0);
 await call('settings',{alwaysOnTop:true});assert.equal(win.isAlwaysOnTop(),false);
 // Background deadlines must not steal focus from another ordinary application window.
 const other=new BrowserWindow({width:300,height:200,show:true});
 try { other.focus();await sleep(150);assert.equal(other.isFocused(),true);runtime.clockCheck();await sleep(100);assert.equal(other.isFocused(),true);assert.equal(win.isAlwaysOnTop(),false); }
 finally { other.destroy(); }
 const covering = new BrowserWindow({width:320,height:240,show:true});
 try {
  covering.focus();await sleep(150);
  const checkLayer = () => {
   if(process.platform==='linux') {
    const {execFileSync}=require('node:child_process');
    const id=win.getNativeWindowHandle().readUInt32LE(0), otherId=covering.getNativeWindowHandle().readUInt32LE(0);
    const type=execFileSync('xprop',['-id',String(id),'_NET_WM_WINDOW_TYPE'],{encoding:'utf8'});
    assert.match(type,/_NET_WM_WINDOW_TYPE_DESKTOP/);
    const order=execFileSync('xprop',['-root','_NET_CLIENT_LIST_STACKING'],{encoding:'utf8'}).match(/0x[0-9a-f]+/g).map(n=>parseInt(n,16));
    assert.ok(order.includes(id)&&order.includes(otherId));assert.ok(order.indexOf(id)<order.indexOf(otherId),'panel must stay below other windows after focus');
   } else if(process.platform==='win32') {
    const layer=require('../src/native/build/Release/window_layer.node');
    assert.equal(layer.isBelow(win.getNativeWindowHandle(),covering.getNativeWindowHandle()),true);
   }
  };
  checkLayer();
  if(process.platform==='linux') {
   const point=await js('(()=>{const r=document.querySelector("#new-task").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
   const bounds=win.getBounds();
   require('node:child_process').execFileSync('python3',[require('node:path').join(__dirname,'x11-click-type.py'),String(Math.round(bounds.x+point.x)),String(Math.round(bounds.y+point.y))]);
   await sleep(200);assert.equal(await js('document.querySelector("#task-title").value'),'a','desktop layer receives real click and keyboard input');
   checkLayer();await js('document.querySelector("#task-dialog").close()');
  }
  win.focus();await sleep(150);checkLayer();
  win.moveTop();await sleep(150);checkLayer();
  await call('window:compact',{enabled:true});win.focus();await sleep(150);checkLayer();
  await call('window:compact',{enabled:false});
 } finally { covering.destroy(); }

 await call('settings',{language:'zh-CN',desktopInset:0,transparency:65});
};
