'use strict';
const assert=require('node:assert/strict');
const {BrowserWindow,shell}=require('electron');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=async function(runtime,js,call,setResponse){
  const win=runtime.window;
  assert.equal(await js('document.querySelectorAll("#lock-panel,#minimize,#close-window,#quit,[data-setting=closeToTray]").length'),0);
  await assert.rejects(call('window:lock',{locked:true}));
  await assert.rejects(call('window:minimize'));
  win.close();await sleep(50);assert.equal(win.isDestroyed(),false,'only explicit Quit exits');
  const menu=runtime.panelMenu();assert.ok(menu.getMenuItemById('quit'));assert.ok(menu.getMenuItemById('position'));
  await call('window:compact',{enabled:true});
  assert.deepEqual(await js('[...document.querySelectorAll(".tool-rail button")].filter(e=>e.getClientRects().length).map(e=>e.id)'),['new-task','compact-toggle']);
  if(process.platform==='linux') {
    await call('settings',{positionFixed:false,windowPosition:'manual'});const before=win.getBounds();
    await require('node:util').promisify(require('node:child_process').execFile)('python3',[require('node:path').join(__dirname,'x11-drag.py'),String(before.x+before.width-25),String(before.y+before.height-35),'-35','40']);await sleep(100);
    assert.equal(win.getBounds().x,before.x-35);assert.equal(win.getBounds().y,before.y+40,'mini blank area can move the panel');
    await call('settings',{positionFixed:true});
  }
  const fs=require('node:fs'),path=require('node:path');
  if(process.env.RIXU_ARTIFACTS_DIR) fs.writeFileSync(path.join(process.env.RIXU_ARTIFACTS_DIR,'mini-two-buttons.png'),(await win.webContents.capturePage()).toPNG());
  runtime.panelMenu().getMenuItemById('settings').click();await sleep(100);
  assert.equal(await js('document.querySelector("#settings-dialog").open'),true);
  await js('document.querySelector("#settings-dialog").close()');
  await call('window:compact',{enabled:false});
  const other=new BrowserWindow({width:250,height:150,show:true});
  try {
    other.focus();await sleep(100);await runtime.updater.check();await sleep(100);
    assert.equal(other.isFocused(),true);assert.equal(await js('document.querySelector("#update-dialog").open'),false,'background check must defer popup');
    win.focus();
    for(let i=0;i<40 && !await js('document.querySelector("#update-dialog").open');i++)await sleep(50);
    assert.equal(win.isFocused(),true,'planner receives native focus');
    assert.equal(await js('document.querySelector("#update-dialog").open'),true,'returning native window focus shows the pending update');
    assert.equal(runtime.updater.state.notifiedVersion,'9.8.7');
    await call('settings',{language:'en'});
    assert.match(await js('document.querySelector("#update-versions").textContent'),/Current .*New 9.8.7/);
    assert.deepEqual(await js('window.RixuI18n.missing()'),[]);
    let opened;const original=shell.openExternal;shell.openExternal=async url=>{opened=url;};
    try {await call('updates:open');assert.equal(opened,'https://github.com/asoming/deskplan/releases/tag/v9.8.7');} finally {shell.openExternal=original;}
    await js('document.querySelector("#dismiss-update").click()');
    other.focus();win.focus();await sleep(100);assert.equal(await js('document.querySelector("#update-dialog").open'),false,'one automatic prompt per version');
    await js('document.querySelector("#settings-button").click()');
    setResponse(Error('offline'));await call('updates:check');await sleep(50);
    assert.match(await js('document.querySelector("#update-status").textContent'),/Could not reach GitHub/);
    setResponse({tag_name:'v9.8.7',draft:false,prerelease:false});
    await js('document.querySelector("#check-updates").click()');await sleep(200);
    assert.equal(await js('document.querySelector("#update-dialog").open'),true,'manual check can show an acknowledged release');
    await js('document.querySelector("#dismiss-update").click();document.querySelector("#settings-dialog").close()');
    setResponse({tag_name:'v1.0.0',draft:false,prerelease:false});await call('updates:check');
    assert.equal(runtime.updater.state.status,'current');
  } finally {other.destroy();await call('settings',{language:'zh-CN',windowPosition:'top-right',positionFixed:true});}
};
