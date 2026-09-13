'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, Menu, Tray, nativeImage, Notification, screen, powerMonitor, session, globalShortcut } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { tr, setLanguage } = require('./i18n.js');
const { isTrustedFileURL } = require('./trusted-file.cjs');
const { Store, atomicWrite } = require('./store.cjs');
const { exportCSV } = require('./export.cjs');
const { inspectPaths, inspectAttachment } = require('./attachments.cjs');
const { effectiveLevel, pendingReminders, validateSettings } = require('./domain.cjs');

// Keep the existing data directory across the product rename.
app.setPath('userData', path.join(app.getPath('appData'), '四格'));
app.setName('日序');
if (process.platform === 'linux') {
  app.setDesktopName('io.rixu.desktop');
  // EWMH BELOW provides an interactive layer above desktop icons on X11/XWayland.
  app.commandLine.appendSwitch('ozone-platform', 'x11');
}
if (process.platform === 'win32') app.setAppUserModelId('io.rixu');
// This panel has no GPU-dependent content. Software rendering also works on remote Linux desktops.
if (process.platform === 'linux' || (process.platform === 'darwin' && process.arch === 'x64')) app.disableHardwareAcceleration();
const dataDirectory = process.env.RIXU_DATA_DIR || process.env.FOURFOLD_DATA_DIR;
if (dataDirectory) app.setPath('userData', path.resolve(dataDirectory));
const isTest = process.env.RIXU_TEST === '1' || process.env.FOURFOLD_TEST === '1';
const { panelBounds, sameBounds } = require('./window-layout.cjs');
const indexFile = path.join(__dirname, 'renderer', 'index.html');
let panelLocked = false, unlockRegistered = false;
const unlockShortcut = 'CommandOrControl+Shift+L';
let quickWin, quickRegistered = false, registeredAccelerator = null, normalBounds, fixedBounds;
let win, tray, store, quitting = false, timer, lastCheck = Date.now(), lastLevels = new Map(), moveTimer;

function viewState() {
  return {
    ...store.snapshot(), canUndo: store.history.length > 0, recoveryNotice: tr(store.recoveryNotice),
    native: { platform: process.platform, notificationsSupported: Notification.isSupported(), trayAvailable: !!tray,
      quickShortcutRegistered: quickRegistered, panelLocked, unlockShortcutRegistered: unlockRegistered, version: require('../package.json').version,
      autoStartSupported: process.platform !== 'linux' || app.isPackaged },
  };
}
function broadcast() { if (win && !win.isDestroyed()) win.webContents.send('fourfold:state', viewState()); }
function message(text) { if (win && !win.isDestroyed()) win.webContents.send('fourfold:message', text); }
function showWindow(taskId) { if (panelLocked) setPanelLocked(false); if (taskId && store.state.settings.compactMode) { store.saveSettings({ compactMode: false }); applySettings(); broadcast(); } if (!win || win.isDestroyed()) return; win.show(); if (win.isMinimized()) win.restore(); win.focus(); if (taskId) win.webContents.send('fourfold:locate', taskId); }
function reportError(error) { console.error(error); message(tr(error.message) || tr('操作未完成，请重试')); }
function taskFile(taskId, fileId) {
  const task = store.state.tasks.find(t => t.id === taskId), file = task?.files.find(f => f.id === fileId);
  if (!file) throw new Error(tr('文件关联不存在')); return file;
}
async function pickFiles(multiple = true, directory = false) {
  const result = await dialog.showOpenDialog(win, { title: directory ? tr('关联任务文件夹') : tr('关联任务文件'), buttonLabel: tr('选择'), properties: [directory ? 'openDirectory' : 'openFile', ...(multiple ? ['multiSelections'] : [])] });
  return result.canceled ? [] : inspectPaths(result.filePaths);
}
function clampBounds(bounds) {
  const display = screen.getDisplayMatching(bounds), area = display.workArea;
  const width = Math.min(bounds.width, area.width), height = Math.min(bounds.height, area.height);
  return { x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)), y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)), width, height };
}
function positionWindow() {
  const current = win.getBounds();
  const area = screen.getDisplayMatching(current).workArea;
  const bounds = panelBounds(store.state.settings, current, area);
  fixedBounds = bounds;
  if (!sameBounds(current, bounds)) win.setBounds(bounds);
}
function applySettings() {
  setLanguage(store.state.settings.language);
  win.setTitle(tr('日序'));
  if (quickWin && !quickWin.isDestroyed()) {
    quickWin.setTitle(tr('日序 · 随手记'));
    quickWin.webContents.send('fourfold:language', store.state.settings.language);
  }
  updateApplicationMenu();
  nativeTheme.themeSource = store.state.settings.theme;
  win.setHasShadow(!store.state.settings.desktopBlend);
  // A planner must never remain above the user's working application.
  if (process.platform === 'win32') win.setAlwaysOnTop(false);
  if (process.platform !== 'linux') win.setMovable(!store.state.settings.positionFixed);
  positionWindow();
  registerQuickShortcut(); updateTray();
}
function setAutoStart(enabled) {
  if (isTest) return;
  if (process.platform === 'linux') {
    if (!app.isPackaged) throw new Error(tr('开机启动需要使用打包后的桌面版'));
    const folder = path.join(app.getPath('appData'), 'autostart'), file = path.join(folder, 'fourfold.desktop');
    fs.mkdirSync(folder, { recursive: true });
    if (enabled) {
      const executable = process.execPath.replace(/["\\`$]/g, '\\$&');
      atomicWrite(file, `[Desktop Entry]\nType=Application\nName=日序\nExec="${executable}" --hidden\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`);
    } else if (fs.existsSync(file)) fs.unlinkSync(file);
  } else app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] });
}
function updateApplicationMenu() {
  if (process.platform !== 'darwin') return;
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: tr('日序'), submenu: [
      { role: 'about', label: tr('关于日序') }, { type: 'separator' },
      { role: 'hide', label: tr('隐藏日序') }, { role: 'hideOthers', label: tr('隐藏其他应用') }, { role: 'unhide', label: tr('显示全部') },
      { type: 'separator' }, { role: 'quit', label: tr('退出日序') },
    ] },
    { label: tr('编辑'), submenu: [['undo','撤销'],['redo','重做'],['cut','剪切'],['copy','复制'],['paste','粘贴'],['selectAll','全选']].map(([role,label]) => ({ role, label: tr(label) })) },
    { label: tr('窗口'), submenu: [{ role: 'minimize', label: tr('最小化') }, { role: 'zoom', label: tr('缩放') }, { role: 'front', label: tr('前置全部窗口') }] },
  ]));
}
function updateTray() {
  if (!tray) return;
  tray.setToolTip(tr('日序 · 桌面计划'));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: tr('显示日序'), click: () => showWindow() },
    { label: tr('随手记'), click: () => showQuickCapture() },
    { label: panelLocked ? tr('解锁面板') : tr('锁定并穿透鼠标'), enabled: unlockRegistered || !!tray, click: () => { try { setPanelLocked(!panelLocked); } catch (e) { reportError(e); } } },
    { label: tr('恢复可见'), click: () => { store.saveSettings({ transparency: 35, textTransparency: 0, compactMode: false }); applySettings(); broadcast(); showWindow(); } },
    { label: tr('固定位置'), type: 'checkbox', checked: store.state.settings.positionFixed, click: item => { try { store.saveSettings({ positionFixed: item.checked, windowPosition: 'manual' }); applySettings(); broadcast(); } catch (e) { reportError(e); } } },
    { type: 'separator' }, { label: tr('退出日序'), click: () => { quitting = true; app.quit(); } },
  ]));
}
function createTray() {
  try {
    const image = nativeImage.createFromPath(path.join(__dirname, 'assets', process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png'));
    if (process.platform === 'darwin') image.setTemplateImage(true);
    tray = new Tray(image.resize({ width: 20, height: 20 }));
    tray.setToolTip(tr('日序 · 桌面计划')); tray.on('click', () => showWindow()); updateTray();
  } catch (error) { console.warn('Tray unavailable:', error.message); tray = null; }
}
function clockCheck() {
  const now = Date.now();
  try {
    const moved = store.state.tasks.filter(t => t.status === 'active' && t.level === 1 && effectiveLevel(t, now) === 0 && lastLevels.get(t.id) === 1);
    lastLevels = new Map(store.state.tasks.map(t => [t.id, effectiveLevel(t, now)]));
    if (moved.length) message(tr`${moved.length} 件任务剩余不超过 48 小时，已移入「马上做」`);
    const reminders = pendingReminders(store.state, lastCheck, now);
    if (reminders.length && Notification.isSupported()) {
      store.markReminders(reminders.map(r => r.key), now);
      const missed = now - lastCheck > 120_000;
      const groups = reminders.length > 1 || missed ? [reminders] : reminders.map(r => [r]);
      for (const group of groups) {
        const notification = new Notification({ title: group.length > 1 || missed ? tr('日序 · 待处理提醒') : (group[0].kind === 'before' ? tr('距截止还有 24 小时') : group[0].kind === 'snooze' ? tr('日序 · 稍后提醒') : tr('任务已到截止时间')),
          body: group.length > 1 ? tr`${new Set(group.map(r => r.taskId)).size} 件任务需要处理，打开日序查看。` : group[0].title,
          icon: path.join(__dirname, 'assets', 'icon.png') });
        notification.on('click', () => { showWindow(); win.webContents.send('fourfold:review', group[0].taskId); }); notification.show();
      }
    }
    lastCheck = now;
    if (win && !win.isDestroyed()) win.webContents.send('fourfold:tick', now);
  } catch (e) { reportError(e); }
}

function setPanelLocked(locked) {
  if (locked && !unlockRegistered && !tray) throw new Error(tr('没有可用的解锁入口；请先启用托盘或释放 Ctrl/⌘ + Shift + L'));
  panelLocked = locked;
  win.setIgnoreMouseEvents(locked, { forward: true });
  if (locked) win.blur();
  broadcast(); updateTray();
}
function registerQuickShortcut() {
  const accelerator = store.state.settings.quickCapture ? store.state.settings.quickShortcut : null;
  if (accelerator === registeredAccelerator && quickRegistered) return;
  if (registeredAccelerator) globalShortcut.unregister(registeredAccelerator);
  registeredAccelerator = accelerator;
  quickRegistered = accelerator ? globalShortcut.register(accelerator, showQuickCapture) : false;
}
async function showQuickCapture() {
  if (!quickWin || quickWin.isDestroyed()) {
    quickWin = new BrowserWindow({ width: 540, height: 190, frame: false, resizable: false, alwaysOnTop: false, skipTaskbar: true, show: false,
      title: tr('日序 · 随手记'), backgroundColor: '#f5f7f4', icon: path.join(__dirname, 'assets', 'icon.png'),
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false } });
    quickWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    quickWin.webContents.on('will-navigate', e => e.preventDefault());
    quickWin.on('blur', () => { if (!quickWin.isDestroyed()) quickWin.hide(); });
    quickWin.on('close', e => { if (!quitting) { e.preventDefault(); quickWin.hide(); } });
    await quickWin.loadFile(path.join(__dirname, 'renderer', 'quick.html'));
  }
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  quickWin.setPosition(Math.round(area.x + (area.width - 540) / 2), Math.round(area.y + area.height * .28));
  quickWin.show(); quickWin.focus(); quickWin.webContents.send('fourfold:quick-focus');
}
function setCompact(enabled) {
  if (enabled && !store.state.settings.compactMode) normalBounds = win.getBounds();
  store.saveSettings({ compactMode: enabled }); applySettings();
  if (!enabled && normalBounds && store.state.settings.windowPosition === 'manual') { fixedBounds = clampBounds(normalBounds); win.setBounds(fixedBounds); }
  broadcast();
}
function registerIPC() {
  const handlers = {
    state: async () => viewState(),
    plan: async ({ id, ...options }) => { store.plan(id, options); broadcast(); },
    current: async ({ id }) => { store.startCurrent(id); broadcast(); },
    review: async ({ id, choice, due }) => { store.review(id, choice, due); broadcast(); },
    'window:lock': async ({ locked }) => setPanelLocked(!!locked),
    'window:compact': async ({ enabled }) => setCompact(!!enabled),
    'quick:show': async () => showQuickCapture(),
    'quick:hide': async () => quickWin?.hide(),
    'quick:preferences': async () => ({ language: store.state.settings.language }),
    'quick:create': async ({ title }) => { const id = store.create({ title, inbox: true, level: 3 }); broadcast(); quickWin?.hide(); message(tr('已记入收集箱')); return id; },
    create: async input => { const files = input.paths?.length ? inspectPaths(input.paths) : []; const id = store.create(input, files); broadcast(); return id; },
    update: async ({ id, patch }) => { store.update(id, patch); broadcast(); },
    status: async ({ id, action }) => { store.status(id, action); broadcast(); },
    undo: async () => { store.undo(); broadcast(); },
    purge: async ({ id }) => {
      const choice = await dialog.showMessageBox(win, { type: 'warning', title: tr('永久删除任务'), message: tr('永久删除这件任务？'), detail: tr('任务记录无法恢复。磁盘上的原文件不会被删除。'), buttons: [tr('取消'), tr('永久删除')], defaultId: 0, cancelId: 0 });
      if (choice.response === 1) { store.purge(id); broadcast(); return true; } return false;
    },
    settings: async patch => {
      const valid = validateSettings(patch);
      if (valid.positionFixed === false && !('windowPosition' in valid)) valid.windowPosition = 'manual';
      const oldAutoStart = store.state.settings.autoStart;
      if ('autoStart' in valid && valid.autoStart !== oldAutoStart) setAutoStart(valid.autoStart);
      try { store.saveSettings(valid); } catch (e) { if ('autoStart' in valid) setAutoStart(oldAutoStart); throw e; }
      applySettings(); broadcast();
    },
    'files:select': async ({ directory = false } = {}) => pickFiles(true, directory),
    'files:pick': async ({ taskId, directory = false }) => { const files = await pickFiles(true, directory); if (files.length) { store.attach(taskId, files); broadcast(); } return files.length; },
    'files:drop': async ({ paths, taskId, level }) => {
      const files = inspectPaths(paths);
      const ids = taskId ? (store.attach(taskId, files), [taskId]) : store.createFromFiles(level, files);
      broadcast(); return ids;
    },
    'files:remove': async ({ taskId, fileId }) => { store.removeAttachment(taskId, fileId); broadcast(); },
    'files:relink': async ({ taskId, fileId }) => { const files = await pickFiles(false, taskFile(taskId, fileId).kind === 'directory'); if (files.length) { store.relink(taskId, fileId, files[0]); broadcast(); } },
    'files:check': async ({ taskId }) => {
      const task = store.state.tasks.find(t => t.id === taskId); if (!task) return [];
      return await Promise.all(task.files.map(inspectAttachment));
    },
    'files:open': async ({ taskId, fileId, folder }) => {
      const file = taskFile(taskId, fileId); if (!fs.existsSync(file.path)) throw new Error(tr('文件不可用，请重新定位'));
      if (folder) shell.showItemInFolder(file.path);
      else { const error = await shell.openPath(file.path); if (error) throw new Error(tr`无法打开文件：${error}`); }
    },
    'export:csv': async () => {
      const result = await dialog.showSaveDialog(win, { title: tr('导出任务表格'), buttonLabel: tr('保存'), defaultPath: 'Rixu-tasks.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] });
      if (result.canceled || !result.filePath) return false;
      atomicWrite(result.filePath, exportCSV(store.state.tasks)); return true;
    },
    'backup:export': async () => {
      const result = await dialog.showSaveDialog(win, { title: tr('导出备份（不含原文件）'), buttonLabel: tr('保存'), defaultPath: tr`日序备份-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: tr('日序备份'), extensions: ['json'] }] });
      if (result.canceled || !result.filePath) return false;
      store.export(result.filePath); return true;
    },
    'backup:restore': async () => {
      const result = await dialog.showOpenDialog(win, { title: tr('选择日序备份'), buttonLabel: tr('选择'), properties: ['openFile'], filters: [{ name: tr('日序备份'), extensions: ['json'] }] });
      if (result.canceled) return false;
      const confirm = await dialog.showMessageBox(win, { type: 'question', message: tr('用备份替换当前任务数据？'), detail: tr('恢复前会备份当前数据。原始附件文件不包含在备份中。'), buttons: [tr('取消'), tr('恢复备份')], defaultId: 0, cancelId: 0 });
      if (confirm.response !== 1) return false;
      store.restore(result.filePaths[0]); applySettings(); broadcast(); return true;
    },
    'backup:folder': async () => { const error = await shell.openPath(store.backupDirectory); if (error) throw new Error(error); },
    'window:minimize': async () => win.minimize(),
    'window:close': async () => win.close(),
    'window:quit': async () => { quitting = true; app.quit(); },
  };
  for (const [name, handler] of Object.entries(handlers)) ipcMain.handle(`fourfold:${name}`, async (event, payload) => {
    const fromMain = event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && isTrustedFileURL(event.senderFrame.url, indexFile);
    const fromQuick = quickWin && !quickWin.isDestroyed() && event.sender === quickWin.webContents && event.senderFrame === quickWin.webContents.mainFrame && isTrustedFileURL(event.senderFrame.url, path.join(__dirname, 'renderer', 'quick.html'));
    if (!fromMain && !(fromQuick && ['quick:create', 'quick:hide', 'quick:preferences'].includes(name))) throw new Error(tr('请求来源无效'));
    try { return { ok: true, value: await handler(payload) }; } catch (e) { return { ok: false, error: tr(e.message || '操作失败') }; }
  });
}

async function start() {
  if (!isTest && !app.requestSingleInstanceLock()) { app.quit(); return; }
  app.on('second-instance', () => showWindow());
  await app.whenReady();
  store = new Store(app.getPath('userData'));
  setLanguage(store.state.settings.language);
  nativeTheme.themeSource = store.state.settings.theme;
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  const saved = store.state.windowBounds;
  const area = (saved ? screen.getDisplayMatching(saved) : screen.getPrimaryDisplay()).workArea;
  const bounds = panelBounds(store.state.settings, saved || area, area);
  win = new BrowserWindow({ ...bounds, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    resizable: false, maximizable: false, fullscreenable: false, hasShadow: true,
    ...(process.platform === 'darwin' ? { type: 'desktop' } : {}),
    title: tr('日序'), icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, webSecurity: true } });
  if (process.platform !== 'darwin') {
    const layer = require('./native/build/Release/window_layer.node');
    layer.attach(win.getNativeWindowHandle());
  }
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  if (process.platform === 'win32') win.setAlwaysOnTop(false);
  Menu.setApplicationMenu(null);
  unlockRegistered = globalShortcut.register(unlockShortcut, () => { try { setPanelLocked(!panelLocked); if (!panelLocked) showWindow(); } catch (e) { reportError(e); } });
  createTray(); registerIPC(); registerQuickShortcut(); applySettings();
  win.on('will-move', event => { if (store.state.settings.positionFixed) event.preventDefault(); });
  win.on('move', () => {
    if (store.state.settings.positionFixed && fixedBounds && !sameBounds(win.getBounds(), fixedBounds)) {
      win.setBounds(fixedBounds); return;
    }
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      if (!quitting && win && !win.isDestroyed() && !store.state.settings.compactMode) {
        try { store.saveBounds(win.getBounds()); } catch (e) { reportError(e); }
      }
    }, 500);
  });
  win.on('close', async event => {
    if (quitting || isTest) return;
    if (store.state.settings.closeToTray && tray) {
      event.preventDefault();
      if (!store.state.settings.closeExplained) {
        const result = await dialog.showMessageBox(win, { type: 'info', message: tr('关闭后，日序会留在后台'), detail: tr('通过系统托盘/菜单栏可重新打开，截止提醒仍会运行。完全退出后停止提醒。'), buttons: [tr('留在后台'), tr('退出应用')], defaultId: 0, cancelId: 0 });
        if (result.response === 1) { quitting = true; app.quit(); return; }
        try { store.saveSettings({ closeExplained: true }); } catch (e) { reportError(e); }
      }
      win.hide();
    } else { quitting = true; app.quit(); }
  });
  screen.on('display-removed', positionWindow);
  screen.on('display-metrics-changed', positionWindow);
  powerMonitor.on('resume', clockCheck);
  lastLevels = new Map(store.state.tasks.map(t => [t.id, effectiveLevel(t)]));
  timer = setInterval(clockCheck, 60_000);
  await win.loadFile(indexFile);
  if (!isTest && (!process.argv.includes('--hidden') || !tray)) win.show();
  return { window: win, store, clockCheck, viewState, showQuickCapture, setPanelLocked, getQuickWindow: () => quickWin };
}

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('before-quit', () => {
  quitting = true; clearTimeout(moveTimer); clearInterval(timer);
  if (store && win && !win.isDestroyed() && !store.state.settings.compactMode) { try { store.saveBounds(win.getBounds()); } catch (e) { console.error('Window position was not saved:', e.message); } }
});
app.on('activate', () => showWindow());
app.on('window-all-closed', () => { if (!tray || quitting) app.quit(); });

if (require.main === module) start().catch(error => { dialog.showErrorBox(tr('日序无法启动'), error.message); app.quit(); });
module.exports = { start };
