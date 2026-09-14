'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { randomUUID } = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const { atomicWrite } = require('./store.cjs');
function installTarget({ platform = process.platform, execPath = process.execPath, packaged = false } = {}) {
  if (!packaged) return { kind: 'unsupported', reason: '开发模式不安装更新' };
  if (platform === 'win32') return { kind: 'nsis', root: path.dirname(execPath), executable: execPath };
  if (platform === 'darwin') {
    const root = path.resolve(execPath, '../../..');
    if (!root.endsWith('.app') || root.startsWith('/Volumes/')) return { kind: 'unsupported', reason: '请先将日序移到应用程序文件夹再更新' };
    return { kind: 'mac', root, executable: execPath };
  }
  if (platform === 'linux') {
    const root = path.dirname(execPath);
    try { fs.accessSync(root, fs.constants.W_OK); fs.accessSync(path.dirname(root), fs.constants.W_OK); return { kind: 'local', root, executable: execPath }; }
    catch { return { kind: 'deb', root, executable: execPath }; }
  }
  return { kind: 'unsupported', reason: '暂不支持此系统的应用内更新' };
}
async function extractLinux(file, stage, version) {
  const prefix = `Rixu-${version}-linux-x64`;
  if (process.versions.electron && process.argv[2] !== '--extract-rixu') {
    await run(process.execPath, [__filename, '--extract-rixu', file, stage, version], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 180000 });
    return path.join(stage, prefix);
  }
  const tar = require('tar'), previous = process.noAsar;
  if (process.versions.electron) process.noAsar = true;
  let size = 0, invalid = false;
  try { await tar.x({ file, cwd: stage, strict: true, preservePaths: false, filter(name, entry) {
    const normalized = name.replace(/\/$/, '');
    if (!['File', 'Directory'].includes(entry.type) || name.includes('\\') || name.split('/').includes('..') || (normalized !== prefix && !normalized.startsWith(prefix + '/'))) { invalid = true; return false; }
    size += entry.size || 0; if (size > 3 * 1024 ** 3) { invalid = true; return false; }
    return true;
  } }); } finally { process.noAsar = previous; }
  if (invalid) throw Error('更新包内容无效');
  return path.join(stage, prefix);
}
function checkIdentity(root, version, kind) {
  const resources = kind === 'mac' ? path.join(root, 'Contents', 'Resources') : path.join(root, 'resources');
  const meta = JSON.parse(fs.readFileSync(path.join(resources, 'app.asar', 'package.json'), 'utf8'));
  if (meta.name !== 'rixu-desktop' || meta.version !== version) throw Error('更新包版本或应用标识不符');
}
async function prepareInstall({ candidate, target, directory, check = checkIdentity, command = run }) {
  if (!candidate || target.kind === 'unsupported') throw Error(target.reason || '请先下载更新');
  if (candidate.kind !== target.kind) throw Error('更新包与安装方式不符');
  if (target.kind === 'nsis') return { kind: 'nsis', file: candidate.file, root: target.root, executable: target.executable };
  if (target.kind === 'deb') {
    const { stdout } = await command('dpkg-deb', ['-f', candidate.file, 'Package', 'Version']);
    if (!/^Package: rixu$/m.test(stdout) || !stdout.split(/\r?\n/).includes('Version: ' + candidate.version)) throw Error('更新包版本或应用标识不符');
    return { kind: 'deb', file: candidate.file, executable: target.executable };
  }
  const stage = path.join(path.dirname(target.root), '.rixu-update-' + randomUUID());
  fs.mkdirSync(stage, { mode: 0o700 });
  try {
    let prepared;
    if (target.kind === 'local') {
      prepared = await extractLinux(candidate.file, stage, candidate.version);
      check(prepared, candidate.version, target.kind);
      fs.accessSync(path.join(prepared, 'rixu'), fs.constants.X_OK);
      // The user-local launcher references this icon outside of the application archive.
      if (fs.existsSync(path.join(target.root, 'icon.png'))) fs.copyFileSync(path.join(target.root, 'icon.png'), path.join(prepared, 'icon.png'));
    } else {
      const mount = fs.mkdtempSync(path.join(os.tmpdir(), 'rixu-update-mount-'));
      let mounted = false;
      try {
        await command('hdiutil', ['attach', candidate.file, '-nobrowse', '-readonly', '-mountpoint', mount]); mounted = true;
        const bundle = path.join(mount, '日序.app');
        await command('codesign', ['--verify', '--deep', '--strict', bundle]);
        check(bundle, candidate.version, target.kind);
        prepared = path.join(stage, '日序.app');
        (process.versions.electron ? require('original-fs') : fs).cpSync(bundle, prepared, { recursive: true, verbatimSymlinks: true });
        await command('codesign', ['--verify', '--deep', '--strict', prepared]);
      } finally {
        if (mounted) await command('hdiutil', ['detach', mount]);
        fs.rmSync(mount, { recursive: true, force: true });
      }
    }
    return { kind: target.kind, prepared, stage, root: target.root, executable: target.executable, backup: target.root + '.before-update-' + Date.now() };
  } catch (error) { fs.rmSync(stage, { recursive: true, force: true }); throw error; }
}
async function launchInstall({ plan, directory, parentPid = process.pid, helperExecutable = process.execPath, environment = process.env }) {
  const helper = path.join(directory, 'install-helper.cjs'), config = path.join(directory, 'install-plan.json');
  atomicWrite(config, JSON.stringify({ ...plan, parentPid, result: path.join(directory, 'install-result.json') }));
  let executable = helperExecutable, args = [helper, config], env = { ...environment, ELECTRON_RUN_AS_NODE: '1' };
  if (plan.kind === 'nsis') {
    executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    args = ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', Buffer.from(require('./update-windows.cjs').windowsCommand(config), 'utf16le').toString('base64')];
    env = environment;
  } else fs.copyFileSync(path.join(__dirname, 'update-helper.cjs'), helper);
  const log = fs.openSync(path.join(directory, 'install.log'), 'a', 0o600);
  const child = spawn(executable, args, { detached: true, windowsHide: true, stdio: ['ignore', 'pipe', log], env });
  fs.closeSync(log);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(Error('无法启动更新安装程序')); }, 15000);
    const fail = error => { clearTimeout(timeout); reject(error); };
    child.once('error', fail); child.once('exit', () => fail(Error('无法启动更新安装程序')));
    let output = '';
    child.stdout.on('data', data => {
      output += data.toString(); if (!output.includes('\n')) return;
      clearTimeout(timeout);
      if (output.trim() !== 'READY') { child.kill(); reject(Error('无法启动更新安装程序')); return; }
      child.stdout.destroy(); child.unref(); resolve();
    });
  });
}
module.exports = { installTarget, prepareInstall, launchInstall, extractLinux, checkIdentity };

if (require.main === module && process.argv[2] === '--extract-rixu') extractLinux(...process.argv.slice(3)).catch(error => { console.error(error.message); process.exitCode = 1; });
