'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { app } = require('electron');
const directory = process.env.FOURFOLD_SMOKE_DIR ? path.join(process.env.FOURFOLD_SMOKE_DIR, `run-${Date.now()}`) : fs.mkdtempSync(path.join(os.tmpdir(), 'fourfold-desktop-'));
fs.mkdirSync(directory, { recursive: true });
process.env.FOURFOLD_DATA_DIR = path.join(directory, 'data'); process.env.FOURFOLD_TEST = '1';
fs.mkdirSync(process.env.FOURFOLD_DATA_DIR, { recursive: true });
const { Store } = require('../src/store.cjs');
const seed = new Store(process.env.FOURFOLD_DATA_DIR);
const now = Date.now();
const a = seed.create({ title: '准备周三汇报', level: 1, due: new Date(now + 72 * 3600000).toISOString() });
seed.create({ title: '提交项目方案', level: 0, due: new Date(now + 9 * 3600000).toISOString() });
seed.create({ title: '完成学习笔记', level: 2, due: new Date(now + 8 * 86400000).toISOString() });
seed.create({ title: '收集旅行灵感', level: 3 });
const sample = path.join(directory, '汇报资料.txt'); fs.writeFileSync(sample, 'Local attachment test.'); seed.attach(a, [{ path: sample, name: path.basename(sample) }]);
const started = require('../src/main.cjs').start();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label) { for (let i = 0; i < 80; i++) { if (await fn()) return; await sleep(50); } throw new Error('Timed out: ' + label); }

(async () => {
  const { window: win, store } = await started;
  win.show();
  const execute = source => win.webContents.executeJavaScript(source, true);
  const failures = [];
  win.webContents.on('console-message', (_event, details) => { if (details.level === 'error') failures.push(details.message); });
  await until(() => execute('document.querySelectorAll(".task").length === 4'), 'initial render');
  assert.equal(await execute('typeof require'), 'undefined');
  assert.equal(await execute('typeof window.fourfold.call'), 'function');
  assert.equal(await execute(`document.querySelector('[data-task="${a}"]').closest('[data-level]').dataset.level`), '1');

  await execute('document.querySelector("#new-task").click()');
  await until(() => execute('document.querySelector("#task-dialog").open'), 'open editor');
  await execute(`document.querySelector('#task-title').value = '<img src=x onerror="window.bad=1">'; document.querySelector('#task-title').dispatchEvent(new Event('input')); document.querySelector('#task-level').value = '2'; document.querySelector('#task-form').requestSubmit()`);
  await until(() => execute('!document.querySelector("#task-dialog").open'), 'save editor');
  assert.equal(store.state.tasks.length, 5); assert.equal(await execute('window.bad'), undefined);
  assert.equal(await execute('document.querySelectorAll(".task img").length'), 0);

  await execute('document.querySelector("#calendar-toggle").click()');
  await until(() => execute('!document.querySelector("#calendar").hidden'), 'calendar');
  const nextDay = new Date(Date.now() + 86400000);
  const day = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
  const targetDay = await execute('document.querySelector("[data-day]").dataset.day');
  await execute(`document.querySelector('[data-day="${targetDay}"]').click()`);
  assert.equal(await execute(`document.querySelector('[data-day="${targetDay}"]').getAttribute('aria-pressed')`), 'true');

  await execute(`document.querySelector('[data-edit="${a}"]').click()`);
  await until(() => execute('document.querySelector("#task-dialog").open'), 'open existing');
  await execute(`document.querySelector('#task-due').value = '${day}T23:00'; document.querySelector('#task-form').requestSubmit()`);
  await until(() => execute('!document.querySelector("#task-dialog").open'), 'save deadline');
  assert.equal(await execute(`document.querySelector('[data-task="${a}"]').closest('[data-level]').dataset.level`), '0');

  // Exercise drag-and-drop against the actual visible calendar and board.
  await execute(`(() => { const d = new DataTransfer(); document.querySelector('[data-task="${a}"]').dispatchEvent(new DragEvent('dragstart', {bubbles:true,dataTransfer:d})); document.querySelector('[data-day="${day}"]').dispatchEvent(new DragEvent('drop', {bubbles:true,cancelable:true,dataTransfer:d})); })()`);
  await until(() => Promise.resolve(store.state.tasks.find(t => t.id === a).due.includes('T')), 'calendar drop');
  await execute(`(() => { const d = new DataTransfer(); document.querySelector('[data-task="${a}"]').dispatchEvent(new DragEvent('dragstart', {bubbles:true,dataTransfer:d})); document.querySelector('[data-level="2"]').dispatchEvent(new DragEvent('drop', {bubbles:true,cancelable:true,dataTransfer:d})); })()`);
  await until(() => Promise.resolve(store.state.tasks.find(t => t.id === a).level === 2), 'quadrant drag');
  await execute(`window.fourfold.call('update', {id:'${a}',patch:{level:1}})`);

  win.webContents.debugger.attach('1.3');
  await execute(`(() => { const input = document.createElement('input'); input.type='file'; input.id='smoke-file'; input.hidden=true; document.body.append(input); })()`);
  const doc = await win.webContents.debugger.sendCommand('DOM.getDocument');
  const node = await win.webContents.debugger.sendCommand('DOM.querySelector', {nodeId:doc.root.nodeId,selector:'#smoke-file'});
  await win.webContents.debugger.sendCommand('DOM.setFileInputFiles', {nodeId:node.nodeId,files:[sample]});
  const beforeDrop = store.state.tasks.length;
  await execute(`(() => { const d = new DataTransfer(); d.items.add(document.querySelector('#smoke-file').files[0]); document.querySelector('[data-level="3"]').dispatchEvent(new DragEvent('drop', {bubbles:true,cancelable:true,dataTransfer:d})); })()`);
  await until(() => Promise.resolve(store.state.tasks.length === beforeDrop + 1), 'real file drop');
  assert.equal(store.state.tasks.at(-1).files[0].path, sample);
  // A real on-disk directory travels through the same native File bridge as a file.
  const folder=path.join(path.dirname(sample),'Project.v2');fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'keep.txt'),'original');
  await win.webContents.debugger.sendCommand('DOM.setFileInputFiles',{nodeId:node.nodeId,files:[folder]});
  await execute(`(() => { const d=new DataTransfer();d.items.add(document.querySelector('#smoke-file').files[0]);document.querySelector('[data-level="3"]').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:d})); })()`);
  await until(()=>Promise.resolve(store.state.tasks.some(t=>t.files.some(f=>f.path===folder))),'real folder drop');
  const folderTask=store.state.tasks.find(t=>t.files.some(f=>f.path===folder));assert.equal(folderTask.title,'Project.v2');assert.equal(folderTask.files[0].kind,'directory');
  const available=await execute(`window.fourfold.call('files:check',{taskId:'${folderTask.id}'})`);assert.equal(available[0].available,true);
  const shell=require('electron').shell,dialog=require('electron').dialog,originalOpen=shell.openPath,originalDialog=dialog.showOpenDialog;let opened;
  try {
    shell.openPath=async p=>{opened=p;return '';};
    await execute(`window.fourfold.call('files:open',{taskId:'${folderTask.id}',fileId:'${folderTask.files[0].id}'})`);assert.equal(opened,folder);
    const moved=folder+'-moved';fs.renameSync(folder,moved);
    assert.equal((await execute(`window.fourfold.call('files:check',{taskId:'${folderTask.id}'})`))[0].available,false);
    dialog.showOpenDialog=async(_win,options)=>{assert.ok(options.properties.includes('openDirectory'));return {canceled:false,filePaths:[moved]};};
    await execute(`window.fourfold.call('files:relink',{taskId:'${folderTask.id}',fileId:'${folderTask.files[0].id}'})`);
    assert.equal(store.state.tasks.find(t=>t.id===folderTask.id).files[0].kind,'directory');
    assert.equal((await execute(`window.fourfold.call('files:check',{taskId:'${folderTask.id}'})`))[0].available,true);
    await execute(`window.fourfold.call('status',{id:'${folderTask.id}',action:'delete'})`);assert.equal(fs.readFileSync(path.join(moved,'keep.txt'),'utf8'),'original');
  } finally {shell.openPath=originalOpen;dialog.showOpenDialog=originalDialog;}
  win.webContents.debugger.detach();

  await execute('document.querySelector("#opacity-button").click(); document.querySelector("#transparency").value = "65"; document.querySelector("#transparency").dispatchEvent(new Event("input")); document.querySelector("#transparency").dispatchEvent(new Event("change"))');
  await until(() => Promise.resolve(store.state.settings.transparency === 65), 'opacity persisted');
  assert.equal(await execute('document.documentElement.style.getPropertyValue("--alpha")'), '0.35');
  await execute(`document.querySelector('[data-complete="${a}"]').click()`);
  await until(() => Promise.resolve(store.state.tasks.find(t => t.id === a).status === 'completed'), 'complete');
  await execute('document.querySelector("#undo").click()');
  await until(() => Promise.resolve(store.state.tasks.find(t => t.id === a).status === 'active'), 'undo');

  // A renderer-generated File cannot forge a disk path, while file input attachments expose their actual path through webUtils.
  const pathResult = await execute(`window.fourfold.dropFiles([new File(['x'], 'fake.txt')], {level:1}).then(()=>'accepted').catch(e=>e.message)`);
  assert.notEqual(pathResult, 'accepted');
  fs.unlinkSync(sample);
  const missing = await execute(`window.fourfold.call('files:check', {taskId:'${a}'})`); assert.equal(missing[0].available, false);
  assert.ok(new Store(process.env.FOURFOLD_DATA_DIR).state.tasks.some(t => t.id === a));

  // Leave screenshots with realistic content after the escaping assertion has passed.
  const escapingTask = store.state.tasks.find(t => t.title.startsWith('<img'));
  await execute(`window.fourfold.call('update', {id:${JSON.stringify(escapingTask.id)},patch:{title:'整理作品集'}})`);
  await execute(`window.fourfold.call('create', {title:'确认印刷文件',level:1,due:${JSON.stringify(new Date(Date.now() + 5 * 86400000).toISOString())}})`);
  fs.writeFileSync(sample, 'Local attachment test.');

  await execute('document.body.click()');
  console.log('Core desktop checks passed; capturing the rendered windows.');
  await sleep(500);
  const screenshot = await win.webContents.capturePage(); fs.writeFileSync(path.join(directory, 'desktop.png'), screenshot.toPNG());
  await execute('window.fourfold.call("settings", {theme:"dark",windowSize:"compact"})');
  await sleep(300);
  assert.equal(await execute('document.documentElement.scrollWidth <= window.innerWidth'), true);
  const compact = await win.webContents.capturePage(); fs.writeFileSync(path.join(directory, 'compact-dark.png'), compact.toPNG());
  assert.deepEqual(failures, []);
  const report = { passed: true, checks: ['sandbox bridge', 'durable create', 'HTML escaping', 'calendar selection', 'deadline promotion', 'opacity persistence', 'complete and undo', 'file-path validation', 'missing attachment', 'restart recovery', 'compact layout'], screenshotDirectory: directory };
  fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  app.quit();
})().catch(error => { console.error(error); fs.writeFileSync(path.join(directory, 'failure.txt'), error.stack); app.exit(1); });
