'use strict';
const fs = require('node:fs');
const { atomicWrite } = require('./store.cjs');
const endpoint = 'https://api.github.com/repos/asoming/rixu/releases/latest';
const interval = 6 * 60 * 60 * 1000;
function versionParts(value) {
  const match = /^v?(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/.exec(value || '');
  return match ? match.slice(1).map(Number) : null;
}
function newer(candidate, current) {
  const a = versionParts(candidate), b = versionParts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
function releaseInfo(data, current) {
  if (!data || data.draft !== false || data.prerelease !== false || !versionParts(data.tag_name)) throw Error('更新信息无效，请稍后重试');
  if (!newer(data.tag_name, current)) return null;
  return { version: data.tag_name.replace(/^v/, ''), url: `https://github.com/asoming/rixu/releases/tag/${data.tag_name}` };
}
class UpdateChecker {
  constructor({ version, fetch, latestURL, cacheFile, onChange = () => {}, now = Date.now }) {
    this.version = version; this.fetch = fetch; this.cacheFile = cacheFile; this.onChange = onChange; this.now = now;
    this.latestURL = latestURL;
    this.cache = {}; this.pending = null;
    try { this.cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch {}
    this.state = { status: 'idle', release: null, error: '', lastChecked: Number(this.cache?.lastChecked) || 0, notifiedVersion: String(this.cache?.notifiedVersion || '') };
  }
  snapshot() { return { ...this.state }; }
  due() { return this.now() - this.state.lastChecked >= interval; }
  save() {
    if (this.cacheFile) atomicWrite(this.cacheFile, JSON.stringify({ lastChecked: this.state.lastChecked, notifiedVersion: this.state.notifiedVersion }));
  }
  acknowledge(version) {
    if (version !== this.state.release?.version) return;
    this.state.notifiedVersion = version; this.save(); this.onChange();
  }
  check() {
    if (this.pending) return this.pending;
    this.state.status = 'checking'; this.state.error = ''; this.onChange();
    this.pending = this.request().finally(() => { this.pending = null; });
    return this.pending;
  }
  async request() {
    try {
      const response = await this.fetch(endpoint, { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000) });
      let data;
      if (!response.ok && [403, 429].includes(response.status) && this.latestURL) {
        const url = await this.latestURL();
        const tag = /^https:\/\/github\.com\/asoming\/rixu\/releases\/tag\/([^/?#]+)$/.exec(url)?.[1];
        data = { tag_name: tag, draft: false, prerelease: false };
      } else {
        if (!response.ok) throw Error(response.status === 403 || response.status === 429 ? '检测过于频繁，请稍后重试' : '无法连接 GitHub，请检查网络后重试');
        data = await response.json();
      }
      this.state.release = releaseInfo(data, this.version);
      this.state.status = this.state.release ? 'available' : 'current';
    } catch (error) {
      this.state.status = 'error'; this.state.error = ['更新信息无效，请稍后重试', '检测过于频繁，请稍后重试'].includes(error.message) ? error.message : '无法连接 GitHub，请检查网络后重试';
    }
    this.state.lastChecked = this.now();
    try { this.save(); } catch { /* Update checks must not interrupt task work if the cache cannot be written. */ }
    this.onChange(); return this.snapshot();
  }
}
module.exports = { UpdateChecker, releaseInfo, newer, endpoint };
