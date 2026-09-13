'use strict';
const { dateKey, plannedDay } = require('./renderer/time.js');
const localDate = key => new Date(`${key}T12:00:00`);
function advance(key, frequency, anchorDay) {
  const d = localDate(key);
  if (frequency === 'monthly') {
    d.setDate(1); d.setMonth(d.getMonth() + 1);
    d.setDate(Math.min(anchorDay, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  } else {
    d.setDate(d.getDate() + (frequency === 'weekly' ? 7 : 1));
    if (frequency === 'weekdays') while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1);
  }
  return dateKey(d);
}
function nextOccurrence(task, completedAt = Date.now()) {
  if (!task.repeat || task.repeat === 'none') return null;
  const base = plannedDay(task);
  if (!base) throw new Error('重复任务需要计划日期或截止时间');
  const today = dateKey(new Date(completedAt)), anchor = task.repeatAnchor || Number(base.slice(-2));
  let next = advance(base, task.repeat, anchor), guard = 0;
  while (next <= today) {
    if (++guard > 40000) throw new Error('重复日期跨度过大，请重新安排');
    next = advance(next, task.repeat, anchor);
  }
  let due = null;
  if (task.due) {
    // Calendar-day offset preserves the local deadline clock across DST boundaries.
    const delta = Math.round((Date.parse(`${next}T12:00:00Z`) - Date.parse(`${base}T12:00:00Z`)) / 86400000);
    const shifted = new Date(task.due); shifted.setDate(shifted.getDate() + delta); due = shifted.toISOString();
  }
  return { plannedDate: task.plannedDate ? next : null, due, repeatAnchor: anchor };
}
module.exports = { advance, nextOccurrence };
