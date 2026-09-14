'use strict';
const fs = require('node:fs'), path = require('node:path'), { createHash } = require('node:crypto');
const { atomicWrite } = require('./store.cjs');
const { newer } = require('./updates.cjs');
const limit = 1024 * 1024 * 1024;
const activeStates = new Set(['downloading', 'verifying', 'preparing', 'installing']);
const base = 'https://github.com/asoming/rixu/releases/download/';
function assetName(version, kind, arch = process.arch) {
  if (!newer(version, '0.0.0')) throw Error('更新版本无效');
  const suffix = { local: 'linux-x64.tar.gz', deb: 'linux-x64.deb', nsis: 'windows-x64-setup.exe', mac: `mac-${arch}.dmg` }[kind];
  if (!suffix || !['x64', 'arm64'].includes(arch) || (kind !== 'mac' && arch !== 'x64')) throw Error('暂不支持此系统的应用内更新');
  return `Rixu-${version}-${suffix}`;
}
async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
function checksumFor(text, name) {
  const lines = text.split(/\r?\n/).filter(Boolean), entries = lines.map(line => /^([a-f\d]{64})  (\S+)$/.exec(line));
  if (entries.some(entry => !entry)) throw Error('更新校验信息无效');
  const matches = entries.filter(entry => entry[2] === name);
  if (matches.length !== 1) throw Error('更新校验信息无效');
  return matches[0][1];
}
class UpdateDownload {
  constructor({ directory, version, kind, arch, request, onChange = () => {} }) {
    Object.assign(this, { directory, version, kind, arch, request, onChange });
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.manifest = path.join(directory, 'pending.json'); this.pending = null; this.controller = null;
    this.state = { status: 'idle', version: '', transferred: 0, total: 0, error: '', kind };
  }
  snapshot() { return { ...this.state }; }
  change(patch) { Object.assign(this.state, patch); this.onChange(); }
  busy() { return activeStates.has(this.state.status); }
  async restore() {
    let saved;
    try {
      saved = JSON.parse(fs.readFileSync(this.manifest, 'utf8'));
      if (!newer(saved.version, this.version) || saved.kind !== this.kind || saved.name !== assetName(saved.version, this.kind, this.arch) || !/^[a-f\d]{64}$/.test(saved.sha256)) return;
      const file = path.join(this.directory, saved.name);
      this.change({ status: 'verifying', version: saved.version });
      if ((await digest(file)) !== saved.sha256) throw Error('更新包校验失败，请重新下载');
      this.ready = { ...saved, file };
      this.change({ status: 'ready', transferred: fs.statSync(file).size, total: fs.statSync(file).size });
    } catch (error) {
      if (saved) { fs.rmSync(this.manifest, { force: true }); this.change({ status: 'error', error: '更新包校验失败，请重新下载' }); }
    }
  }
  download(release) {
    if (this.pending) return this.pending;
    if (this.busy()) return Promise.reject(Error('更新正在处理中'));
    if (!release || !newer(release.version, this.version)) return Promise.reject(Error('请先检测可用更新'));
    if (this.ready?.version === release.version && this.state.status === 'ready') return Promise.resolve(this.snapshot());
    this.pending = this.transfer(release.version).finally(() => { this.pending = null; this.controller = null; });
    return this.pending;
  }
  async transfer(version) {
    const name = assetName(version, this.kind, this.arch), file = path.join(this.directory, name), partial = file + '.part';
    this.controller = new AbortController(); const signal = this.controller.signal;
    this.ready = null; fs.rmSync(this.manifest, { force: true });
    this.change({ status: 'downloading', version, transferred: 0, total: 0, error: '' });
    let fd;
    try {
      const checks = await this.request(`${base}v${version}/SHA256SUMS.txt`, signal);
      let manifest = ''; for await (const chunk of checks.body) { manifest += chunk.toString(); if (Buffer.byteLength(manifest) > 1024 * 1024) throw Error('更新校验信息无效'); }
      const sha256 = checksumFor(manifest, name);
      if (signal.aborted) throw Error('下载已取消');
      const response = await this.request(`${base}v${version}/${name}`, signal);
      if (response.size > limit) throw Error('更新包大小异常');
      this.change({ total: response.size });
      fs.rmSync(partial, { force: true }); fd = fs.openSync(partial, 'wx', 0o600);
      const hash = createHash('sha256'); let transferred = 0, last = 0;
      for await (const chunk of response.body) {
        if (signal.aborted) throw Error('下载已取消');
        transferred += chunk.length; if (transferred > limit) throw Error('更新包大小异常');
        fs.writeFileSync(fd, chunk); hash.update(chunk);
        if (Date.now() - last > 100) { last = Date.now(); this.change({ transferred }); }
      }
      if (signal.aborted) throw Error('下载已取消');
      fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
      this.change({ status: 'verifying', transferred, total: response.size || transferred });
      if (!transferred || (response.size && response.size !== transferred) || hash.digest('hex') !== sha256) throw Error('更新包校验失败，请重新下载');
      fs.renameSync(partial, file);
      const saved = { version, name, kind: this.kind, sha256 };
      atomicWrite(this.manifest, JSON.stringify(saved)); this.ready = { ...saved, file };
      this.change({ status: 'ready', total: transferred });
    } catch (error) {
      if (fd !== undefined) fs.closeSync(fd);
      fs.rmSync(partial, { force: true }); this.controller.abort();
      this.change({ status: 'error', error: signal.aborted && error.message === '下载已取消' ? '下载已取消' : error.code ? '无法下载更新，请检查网络后重试' : error.message });
    }
    return this.snapshot();
  }
  cancel() { if (this.state.status === 'downloading') this.controller?.abort(); }
  async verifiedFile() {
    if (!['ready', 'preparing'].includes(this.state.status) || !this.ready) throw Error('请先下载更新');
    let valid = false;
    try { valid = (await digest(this.ready.file)) === this.ready.sha256; } catch {}
    if (!valid) {
      this.ready = null; fs.rmSync(this.manifest, { force: true });
      this.change({ status: 'error', error: '更新包校验失败，请重新下载' }); throw Error(this.state.error);
    }
    return { ...this.ready };
  }
}
module.exports = { UpdateDownload, assetName, checksumFor, digest, activeStates };
