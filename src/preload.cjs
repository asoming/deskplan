'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');
const allowed = new Set(['window:move', 'updates:download', 'updates:cancel', 'updates:install', 'updates:check', 'updates:acknowledge', 'updates:open', 'export:csv', 'plan', 'current', 'review', 'window:compact', 'quick:show', 'quick:hide', 'quick:create', 'quick:preferences', 'state', 'create', 'update', 'status', 'undo', 'purge', 'settings', 'files:select', 'files:pick', 'files:remove', 'files:relink', 'files:check', 'files:open', 'backup:export', 'backup:restore', 'backup:folder', 'window:quit']);
async function invoke(name, payload) {
  const result = await ipcRenderer.invoke(`fourfold:${name}`, payload);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
contextBridge.exposeInMainWorld('fourfold', {
  call: (name, payload) => { if (!allowed.has(name)) return Promise.reject(new Error('不支持此操作')); return invoke(name, payload); },
  inspectDroppedFiles: files => invoke('files:inspect', { paths: Array.from(files, file => webUtils.getPathForFile(file)) }),
  dropFiles: (files, target) => invoke('files:drop', { paths: Array.from(files, file => webUtils.getPathForFile(file)), taskId: target.taskId, level: target.level }),
  onActive: callback => subscribe('fourfold:active', callback),
  onCommand: callback => subscribe('fourfold:command', callback),
  onLanguage: callback => subscribe('fourfold:language', callback),
  onQuickFocus: callback => subscribe('fourfold:quick-focus', callback),
  onReview: callback => subscribe('fourfold:review', callback),
  onState: callback => subscribe('fourfold:state', callback),
  onMessage: callback => subscribe('fourfold:message', callback),
  onLocate: callback => subscribe('fourfold:locate', callback),
  onTick: callback => subscribe('fourfold:tick', callback),
});
