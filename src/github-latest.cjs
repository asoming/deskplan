'use strict';
// Electron's net.fetch does not expose a manual redirect response. ClientRequest
// lets us read GitHub's official latest-release redirect without downloading HTML.
function latestReleaseURL(net) {
  return new Promise((resolve, reject) => {
    const request = net.request({ url: 'https://github.com/asoming/rixu/releases/latest', method: 'HEAD', redirect: 'manual', credentials: 'omit', useSessionCookies: false });
    let settled = false;
    const finish = (error, url) => {
      if (settled) return;
      settled = true; clearTimeout(timeout);
      error ? reject(error) : resolve(url);
      request.abort();
    };
    const timeout = setTimeout(() => finish(Error('GitHub request timed out')), 15000);
    request.on('redirect', (_status, _method, url) => finish(null, url));
    request.on('response', () => finish(Error('GitHub did not return a release redirect')));
    request.on('error', error => finish(error));
    request.end();
  });
}
module.exports = { latestReleaseURL };
