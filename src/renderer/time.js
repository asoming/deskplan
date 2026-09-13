(function (root) {
  const HOUR = 3600000;
  const remainingHours = (task, now = Date.now()) => task.due ? (Date.parse(task.due) - now) / HOUR : Infinity;
  const effectiveLevel = (task, now = Date.now()) => task.status === 'active' && task.level === 1 && remainingHours(task, now) <= 48 ? 0 : task.level;
  function urgency(task, now = Date.now()) { const h = remainingHours(task, now); return h < 0 ? 'late' : h <= 24 ? 'red' : h <= 48 ? 'hot' : h <= 168 ? 'warm' : 'calm'; }
  function remainingLabel(task, now = Date.now()) {
    const h = remainingHours(task, now);
    if (h === Infinity) return '';
    if (h < 0) return -h < 24 ? '已逾期' : `逾期 ${Math.ceil(-h / 24)} 天`;
    if (h === 0) return '现在截止';
    if (h < 1) return `剩 ${Math.ceil(h * 60)} 分钟`;
    return h <= 48 ? `剩 ${Math.ceil(h)} 小时` : `剩 ${Math.ceil(h / 24)} 天`;
  }
  const dateKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const plannedDay = t => t.plannedDate || (t.due ? dateKey(new Date(t.due)) : '');
  const byOrder = (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  const todayTasks = (tasks, day = dateKey(new Date())) => tasks.filter(t => t.status === 'active' && !t.inbox && plannedDay(t) && plannedDay(t) <= day).sort(byOrder);
  function weekDays(value = new Date()) {
    const d = new Date(value); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7);
    return Array.from({ length: 7 }, (_, i) => { const next = new Date(d); next.setDate(d.getDate() + i); return dateKey(next); });
  }
  const api = { HOUR, remainingHours, effectiveLevel, urgency, remainingLabel, dateKey, plannedDay, byOrder, todayTasks, weekDays };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FourfoldTime = Object.freeze(api);
})(globalThis);
