'use strict';
const assert = require('node:assert/strict');
module.exports = async function readabilityChecks(runtime, js, call) {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const move = async (x, y) => { runtime.window.webContents.sendInputEvent({ type: 'mouseMove', x, y }); await sleep(180); };
  const railOpacity = () => js('getComputedStyle(document.querySelector(".tool-rail")).opacity');
  await call('settings', { quietControls: true, transparency: 100, textTransparency: 0 });
  for (const desktopBlend of [true, false]) {
    await call('settings', { desktopBlend });
    await move(250, 200);
    assert.equal(await railOpacity(), '0', 'workspace hover does not show sidebar');
    await move(20, 20);
    assert.equal(await railOpacity(), '1', 'sidebar hover shows icons');
    await move(250, 200);
    assert.equal(await railOpacity(), '0', 'leaving sidebar hides icons');
  }
  // Follow the complete opacity ancestry, so a faded parent cannot mask a passing child check.
  const effective = selector => js(`(()=>{let opacity=1;for(let el=document.querySelector(${JSON.stringify(selector)});el;el=el.parentElement)opacity*=Number(getComputedStyle(el).opacity);return opacity})()`);
  for (const textTransparency of [0, 50, 100]) {
    await call('settings', { textTransparency });
    for (const selector of ['.task-title', '.zone-heading h2', '#save-status']) {
      assert.equal(await effective(selector), (100-textTransparency)/100, `${selector} follows text transparency exactly`);
    }
    assert.match(await js('getComputedStyle(document.querySelector("#app")).backgroundColor'), /(?:, |\/ )0\)$/, 'text slider keeps background transparent');
  }
  await call('settings', {textTransparency:0});
  if (process.env.RIXU_ARTIFACTS_DIR) {
    await js('document.body.style.background="linear-gradient(135deg,#591c3f,#9b465a)"');
    await sleep(180);
    assert.notEqual(await js('getComputedStyle(document.querySelector(".task-title")).textShadow'), "none", "task title buttons retain wallpaper contrast edge");
    const fs=require('node:fs'),path=require('node:path');
    fs.writeFileSync(path.join(process.env.RIXU_ARTIFACTS_DIR,'readable-text.png'),(await runtime.window.webContents.capturePage()).toPNG());
    await js('document.body.style.background=""');
  }
  await call('window:compact', { enabled: true });
  await move(200, 100); assert.equal(await railOpacity(), '0');
  await move(20, 20); assert.equal(await railOpacity(), '1');
  assert.deepEqual(await js('[...document.querySelectorAll(".tool-rail button")].filter(e=>e.getClientRects().length).map(e=>e.id)'), ['new-task','compact-toggle']);
  await call('window:compact', { enabled: false });
  await call('settings', { textTransparency: 0, transparency: 65, desktopBlend: true });
  await move(250, 200);
  await js('document.body.classList.add("keyboard-navigation");document.querySelector("#new-task").focus()');
  await sleep(180); assert.equal(await railOpacity(), '1', 'keyboard focus keeps controls accessible');
  await js('document.body.classList.remove("keyboard-navigation");document.activeElement.blur()');
  console.log('Text transparency endpoints, independent background and main/mini sidebar hover passed');
};
