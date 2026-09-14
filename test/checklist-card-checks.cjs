'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Store } = require('../src/store.cjs');
const { dateKey } = require('../src/renderer/time.js');
module.exports = async function checklistCardChecks(runtime, js, call) {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function until(fn, label) {
    for (let i = 0; i < 100; i++) { if (await fn()) return; await sleep(40); }
    throw new Error('Checklist timeout: ' + label);
  }
  const original = runtime.store.snapshot().settings;
  const steps = ['设备扫描时，平台升级断开连接，MCU 照常发单点给 T31。', '当单轮结束后暂停扫描，直到重新连接平台并发送时钟同步后重新扫描。', '<img src=x onerror=alert(1)>', '核对设备状态', '整理结果'];
  const id = await call('create', { title: '设备扫描检查', level: 0, plannedDate: dateKey(new Date()), checklist: steps.map((text, i) => ({ id: `step-${i}`, text })) });
  const task = () => runtime.store.state.tasks.find(t => t.id === id);
  const card = `#board [data-task="${id}"]`;
  const step = i => `${card} [data-card-step="step-${i}"]`;
  await call('settings', { view: 'quadrants', transparency: 100, textTransparency: 0, language: 'zh-CN' });
  assert.deepEqual(await js(`[...document.querySelectorAll('${card} .card-step')].filter(e=>!e.hidden).map(e=>e.textContent)`), steps.slice(0, 3));
  assert.equal(await js(`document.querySelector('${card} .card-checklist img')`), null, 'step text is escaped');
  await js(`document.querySelector('${card} [data-checklist-expand]').click()`);
  assert.equal(await js(`[...document.querySelectorAll('${card} .card-step')].filter(e=>!e.hidden).length`), 5);
  // Use real native pointer input on a checkbox, not just synthetic DOM events.
  const point = await js(`(()=>{const r=document.querySelector('${step(0)}').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
  runtime.window.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
  runtime.window.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
  await until(() => task().checklist[0].done, 'native checkbox saves');
  await until(() => js(`document.querySelector('${step(0)}').checked`), 'checkbox rerender');
  assert.equal(task().status, 'active');
  assert.equal(await js(`document.querySelector('${card} [data-checklist-expand]').getAttribute('aria-expanded')`), 'true');
  await js(`document.querySelector('${step(1)}').click();document.querySelector('${step(2)}').click()`);
  await until(() => task().checklist[1].done && task().checklist[2].done, 'rapid steps merge');
  assert.match(await js(`document.querySelector('${card} .task-meta').textContent`), /3\/5/);
  assert.deepEqual(new Store(runtime.store.directory).state.tasks.find(t => t.id === id).checklist.map(i => i.done), [true,true,true,false,false]);
  await call('undo');
  await until(() => js(`!document.querySelector('${step(2)}').checked`), 'undo');
  await js(`document.querySelector('${step(1)}').focus()`);
  runtime.window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' });
  runtime.window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' });
  await until(() => !task().checklist[1].done, 'keyboard uncheck');
  await until(() => js(`document.activeElement?.dataset.cardStep==='step-1'`), 'keyboard focus retained');
  await js(`document.querySelector('${card} [data-edit]').click()`);
  await until(() => js('document.querySelector("#task-dialog").open'), 'editor opens');
  assert.deepEqual(await js('[...document.querySelectorAll("#checklist-items input")].map(e=>e.checked)'), [true,false,false,false,false]);
  await js('document.querySelector("#editor-close").click()');
  await until(() => js('!document.querySelector("#task-dialog").open'), 'editor closes');
  // The visible list must also work in each planning surface and mini mode.
  for (const view of ['today', 'week', 'inbox']) {
    await call('update', { id, patch: { inbox: view === 'inbox' } });
    await call('settings', { view });
    assert.ok(await js(`[...document.querySelectorAll('#planner [data-check-task="${id}"]')].some(e=>e.getClientRects().length)`), view);
  }
  await call('update', { id, patch: { inbox: false } });
  await call('current', { id });
  await call('window:compact', { enabled: true });
  assert.ok(await js(`[...document.querySelectorAll('#compact-panel [data-check-task="${id}"]')].some(e=>e.getClientRects().length)`));
  await call('window:compact', { enabled: false });
  await call('settings', { view: 'quadrants', language: 'en' });
  await js(`document.querySelector('${card} [data-checklist-expand]').click()`);
  assert.equal(await js(`document.querySelector('${card} [data-checklist-expand]').textContent`), 'Show 2 more steps');
  assert.deepEqual(await js('window.RixuI18n.missing()'), []);
  await call('settings', { language: 'zh-CN' });
  for (const textTransparency of [0, 50, 100]) {
    await call('settings', { textTransparency });
    assert.equal(await js(`(()=>{let opacity=1;for(let el=document.querySelector('${step(0)}').nextElementSibling;el;el=el.parentElement)opacity*=Number(getComputedStyle(el).opacity);return opacity})()`), (100-textTransparency)/100);
  }
  await call('settings', { textTransparency: 0 });
  assert.ok(await js(`[...document.querySelectorAll('${card} .card-step span')].every(e=>e.scrollWidth<=e.clientWidth+1)`), 'long steps wrap');
  if (process.env.RIXU_ARTIFACTS_DIR) {
    const size = runtime.window.getSize();
    runtime.window.setSize(1100, 850);
    await js('document.body.style.background="linear-gradient(135deg,#591c3f,#9b465a)"');
    await sleep(200);
    fs.writeFileSync(path.join(process.env.RIXU_ARTIFACTS_DIR, 'checklist-cards.png'), (await runtime.window.webContents.capturePage()).toPNG());
    await js('document.body.style.background=""');
    runtime.window.setSize(...size);
  }
  await call('status', { id, action: 'delete' });
  await call('settings', original);
  console.log('Checklist previews, expansion, native/keyboard toggles, concurrent saves, persistence, undo, editor sync, all views, translation and transparency passed');
};
