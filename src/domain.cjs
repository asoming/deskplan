'use strict';

const { randomUUID } = require('node:crypto');
const LABELS = ['马上做', '尽快做', '按计划做', '先放着'];
const { HOUR, remainingHours, effectiveLevel, urgency } = require('./renderer/time.js');
const DEFAULT_SETTINGS = {
  transparency: 35, theme: 'system', alwaysOnTop: false, calendarOpen: false,
  notifications: false, remindBefore: false, remindAt: true, closeToTray: true,
  closeExplained: false, autoStart: false, windowSize: 'normal',
  textTransparency: 0, view: 'quadrants', compactMode: false, quickCapture: true,
  quickShortcut: 'CommandOrControl+Shift+Space', dailyCapacity: 360,
  desktopBlend: false, quietControls: true, language: 'zh-CN',
};

function invariant(condition, message) { if (!condition) throw new Error(message); }
function cleanText(value, limit) { return String(value ?? '').slice(0, limit); }
function parseDue(value) {
  if (!value) return null;
  invariant(typeof value === 'string' && Number.isFinite(Date.parse(value)), '请选择有效的截止时间');
  return new Date(value).toISOString();
}
function validateLevel(level) { invariant(Number.isInteger(level) && level >= 0 && level <= 3, '分区无效'); return level; }
function planDate(value) {
  if (!value) return null;
  invariant(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, '计划日期无效');
  return value;
}
function minutes(value = 0) { invariant(Number.isInteger(value) && value >= 0 && value <= 1440, '预计耗时应为 0–1440 分钟'); return value; }
function repeatRule(value = 'none') { invariant(['none', 'daily', 'weekdays', 'weekly', 'monthly'].includes(value), '重复规则无效'); return value; }
function checklist(value = []) {
  invariant(Array.isArray(value) && value.length <= 30, '子清单最多 30 项');
  const ids = new Set();
  return value.map(item => {
    const text = cleanText(item?.text, 300).trim(), id = item?.id || randomUUID();
    invariant(text && typeof id === 'string' && id.length < 100 && !ids.has(id), '子清单内容或标识无效'); ids.add(id);
    return { id, text, done: !!item.done };
  });
}
function createTask(input, now = Date.now()) {
  const title = cleanText(input.title, 160).trim();
  invariant(title, '请填写任务名称');
  const time = new Date(now).toISOString();
  return {
    id: randomUUID(), title, inbox: !!input.inbox && !input.plannedDate, plannedDate: planDate(input.plannedDate),
    estimatedMinutes: minutes(input.estimatedMinutes), order: now, focusDay: null, current: false, cancelledAt: null,
    reviewedDueVersion: 0, snoozeUntil: null, repeat: repeatRule(input.repeat),
    repeatAnchor: input.repeatAnchor || Number((input.plannedDate || (input.due ? require('./renderer/time.js').dateKey(new Date(input.due)) : time.slice(0, 10))).slice(-2)),
    previousOccurrenceId: null, checklist: checklist(input.checklist), notes: cleanText(input.notes, 5000), level: validateLevel(input.level ?? 1),
    due: parseDue(input.due), dueVersion: 1, dueChangedAt: time,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    reminder: input.reminder !== false, status: 'active', files: [],
    createdAt: time, updatedAt: time, completedAt: null, deletedAt: null, previousStatus: null,
  };
}
function patchTask(task, patch, now = Date.now()) {
  const next = { ...task, updatedAt: new Date(now).toISOString() };
  if ('title' in patch) { next.title = cleanText(patch.title, 160).trim(); invariant(next.title, '请填写任务名称'); }
  if ('notes' in patch) next.notes = cleanText(patch.notes, 5000);
  if ('level' in patch) next.level = validateLevel(patch.level);
  if ('repeat' in patch) { next.repeat = repeatRule(patch.repeat); if (next.repeat !== task.repeat) next.repeatAnchor = Number((patch.plannedDate || task.plannedDate || require('./renderer/time.js').dateKey(new Date(patch.due || task.due || now))).slice(-2)); }
  if ('checklist' in patch) next.checklist = checklist(patch.checklist);
  if ('reminder' in patch) next.reminder = !!patch.reminder;
  if ('plannedDate' in patch) { next.plannedDate = planDate(patch.plannedDate); if (next.plannedDate) next.inbox = false; }
  if ('inbox' in patch) { next.inbox = !!patch.inbox; if (next.inbox) { next.plannedDate = null; next.focusDay = null; next.current = false; } }
  if ('estimatedMinutes' in patch) next.estimatedMinutes = minutes(patch.estimatedMinutes);
  if (next.focusDay && next.plannedDate && next.plannedDate > next.focusDay) next.focusDay = null;
  if ('due' in patch) {
    next.due = parseDue(patch.due);
    if (next.due !== task.due) { next.dueVersion++; next.dueChangedAt = next.updatedAt; next.snoozeUntil = null; }
  }
  return next;
}
function validateSettings(patch) {
  const next = {};
  for (const [key, value] of Object.entries(patch || {})) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    if (['transparency', 'textTransparency'].includes(key)) { invariant(Number.isFinite(value) && value >= 0 && value <= 100, '透明度应在 0–100% 之间'); next[key] = value; }
    else if (key === 'language') { invariant(['zh-CN', 'en'].includes(value), '语言设置无效'); next[key] = value; }
    else if (key === 'view') { invariant(['quadrants', 'today', 'week', 'inbox'].includes(value), '视图无效'); next[key] = value; }
    else if (key === 'quickShortcut') { invariant(['CommandOrControl+Shift+Space', 'Alt+Shift+Space'].includes(value), '快捷键无效'); next[key] = value; }
    else if (key === 'dailyCapacity') { invariant(Number.isInteger(value) && value >= 30 && value <= 1440, '每日容量应为 30–1440 分钟'); next[key] = value; }
    else if (key === 'theme') { invariant(['system', 'light', 'dark'].includes(value), '外观设置无效'); next[key] = value; }
    else if (key === 'windowSize') { invariant(['compact', 'normal', 'large'].includes(value), '窗口尺寸无效'); next[key] = value; }
    else { invariant(typeof value === 'boolean', '设置值无效'); next[key] = value; }
  }
  return next;
}
function emptyState() {
  return { schemaVersion: 3, tasks: [], settings: { ...DEFAULT_SETTINGS }, reminderLedger: {}, windowBounds: null };
}
function validateState(data) {
  invariant(data && [1, 2, 3].includes(data.schemaVersion) && Array.isArray(data.tasks), '备份格式或版本不受支持');
  invariant(data.tasks.length <= 10000, '任务数量超过当前支持范围');
  const state = emptyState(), ids = new Set();
  state.settings = { ...state.settings, ...validateSettings(data.settings) };
  state.tasks = data.tasks.map(t => {
    invariant(t && typeof t.id === 'string' && t.id.length <= 100 && !ids.has(t.id), '备份包含无效或重复任务'); ids.add(t.id);
    invariant(['active', 'completed', 'cancelled', 'deleted'].includes(t.status), '任务状态无效');
    invariant(typeof t.title === 'string' && t.title.trim() && t.title.length <= 160, '任务名称无效');
    invariant(Array.isArray(t.files) && t.files.length <= 200, '文件关联无效');
    const fileIds = new Set();
    const files = t.files.map(f => {
      invariant(f && typeof f.id === 'string' && !fileIds.has(f.id), '文件关联标识无效'); fileIds.add(f.id);
      invariant(typeof f.path === 'string' && f.path.length > 0 && f.path.length < 32768 && !f.path.includes('\0'), '文件路径无效');
      invariant(f.path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(f.path) || f.path.startsWith('\\\\'), '文件必须使用绝对路径');
      return { id: f.id, path: f.path, name: cleanText(f.name, 1024) || '文件' };
    });
    const createdAt = parseDue(t.createdAt); invariant(createdAt, '任务创建时间无效');
    return {
      id: t.id, title: t.title.trim(), inbox: !!t.inbox, plannedDate: planDate(t.plannedDate),
      estimatedMinutes: minutes(t.estimatedMinutes), order: Number.isFinite(t.order) ? t.order : Date.parse(createdAt),
      focusDay: planDate(t.focusDay), current: !!t.current, cancelledAt: parseDue(t.cancelledAt),
      repeat: repeatRule(t.repeat), repeatAnchor: Number.isInteger(t.repeatAnchor) && t.repeatAnchor >= 1 && t.repeatAnchor <= 31 ? t.repeatAnchor : Number((t.plannedDate || require('./renderer/time.js').dateKey(new Date(t.due || createdAt))).slice(-2)),
      previousOccurrenceId: typeof t.previousOccurrenceId === 'string' ? t.previousOccurrenceId.slice(0, 100) : null,
      snoozeUntil: parseDue(t.snoozeUntil), checklist: checklist(t.checklist),
      reviewedDueVersion: Number.isSafeInteger(t.reviewedDueVersion) ? t.reviewedDueVersion : 0, notes: cleanText(t.notes, 5000), level: validateLevel(t.level),
      due: parseDue(t.due), dueVersion: Math.max(1, Number.isSafeInteger(t.dueVersion) ? t.dueVersion : 1),
      dueChangedAt: parseDue(t.dueChangedAt) || createdAt, timezone: cleanText(t.timezone, 100),
      reminder: t.reminder !== false, status: t.status, files, createdAt,
      updatedAt: parseDue(t.updatedAt) || createdAt, completedAt: parseDue(t.completedAt),
      deletedAt: parseDue(t.deletedAt), previousStatus: ['completed', 'cancelled'].includes(t.previousStatus) ? t.previousStatus : 'active',
    };
  });
  for (const t of state.tasks) invariant(t.repeat === 'none' || (!t.inbox && (t.plannedDate || t.due)), '重复任务请先安排日期，或关闭重复后放入收集箱');
  const focusCounts = new Map();
  for (const t of state.tasks.filter(t => t.status === 'active')) {
    if (t.focusDay) { const count = (focusCounts.get(t.focusDay) || 0) + 1; invariant(count <= 3, '每天最多选 3 件重要任务'); focusCounts.set(t.focusDay, count); }
    invariant(!(t.inbox && (t.plannedDate || t.focusDay || t.current)), '收集箱任务需先安排');
  }
  invariant(state.tasks.filter(t => t.status === 'active' && t.current).length <= 1, '当前任务只能有一件');
  if (data.reminderLedger && typeof data.reminderLedger === 'object') {
    for (const [key, time] of Object.entries(data.reminderLedger)) {
      if (key.length < 200 && typeof time === 'number' && Number.isFinite(time)) state.reminderLedger[key] = time;
    }
  }
  const b = data.windowBounds;
  if (b && ['x', 'y', 'width', 'height'].every(k => Number.isInteger(b[k]))) state.windowBounds = { x: b.x, y: b.y, width: b.width, height: b.height };
  return state;
}

// Returns only reminders crossed since the previous check, including wake-up gaps.
// The caller records delivery before showing a notification, avoiding duplicate sends after a crash.
function pendingReminders(state, previous, now = Date.now()) {
  if (!state.settings.notifications) return [];
  const result = [];
  for (const task of state.tasks) {
    if (task.status !== 'active' || !task.reminder) continue;
    if (task.snoozeUntil) {
      const at = Date.parse(task.snoozeUntil), key = `${task.id}:${task.dueVersion}:snooze:${task.snoozeUntil}`;
      if (!state.reminderLedger[key] && at > previous && at <= now) result.push({ key, taskId: task.id, title: task.title, kind: 'snooze', at });
    }
    if (!task.due || task.reviewedDueVersion >= task.dueVersion || task.snoozeUntil) continue;
    const due = Date.parse(task.due), changed = Date.parse(task.dueChangedAt);
    for (const [kind, enabled, at] of [['before', state.settings.remindBefore, due - 24 * HOUR], ['due', state.settings.remindAt, due]]) {
      const key = `${task.id}:${task.dueVersion}:${kind}`;
      if (enabled && !state.reminderLedger[key] && at > changed && at > previous && at <= now) result.push({ key, taskId: task.id, title: task.title, kind, at });
    }
  }
  return result;
}

module.exports = { LABELS, HOUR, DEFAULT_SETTINGS, emptyState, createTask, patchTask, validateState, validateSettings, remainingHours, effectiveLevel, urgency, pendingReminders };
