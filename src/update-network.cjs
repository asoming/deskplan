'use strict';
const allowedHosts = new Set(['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com']);
function trustedAssetURL(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port && allowedHosts.has(u.hostname) && (u.hostname !== 'github.com' || u.pathname.startsWith('/asoming/rixu/releases/download/')); } catch { return false; }
}
function requestAsset(net, url, signal) {
  if (!trustedAssetURL(url)) return Promise.reject(Error('更新下载地址无效'));
  return new Promise((resolve, reject) => {
    const request = net.request({ url, redirect: 'manual', credentials: 'omit', useSessionCookies: false });
    let response, redirects = 0, timer, failed = false;
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const fail = error => { if (failed) return; failed = true; cleanup(); response?.destroy(error); request.abort(); reject(error); };
    const abort = () => fail(Error('下载已取消'));
    const reset = () => { clearTimeout(timer); timer = setTimeout(() => fail(Error('下载超时，请重试')), 30000); };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    request.on('redirect', (_status, _method, next) => {
      if (++redirects > 5 || !trustedAssetURL(next)) { fail(Error('更新下载地址无效')); return; }
      reset(); request.followRedirect();
    });
    request.on('response', incoming => {
      response = incoming; incoming.on('error', cleanup);
      if (incoming.statusCode !== 200) { fail(Error('无法下载更新，请检查网络后重试')); return; }
      incoming.on('data', reset); incoming.pause(); incoming.once('end', cleanup); incoming.once('close', cleanup); incoming.once('error', cleanup);
      resolve({ body: incoming, size: Number(Array.isArray(incoming.headers['content-length']) ? incoming.headers['content-length'][0] : incoming.headers['content-length']) || 0 });
    });
    request.once('error', fail); reset(); request.end();
  });
}
module.exports = { requestAsset, trustedAssetURL };
