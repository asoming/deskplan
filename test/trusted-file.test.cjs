'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { isTrustedFileURL } = require('../src/trusted-file.cjs');

test('trusted renderer URL accepts encoded local paths and rejects other resources', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rixu-url-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const expected = path.join(dir, '日序 renderer.html');
  const other = path.join(dir, 'other.html');
  fs.writeFileSync(expected, ''); fs.writeFileSync(other, '');
  const url = pathToFileURL(expected).href;
  assert.equal(isTrustedFileURL(url, expected), true);
  for (const invalid of [pathToFileURL(other).href, url + '?query=1', url + '#fragment', 'https://example.com/renderer.html', 'data:text/html,', 'invalid']) {
    assert.equal(isTrustedFileURL(invalid, expected), false, invalid);
  }
  if (process.platform === 'win32') assert.equal(isTrustedFileURL(url.toUpperCase(), expected), true);
});

test('canonical file identity accepts an alias while still rejecting unrelated files', { skip: process.platform === 'win32' }, t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rixu-alias-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const expected = path.join(dir, 'renderer.html');
  const alias = path.join(dir, 'alias.html');
  fs.writeFileSync(expected, ''); fs.symlinkSync(expected, alias);
  assert.equal(isTrustedFileURL(pathToFileURL(alias).href, expected), true);
  assert.equal(isTrustedFileURL(pathToFileURL(path.join(dir, 'missing')).href, expected), false);
});
