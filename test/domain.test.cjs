'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTask, patchTask, effectiveLevel, urgency, validateState, emptyState, pendingReminders, HOUR } = require('../src/domain.cjs');
const base = Date.parse('2026-09-13T01:00:00Z');
const task = (hours, level = 1) => createTask({ title: '准备汇报', level, due: new Date(base + hours * HOUR).toISOString() }, base - HOUR);

test('48-hour transition uses exact instants and a shared rendering rule', () => {
  const t = task(72);
  assert.equal(effectiveLevel(t, base), 1);
  assert.equal(effectiveLevel(t, base + 24 * HOUR - 1), 1);
  assert.equal(effectiveLevel(t, base + 24 * HOUR), 0);
  assert.equal(urgency(t, base + 24 * HOUR), 'hot');
  assert.equal(urgency(t, base + 48 * HOUR), 'red');
  assert.equal(urgency(t, base + 72 * HOUR + 1), 'late');
  assert.equal(effectiveLevel(t, base + 72 * HOUR + 1), 0);
});
test('reschedule and clear restore user intent, explicit now never downgrades', () => {
  const t = task(12);
  assert.equal(effectiveLevel(t, base), 0);
  assert.equal(t.level, 1);
  assert.equal(effectiveLevel(patchTask(t, { due: new Date(base + 100 * HOUR).toISOString() }, base), base), 1);
  assert.equal(effectiveLevel(patchTask(t, { due: null }, base), base), 1);
  assert.equal(effectiveLevel(patchTask(t, { level: 0, due: new Date(base + 100 * HOUR).toISOString() }, base), base), 0);
});
test('other quadrants and completed tasks do not auto-move', () => {
  for (const level of [0, 2, 3]) { const t = task(1, level); assert.equal(effectiveLevel(t, base), level); assert.equal(urgency(t, base), 'red'); }
  const t = task(1); t.status = 'completed'; assert.equal(effectiveLevel(t, base), 1);
  assert.equal(effectiveLevel(createTask({ title: '没有日期', level: 1 }, base), base), 1);
});
test('warm threshold and date display do not affect exact rules', () => {
  assert.equal(urgency(task(168), base), 'warm');
  assert.equal(urgency(task(168.01), base), 'calm');
  const { remainingLabel } = require('../src/renderer/time.js');
  assert.equal(remainingLabel(task(48.001), base), '剩 3 天');
  assert.equal(remainingLabel(task(48), base), '剩 48 小时');
  assert.equal(remainingLabel(task(0.5), base), '剩 30 分钟');
});
test('task input and backup validation reject malformed data', () => {
  assert.throws(() => createTask({ title: '  ', level: 1 }));
  assert.throws(() => createTask({ title: '任务', level: 9 }));
  assert.throws(() => createTask({ title: '任务', due: 'not-a-date' }));
  const s = emptyState(), t = task(10); s.tasks.push(t, t); assert.throws(() => validateState(s), /重复/);
  assert.throws(() => validateState({ ...emptyState(), schemaVersion: 99 }));
});
test('equivalent timezone offsets produce identical urgency', () => {
  const t = task(72), other = { ...t, due: '2026-09-16T09:00:00+08:00' };
  assert.equal(effectiveLevel(t, base + 24 * HOUR), effectiveLevel(other, base + 24 * HOUR));
});
test('reminder threshold, ledger, completion, rescheduling and missed intervals', () => {
  const s = emptyState(); s.settings.notifications = true; s.settings.remindBefore = true; const t = task(25); s.tasks.push(t);
  let reminders = pendingReminders(s, base, base + HOUR); assert.equal(reminders.length, 1); assert.equal(reminders[0].kind, 'before');
  s.reminderLedger[reminders[0].key] = base + HOUR;
  assert.equal(pendingReminders(s, base, base + 2 * HOUR).length, 0);
  assert.equal(pendingReminders(s, base + HOUR, base + 26 * HOUR).length, 1);
  s.tasks[0] = patchTask(t, { due: new Date(base + 100 * HOUR).toISOString() }, base + 2 * HOUR);
  assert.equal(pendingReminders(s, base + 2 * HOUR, base + 26 * HOUR).length, 0);
  s.tasks[0].status = 'completed'; assert.equal(pendingReminders(s, base, base + 200 * HOUR).length, 0);
});
test('creating a task inside a reminder window does not replay old reminders', () => {
  const s = emptyState(); s.settings.notifications = true;
  s.tasks.push(createTask({ title: '今天做', due: new Date(base + HOUR).toISOString() }, base));
  assert.equal(pendingReminders(s, base - 48 * HOUR, base).length, 0);
  assert.equal(pendingReminders(s, base, base + HOUR).length, 1);
  s.settings.notifications = false; assert.equal(pendingReminders(s, base, base + 2 * HOUR).length, 0);
});
