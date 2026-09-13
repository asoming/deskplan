'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const i18n = require('../src/i18n.js');
const { validateSettings, validateState, emptyState } = require('../src/domain.cjs');
const { Store } = require('../src/store.cjs');
const { remainingLabel } = require('../src/renderer/time.js');
test('language migrates safely, rejects unknown values and persists without changing tasks', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rixu-language-'));
  t.after(() => fs.rmSync(dir, { recursive:true, force:true }));
  const old = emptyState(); delete old.settings.language;
  assert.equal(validateState(old).settings.language, 'zh-CN');
  assert.throws(() => validateSettings({language:'xx'}), /语言/);
  const s = new Store(dir), id = s.create({title:'今天',notes:'Do now / 马上做'}), before = s.snapshot().tasks;
  s.saveSettings({language:'en'});
  const reopened = new Store(dir); assert.equal(reopened.state.settings.language,'en');
  assert.deepEqual(reopened.state.tasks,before); assert.equal(reopened.state.tasks[0].id,id);
});
test('template translation preserves user text, placeholders, markup and spacing', t => {
  i18n.setLanguage('en'); t.after(() => i18n.setLanguage('zh-CN'));
  assert.equal(i18n.tr`已移到「${'今天 {0}'}」`,'Moved to 今天 {0}');
  assert.equal(i18n.tr(' · 偏满'),' · Over capacity');
  const title='今天 &lt;img src=x&gt; {0}';
  assert.equal(i18n.html`<button data-id="${'a'}" aria-label="完成：${title}">${title}</button>`, `<button data-id="a" aria-label="Complete: ${title}">${title}</button>`);
  assert.equal(i18n.html`<span>${30} 分钟${' · Over capacity'}</span>`,'<span>30 min · Over capacity</span>');
  assert.equal(i18n.html('<div>收集箱是空的</div>'),'<div>Your Inbox is clear</div>');
  i18n.setLanguage('zh-CN'); assert.equal(i18n.tr('今天'),'今天');
});
test('remaining time is localized without changing urgency boundaries', () => {
  const now=Date.parse('2026-09-13T12:00:00Z'),task={due:new Date(now+48*3600000).toISOString()};
  assert.equal(remainingLabel(task,now,'en'),'Due in 48 h');
  assert.equal(remainingLabel(task,now,'zh-CN'),'剩 48 小时');
  assert.equal(remainingLabel({due:new Date(now-60000).toISOString()},now,'en'),'Overdue');
});
