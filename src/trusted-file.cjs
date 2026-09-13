'use strict';
const fs = require('node:fs');
const { fileURLToPath } = require('node:url');

// Chromium can expand Windows short paths and normalize drive-letter casing.
// Resolve both names with Electron's asar-aware fs before comparing identities.
function isTrustedFileURL(value, expectedFile) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'file:' || url.search || url.hash) return false;
    const canonical = file => {
      const resolved = fs.realpathSync(file);
      return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    };
    return canonical(fileURLToPath(url)) === canonical(expectedFile);
  } catch {
    return false;
  }
}

module.exports = { isTrustedFileURL };
