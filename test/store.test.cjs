'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { Store } = require('../src/store.cjs');
function fixture(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fourfold-test-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return { dir, store: new Store(dir) }; }

test('submitted changes survive a new store instance', t => {
  const { dir, store } = fixture(t); const id = store.create({ title: '实际任务', level: 2 });
  store.update(id, { notes: '不能丢失的内容', due: '2026-09-20T18:00:00+08:00' });
  store.saveSettings({ transparency: 60, calendarOpen: true });
  const recovered = new Store(dir); assert.equal(recovered.state.tasks[0].notes, '不能丢失的内容'); assert.equal(recovered.state.settings.transparency, 60); assert.equal(recovered.state.settings.calendarOpen, true);
});
test('attachments deduplicate and lifecycle operations never change originals', t => {
  const { dir, store } = fixture(t); const original = path.join(dir, 'original.txt'); fs.writeFileSync(original, 'original bytes');
  const id = store.create({ title: '处理文件' }); const file = { path: original, name: 'original.txt' };
  store.attach(id, [file, file]); assert.equal(store.state.tasks[0].files.length, 1);
  store.status(id, 'complete'); store.status(id, 'delete'); store.status(id, 'restore'); assert.equal(store.state.tasks[0].status, 'completed');
  store.status(id, 'reopen'); store.removeAttachment(id, store.state.tasks[0].files[0].id);
  assert.equal(fs.readFileSync(original, 'utf8'), 'original bytes');
});
test('undo changes tasks but keeps newly changed preferences and reminder ledger', t => {
  const { store } = fixture(t); const id = store.create({ title: '撤销测试', level: 1 });
  store.update(id, { level: 0 }); store.saveSettings({ transparency: 70 }); store.markReminders(['example:1:due'], 123);
  store.undo(); assert.equal(store.state.tasks[0].level, 1); assert.equal(store.state.settings.transparency, 70); assert.equal(store.state.reminderLedger['example:1:due'], 123);
});
test('a failed write never reports or retains a successful in-memory mutation', t => {
  const { dir, store } = fixture(t); store.create({ title: '保留原数据' }); const before = store.snapshot();
  store.file = path.join(dir, 'directory-not-file'); fs.mkdirSync(store.file);
  assert.throws(() => store.create({ title: '保存失败' })); assert.deepEqual(store.snapshot(), before);
});
test('corrupt primary recovers previous valid data and preserves corrupt input', t => {
  const { dir, store } = fixture(t); const id = store.create({ title: '原始内容' }); store.update(id, { title: '最新内容' });
  fs.writeFileSync(store.file, '{broken'); const recovered = new Store(dir);
  assert.equal(recovered.state.tasks[0].title, '原始内容'); assert.match(recovered.recoveryNotice, /恢复/); assert.ok(fs.readdirSync(dir).some(n => n.startsWith('tasks.corrupt-')));
});
test('backup restore validates first, preserves originals, and backs up current state', t => {
  const { dir, store } = fixture(t); const id = store.create({ title: '备份前', level: 3 }); const backup = path.join(dir, 'export.json'); store.export(backup);
  store.update(id, { title: '备份后' }); store.restore(backup); assert.equal(store.state.tasks[0].title, '备份前');
  assert.ok(fs.readdirSync(store.backupDirectory).some(n => n.startsWith('before-restore-')));
  const before = store.snapshot(); fs.writeFileSync(backup, '{invalid'); assert.throws(() => store.restore(backup)); assert.deepEqual(store.snapshot(), before);
});
test('permanent deletion is limited to trash and does not become undoable', t => {
  const { store } = fixture(t); const id = store.create({ title: '删除测试' }); assert.throws(() => store.purge(id)); store.status(id, 'delete'); store.purge(id);
  assert.equal(store.state.tasks.length, 0); assert.equal(store.history.length, 0);
});
test('batch file creation is one undo operation and accepts missing links in backups', t => {
  const { dir, store } = fixture(t); const paths = ['a.pdf', 'b.txt'].map(name => ({ path: path.join(dir, name), name }));
  store.createFromFiles(1, paths); assert.equal(store.state.tasks.length, 2); assert.equal(store.state.tasks[0].title, 'a');
  const recovered = new Store(dir); assert.equal(recovered.state.tasks[0].files[0].path, paths[0].path); store.undo(); assert.equal(store.state.tasks.length, 0);
});
