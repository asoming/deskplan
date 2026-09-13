'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { emptyState, validateState, validateSettings, createTask, patchTask } = require('./domain.cjs');
const { dateKey, byOrder } = require('./renderer/time.js');
const clone = value => JSON.parse(JSON.stringify(value));

function atomicWrite(file, content) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, content, 'utf8'); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.renameSync(temporary, file);
    // Directory fsync is not available on every platform; file content is already flushed.
    try { const dir = fs.openSync(path.dirname(file), 'r'); try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); } } catch {}
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

class Store {
  constructor(directory) {
    this.directory = directory;
    this.file = path.join(directory, 'tasks.json');
    this.previousFile = path.join(directory, 'tasks.previous.json');
    this.backupDirectory = path.join(directory, 'backups');
    this.history = [];
    this.recoveryNotice = '';
    fs.mkdirSync(this.backupDirectory, { recursive: true, mode: 0o700 });
    this.state = this.load();
  }
  load() {
    if (!fs.existsSync(this.file)) return emptyState();
    try { return validateState(JSON.parse(fs.readFileSync(this.file, 'utf8'))); }
    catch (originalError) {
      const candidates = [this.previousFile, ...fs.readdirSync(this.backupDirectory).filter(n => n.endsWith('.json')).sort().reverse().map(n => path.join(this.backupDirectory, n))];
      for (const candidate of candidates) {
        try {
          const restored = validateState(JSON.parse(fs.readFileSync(candidate, 'utf8')));
          fs.copyFileSync(this.file, path.join(this.directory, `tasks.corrupt-${Date.now()}.json`));
          atomicWrite(this.file, JSON.stringify(restored, null, 2));
          this.recoveryNotice = '数据读取异常，已从本地备份恢复。损坏文件已保留。';
          return restored;
        } catch {}
      }
      throw new Error(`无法读取任务数据，原文件已保留。请从备份恢复或联系支持。${originalError.message}`);
    }
  }
  snapshot() { return clone(this.state); }
  commit(next) {
    const validated = validateState(next);
    const previous = JSON.stringify(this.state, null, 2);
    const date = new Date().toISOString().slice(0, 10);
    const daily = path.join(this.backupDirectory, `${date}.json`);
    if (!fs.existsSync(daily)) atomicWrite(daily, previous);
    atomicWrite(this.previousFile, previous);
    atomicWrite(this.file, JSON.stringify(validated, null, 2));
    this.state = validated;
    const backups = fs.readdirSync(this.backupDirectory).filter(n => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
    for (const old of backups.slice(0, -7)) { try { fs.unlinkSync(path.join(this.backupDirectory, old)); } catch {} }
  }
  mutate(fn, undoable = true) {
    const next = this.snapshot(), previousTasks = clone(this.state.tasks);
    const result = fn(next);
    this.commit(next);
    if (undoable) { this.history.push(previousTasks); if (this.history.length > 20) this.history.shift(); }
    return result;
  }
  task(state, id) { const t = state.tasks.find(t => t.id === id); if (!t) throw new Error('找不到这件任务'); return t; }
  create(input, files = []) { return this.mutate(s => { const task = createTask(input); task.files = files.map(f => ({ id: randomUUID(), ...f })); s.tasks.push(task); return task.id; }); }
  update(id, patch) { this.mutate(s => { const index = s.tasks.findIndex(t => t.id === id); if (index < 0) throw new Error('任务不存在'); s.tasks[index] = patchTask(s.tasks[index], patch); }); }
  status(id, action) {
    this.mutate(s => {
      const task = this.task(s, id), now = new Date().toISOString();
      if (action === 'complete' && task.status === 'active') { task.status = 'completed'; task.completedAt = now; }
      else if (action === 'delete' && task.status !== 'deleted') { task.previousStatus = task.status; task.status = 'deleted'; task.deletedAt = now; }
      else if (action === 'restore' && task.status === 'deleted') { task.status = task.previousStatus || 'active'; task.deletedAt = null; }
      else if (action === 'cancel' && task.status === 'active') { task.status = 'cancelled'; task.cancelledAt = now; }
      else if (action === 'reopen' && ['completed', 'cancelled'].includes(task.status)) { task.status = 'active'; task.completedAt = null; }
      else throw new Error('任务状态已变化，请刷新后重试');
      task.current = false; task.focusDay = null;
      task.updatedAt = now;
    });
  }
  plan(id, { day, focus, beforeId } = {}) {
    this.mutate(s => {
      const task = this.task(s, id);
      if (task.status !== 'active') throw new Error('只能安排待办任务');
      Object.assign(task, patchTask(task, { plannedDate: day || dateKey(new Date()), inbox: false }));
      if (typeof focus === 'boolean') task.focusDay = focus ? task.plannedDate : null;
      const ordered = s.tasks.filter(t => t.id !== id).sort(byOrder);
      const index = beforeId ? ordered.findIndex(t => t.id === beforeId) : -1;
      ordered.splice(index < 0 ? ordered.length : index, 0, task);
      ordered.forEach((t, i) => { t.order = i; });
    });
  }
  startCurrent(id) {
    this.mutate(s => {
      const task = this.task(s, id);
      if (task.status !== 'active') throw new Error('这件任务已结束');
      s.tasks.forEach(t => { t.current = t.id === id; });
      task.inbox = false;
      task.plannedDate = dateKey(new Date());
    });
  }
  review(id, choice, due) {
    if (choice === 'cancel') return this.status(id, 'cancel');
    if (choice === 'defer') {
      if (!due || Date.parse(due) <= Date.now()) throw new Error('延期时间应晚于现在');
      return this.update(id, { due });
    }
    if (choice !== 'keep') throw new Error('处理方式无效');
    this.mutate(s => { const t = this.task(s, id); t.reviewedDueVersion = t.dueVersion; });
  }
  attach(id, files) {
    this.mutate(s => {
      const t = this.task(s, id), known = new Set(t.files.map(f => process.platform === 'win32' ? f.path.toLowerCase() : f.path));
      for (const file of files) {
        const key = process.platform === 'win32' ? file.path.toLowerCase() : file.path;
        if (!known.has(key)) { t.files.push({ id: randomUUID(), ...file }); known.add(key); }
      }
      t.updatedAt = new Date().toISOString();
    });
  }
  createFromFiles(level, files) {
    return this.mutate(s => files.map(file => { const t = createTask({ title: path.parse(file.name).name || file.name, level }); t.files.push({ id: randomUUID(), ...file }); s.tasks.push(t); return t.id; }));
  }
  removeAttachment(id, fileId) { this.mutate(s => { const t = this.task(s, id); t.files = t.files.filter(f => f.id !== fileId); }); }
  relink(id, fileId, file) {
    this.mutate(s => {
      const t = this.task(s, id), attachment = t.files.find(f => f.id === fileId);
      if (!attachment) throw new Error('文件关联已不存在');
      if (t.files.some(f => f.id !== fileId && f.path === file.path)) throw new Error('该文件已关联到此任务');
      Object.assign(attachment, file);
    });
  }
  undo() {
    if (!this.history.length) throw new Error('没有可撤销的操作');
    const next = this.snapshot(); next.tasks = clone(this.history.at(-1)); this.commit(next); this.history.pop();
  }
  saveSettings(patch) { this.mutate(s => Object.assign(s.settings, validateSettings(patch)), false); }
  saveBounds(bounds) { this.mutate(s => { s.windowBounds = bounds; }, false); }
  markReminders(keys, now) { this.mutate(s => { for (const key of keys) s.reminderLedger[key] = now; }, false); }
  purge(id) {
    this.mutate(s => { const task = this.task(s, id); if (task.status !== 'deleted') throw new Error('只能永久删除回收站中的任务'); s.tasks = s.tasks.filter(t => t.id !== id); }, false);
    this.history = [];
  }
  export(file) { atomicWrite(file, JSON.stringify({ ...this.snapshot(), exportedAt: new Date().toISOString() }, null, 2)); }
  restore(file) {
    if (fs.statSync(file).size > 20 * 1024 * 1024) throw new Error('备份文件超过 20 MB');
    const incoming = validateState(JSON.parse(fs.readFileSync(file, 'utf8')));
    this.export(path.join(this.backupDirectory, `before-restore-${Date.now()}.json`));
    // Device integration settings should remain those of this computer after a restore.
    incoming.settings.autoStart = this.state.settings.autoStart;
    incoming.windowBounds = this.state.windowBounds;
    this.commit(incoming); this.history = [];
  }
}
module.exports = { Store, atomicWrite };
