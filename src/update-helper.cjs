'use strict';
// Standalone helper, copied outside the app before replacement. No downloaded code is evaluated here.
const fs = require('node:fs'), { spawn, execFile } = require('node:child_process');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
async function waitForExit(pid) {
  for (let i = 0; i < 300; i++) { if (!alive(pid)) return; await sleep(100); }
  throw Error('日序未能退出，更新尚未安装');
}
function launch(executable, args = []) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(executable, ['--updated', ...args], { detached: true, stdio: 'ignore', env });
  return new Promise((resolve, reject) => {
    let timer; const fail = error => { clearTimeout(timer); reject(error); };
    child.once('error', fail); child.once('exit', () => fail(Error('新版未能启动')));
    child.once('spawn', () => { timer = setTimeout(() => { child.removeAllListeners('exit'); child.removeListener('error', fail); child.unref(); resolve(); }, 3000); });
  });
}
async function apply(plan, options = {}) {
  const start = options.launch || launch;
  await (options.wait || waitForExit)(plan.parentPid);
  if (plan.kind === 'deb') {
    try {
      await new Promise((resolve, reject) => (options.execFile || execFile)('pkexec', ['dpkg', '-i', plan.file], error => error ? reject(Error('安装被取消或失败，请重试')) : resolve()));
      fs.writeFileSync(plan.result, JSON.stringify({ ok: true }));
    } catch (error) {
      fs.writeFileSync(plan.result, JSON.stringify({ ok: false, error: error.message }));
    }
    await start(plan.executable, plan.restartArgs); return;
  }
  let moved = false, replaced = false;
  try {
    fs.renameSync(plan.root, plan.backup); moved = true;
    fs.renameSync(plan.prepared, plan.root); replaced = true;
    fs.writeFileSync(plan.result, JSON.stringify({ ok: true, backup: plan.backup }));
    await start(plan.executable, plan.restartArgs);
    fs.rmSync(plan.stage, { recursive: true, force: true });
  } catch (error) {
    if (replaced) fs.renameSync(plan.root, plan.prepared);
    if (moved) fs.renameSync(plan.backup, plan.root);
    fs.writeFileSync(plan.result, JSON.stringify({ ok: false, error: '安装失败，已保留原版本，请重试' }));
    if (moved) await start(plan.executable, plan.restartArgs);
    throw error;
  }
}
if (require.main === module) {
  const plan = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  process.stdout.write('READY\n');
  apply(plan).catch(error => {
    console.error(error);
    try { if (!fs.existsSync(plan.result)) fs.writeFileSync(plan.result, JSON.stringify({ ok: false, error: '安装失败，请重试' })); } catch {}
    process.exitCode = 1;
  });
}
module.exports = { apply, waitForExit };
