'use strict';
const { tr } = require('./i18n.js');
const { LABELS } = require('./domain.cjs');
function csvCell(value) {
  let text = String(value ?? '');
  // Spreadsheet programs must treat titles/notes as data rather than formulas.
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
function exportCSV(tasks) {
  const rows = [['Title / 任务', 'Status / 状态', 'Priority / 分区', 'Planned date / 计划日期', 'Deadline / 截止时间', 'Minutes / 分钟', 'Repeat / 重复', 'Notes / 备注']];
  for (const t of tasks) rows.push([t.title,t.status,tr(LABELS[t.level]),t.plannedDate,t.due,t.estimatedMinutes,t.repeat,t.notes]);
  return '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
module.exports = { csvCell, exportCSV };
