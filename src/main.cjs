'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, Menu, Tray, nativeImage, Notification, screen, powerMonitor, session, globalShortcut } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Store, atomicWrite } = require('./store.cjs');
const { exportCSV } = require('./export.cjs');
const { effectiveLevel, pendingReminders, validateSettings } = require('./domain.cjs');

// Keep the existing data directory across the product rename.
app.setPath('userData', path.join(app.getPath('appData'), '四格'));
app.setName('日序');
if (process.platform === 'linux') app.setDesktopName('io.rixu.desktop');
if (process.platform === 'win32') app.setAppUserModelId('io.rixu');
// This panel has no GPU-dependent content. Software rendering also works on remote Linux desktops.
if (process.platform === 'linux' || (process.platform === 'darwin' && process.arch === 'x64')) app.disableHardwareAcceleration();
const dataDirectory = process.env.RIXU_DATA_DIR || process.env.FOURFOLD_DATA_DIR;
if (dataDirectory) app.setPath('userData', path.resolve(dataDirectory));
const isTest = process.env.RIXU_TEST === '1' || process.env.FOURFOLD_TEST === '1';
const sizes = { compact: [760, 540], normal: [960, 640], large: [1180, 760] };
const indexFile = path.join(__dirname, 'renderer', 'index.html');
const indexURL = pathToFileURL(indexFile).href;
let panelLocked = false, unlockRegistered = false;
const unlockShortcut = 'CommandOrControl+Shift+L';
let quickWin, quickRegistered = false, registeredAccelerator = null, normalBounds;
let win, tray, store, quitting = false, timer, lastCheck = Date.now(), lastLevels = new Map(), moveTimer;

function viewState() {
  return {
    ...store.snapshot(), canUndo: store.history.length > 0, recoveryNotice: store.recoveryNotice,
    native: { platform: process.platform, notificationsSupported: Notification.isSupported(), trayAvailable: !!tray,
      quickShortcutRegistered: quickRegistered, panelLocked, unlockShortcutRegistered: unlockRegistered, version: require('../package.json').version,
      autoStartSupported: process.platform !== 'linux' || app.isPackaged },
  };
}
function broadcast() { if (win && !win.isDestroyed()) win.webContents.send('fourfold:state', viewState()); }
function message(text) { if (win && !win.isDestroyed()) win.webContents.send('fourfold:message', text); }
function showWindow(taskId) { if (panelLocked) setPanelLocked(false); if (taskId && store.state.settings.compactMode) { store.saveSettings({ compactMode: false }); applySettings(); broadcast(); } if (!win || win.isDestroyed()) return; win.show(); if (win.isMinimized()) win.restore(); win.focus(); if (taskId) win.webContents.send('fourfold:locate', taskId); }
function reportError(error) { console.error(error); message(error.message || '操作未完成，请重试'); }
function taskFile(taskId, fileId) {
  const task = store.state.tasks.find(t => t.id === taskId), file = task?.files.find(f => f.id === fileId);
  if (!file) throw new Error('文件关联不存在'); return file;
}
function inspectPaths(paths) {
  if (!Array.isArray(paths) || !paths.length || paths.length > 100) throw new Error('一次请选择 1–100 个文件');
  return paths.map(p => {
    if (typeof p !== 'string' || !path.isAbsolute(p)) throw new Error('请选择电脑上的文件');
    const normalized = path.normalize(p), stats = fs.statSync(normalized);
    if (!stats.isFile()) throw new Error('当前支持拖入文件，暂不支持文件夹');
    return { path: normalized, name: path.basename(normalized) };
  });
}
async function pickFiles(multiple = true) {
  const result = await dialog.showOpenDialog(win, { title: '关联任务文件', properties: ['openFile', ...(multiple ? ['multiSelections'] : [])] });
  return result.canceled ? [] : inspectPaths(result.filePaths);
}
function clampBounds(bounds) {
  const display = screen.getDisplayMatching(bounds), area = display.workArea;
  const width = Math.min(bounds.width, area.width), height = Math.min(bounds.height, area.height);
  return { x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)), y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)), width, height };
}
function applySettings() {
  nativeTheme.themeSource = store.state.settings.theme;
  win.setHasShadow(!store.state.settings.desktopBlend);
  win.setAlwaysOnTop(store.state.settings.compactMode || store.state.settings.alwaysOnTop);
  const [width, height] = store.state.settings.compactMode ? [390, 320] : sizes[store.state.settings.windowSize];
  win.setBounds(clampBounds({ ...win.getBounds(), width, height }));
  registerQuickShortcut(); updateTray();
}
function setAutoStart(enabled) {
  if (isTest) return;
  if (process.platform === 'linux') {
    if (!app.isPackaged) throw new Error('开机启动需要使用打包后的桌面版');
    const folder = path.join(app.getPath('appData'), 'autostart'), file = path.join(folder, 'fourfold.desktop');
    fs.mkdirSync(folder, { recursive: true });
    if (enabled) {
      const executable = process.execPath.replace(/["\\`$]/g, '\\$&');
      atomicWrite(file, `[Desktop Entry]\nType=Application\nName=日序\nExec="${executable}" --hidden\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`);
    } else if (fs.existsSync(file)) fs.unlinkSync(file);
  } else app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] });
}
function updateTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示日序', click: () => showWindow() },
    { label: '随手记', click: () => showQuickCapture() },
    { label: panelLocked ? '解锁面板' : '锁定并穿透鼠标', enabled: unlockRegistered || !!tray, click: () => { try { setPanelLocked(!panelLocked); } catch (e) { reportError(e); } } },
    { label: '恢复可见', click: () => { store.saveSettings({ transparency: 35, textTransparency: 0, compactMode: false }); applySettings(); broadcast(); showWindow(); } },
    { label: '始终置顶', type: 'checkbox', checked: store.state.settings.alwaysOnTop, click: item => { try { store.saveSettings({ alwaysOnTop: item.checked }); applySettings(); broadcast(); } catch (e) { reportError(e); } } },
    { type: 'separator' }, { label: '退出日序', click: () => { quitting = true; app.quit(); } },
  ]));
}
function createTray() {
  try {
    const image = nativeImage.createFromPath(path.join(__dirname, 'assets', process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png'));
    if (process.platform === 'darwin') image.setTemplateImage(true);
    tray = new Tray(image.resize({ width: 20, height: 20 }));
    tray.setToolTip('日序 · 桌面计划'); tray.on('click', () => showWindow()); updateTray();
  } catch (error) { console.warn('Tray unavailable:', error.message); tray = null; }
}
function clockCheck() {
  const now = Date.now();
  try {
    const moved = store.state.tasks.filter(t => t.status === 'active' && t.level === 1 && effectiveLevel(t, now) === 0 && lastLevels.get(t.id) === 1);
    lastLevels = new Map(store.state.tasks.map(t => [t.id, effectiveLevel(t, now)]));
    if (moved.length) message(`${moved.length} 件任务剩余不超过 48 小时，已移入「马上做」`);
    const reminders = pendingReminders(store.state, lastCheck, now);
    if (reminders.length && Notification.isSupported()) {
      store.markReminders(reminders.map(r => r.key), now);
      const missed = now - lastCheck > 120_000;
      const groups = reminders.length > 1 || missed ? [reminders] : reminders.map(r => [r]);
      for (const group of groups) {
        const notification = new Notification({ title: group.length > 1 || missed ? '日序 · 待处理提醒' : (group[0].kind === 'before' ? '距截止还有 24 小时' : group[0].kind === 'snooze' ? '日序 · 稍后提醒' : '任务已到截止时间'),
          body: group.length > 1 ? `${new Set(group.map(r => r.taskId)).size} 件任务需要处理，打开日序查看。` : group[0].title,
          icon: path.join(__dirname, 'assets', 'icon.png') });
        notification.on('click', () => { showWindow(); win.webContents.send('fourfold:review', group[0].taskId); }); notification.show();
      }
    }
    lastCheck = now;
    if (win && !win.isDestroyed()) win.webContents.send('fourfold:tick', now);
  } catch (e) { reportError(e); }
}

function setPanelLocked(locked) {
  if (locked && !unlockRegistered && !tray) throw new Error('没有可用的解锁入口；请先启用托盘或释放 Ctrl/⌘ + Shift + L');
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
    quickWin = new BrowserWindow({ width: 540, height: 190, frame: false, resizable: false, alwaysOnTop: true, skipTaskbar: true, show: false,
      title: '日序 · 随手记', backgroundColor: '#f5f7f4', icon: path.join(__dirname, 'assets', 'icon.png'),
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
  if (!enabled && normalBounds) win.setBounds(clampBounds(normalBounds));
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
    'quick:create': async ({ title }) => { const id = store.create({ title, inbox: true, level: 3 }); broadcast(); quickWin?.hide(); message('已记入收集箱'); return id; },
    create: async input => { const files = input.paths?.length ? inspectPaths(input.paths) : []; const id = store.create(input, files); broadcast(); return id; },
    update: async ({ id, patch }) => { store.update(id, patch); broadcast(); },
    status: async ({ id, action }) => { store.status(id, action); broadcast(); },
    undo: async () => { store.undo(); broadcast(); },
    purge: async ({ id }) => {
      const choice = await dialog.showMessageBox(win, { type: 'warning', title: '永久删除任务', message: '永久删除这件任务？', detail: '任务记录无法恢复。磁盘上的原文件不会被删除。', buttons: ['取消', '永久删除'], defaultId: 0, cancelId: 0 });
      if (choice.response === 1) { store.purge(id); broadcast(); return true; } return false;
    },
    settings: async patch => {
      const valid = validateSettings(patch), oldAutoStart = store.state.settings.autoStart;
      if ('autoStart' in valid && valid.autoStart !== oldAutoStart) setAutoStart(valid.autoStart);
      try { store.saveSettings(valid); } catch (e) { if ('autoStart' in valid) setAutoStart(oldAutoStart); throw e; }
      applySettings(); broadcast();
    },
    'files:select': async () => pickFiles(),
    'files:pick': async ({ taskId }) => { const files = await pickFiles(); if (files.length) { store.attach(taskId, files); broadcast(); } return files.length; },
    'files:drop': async ({ paths, taskId, level }) => {
      const files = inspectPaths(paths);
      const ids = taskId ? (store.attach(taskId, files), [taskId]) : store.createFromFiles(level, files);
      broadcast(); return ids;
    },
    'files:remove': async ({ taskId, fileId }) => { store.removeAttachment(taskId, fileId); broadcast(); },
    'files:relink': async ({ taskId, fileId }) => { const files = await pickFiles(false); if (files.length) { store.relink(taskId, fileId, files[0]); broadcast(); } },
    'files:check': async ({ taskId }) => {
      const task = store.state.tasks.find(t => t.id === taskId); if (!task) return [];
      return await Promise.all(task.files.map(async file => { try { const stat = await fs.promises.stat(file.path); return { id: file.id, available: stat.isFile() }; } catch { return { id: file.id, available: false }; } }));
    },
    'files:open': async ({ taskId, fileId, folder }) => {
      const file = taskFile(taskId, fileId); if (!fs.existsSync(file.path)) throw new Error('文件不可用，请重新定位');
      if (folder) shell.showItemInFolder(file.path);
      else { const error = await shell.openPath(file.path); if (error) throw new Error(`无法打开文件：${error}`); }
    },
    'export:csv': async () => {
      const result = await dialog.showSaveDialog(win, { title: '导出任务表格', defaultPath: 'Rixu-tasks.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] });
      if (result.canceled || !result.filePath) return false;
      atomicWrite(result.filePath, exportCSV(store.state.tasks)); return true;
    },
    'backup:export': async () => {
      const result = await dialog.showSaveDialog(win, { title: '导出备份（不含原文件）', defaultPath: `日序备份-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: '日序备份', extensions: ['json'] }] });
      if (result.canceled || !result.filePath) return false;
      store.export(result.filePath); return true;
    },
    'backup:restore': async () => {
      const result = await dialog.showOpenDialog(win, { title: '选择日序备份', properties: ['openFile'], filters: [{ name: '日序备份', extensions: ['json'] }] });
      if (result.canceled) return false;
      const confirm = await dialog.showMessageBox(win, { type: 'question', message: '用备份替换当前任务数据？', detail: '恢复前会备份当前数据。原始附件文件不包含在备份中。', buttons: ['取消', '恢复备份'], defaultId: 0, cancelId: 0 });
      if (confirm.response !== 1) return false;
      store.restore(result.filePaths[0]); applySettings(); broadcast(); return true;
    },
    'backup:folder': async () => { const error = await shell.openPath(store.backupDirectory); if (error) throw new Error(error); },
    'window:minimize': async () => win.minimize(),
    'window:close': async () => win.close(),
    'window:quit': async () => { quitting = true; app.quit(); },
  };
  for (const [name, handler] of Object.entries(handlers)) ipcMain.handle(`fourfold:${name}`, async (event, payload) => {
    const fromMain = event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && event.senderFrame.url === indexURL;
    const fromQuick = quickWin && !quickWin.isDestroyed() && event.sender === quickWin.webContents && event.senderFrame === quickWin.webContents.mainFrame && event.senderFrame.url === pathToFileURL(path.join(__dirname, 'renderer', 'quick.html')).href;
    if (!fromMain && !(fromQuick && ['quick:create', 'quick:hide'].includes(name))) throw new Error('请求来源无效');
    try { return { ok: true, value: await handler(payload) }; } catch (e) { return { ok: false, error: e.message || '操作失败' }; }
  });
}

async function start() {
  if (!isTest && !app.requestSingleInstanceLock()) { app.quit(); return; }
  app.on('second-instance', () => showWindow());
  await app.whenReady();
  store = new Store(app.getPath('userData'));
  nativeTheme.themeSource = store.state.settings.theme;
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  const [width, height] = sizes[store.state.settings.windowSize];
  const saved = store.state.windowBounds;
  const bounds = saved ? clampBounds({ ...saved, width, height }) : { width, height };
  win = new BrowserWindow({ ...bounds, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    resizable: false, maximizable: false, fullscreenable: false, hasShadow: true,
    title: '日序', icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, webSecurity: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  win.setAlwaysOnTop(store.state.settings.alwaysOnTop);
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null);
  unlockRegistered = globalShortcut.register(unlockShortcut, () => { try { setPanelLocked(!panelLocked); if (!panelLocked) showWindow(); } catch (e) { reportError(e); } });
  createTray(); registerIPC(); registerQuickShortcut(); applySettings();
  win.on('move', () => { clearTimeout(moveTimer); moveTimer = setTimeout(() => { if (!quitting && win && !win.isDestroyed() && !store.state.settings.compactMode) { try { store.saveBounds(win.getBounds()); } catch (e) { reportError(e); } } }, 500); });
  win.on('close', async event => {
    if (quitting || isTest) return;
    if (store.state.settings.closeToTray && tray) {
      event.preventDefault();
      if (!store.state.settings.closeExplained) {
        const result = await dialog.showMessageBox(win, { type: 'info', message: '关闭后，日序会留在后台', detail: '通过系统托盘/菜单栏可重新打开，截止提醒仍会运行。完全退出后停止提醒。', buttons: ['留在后台', '退出应用'], defaultId: 0, cancelId: 0 });
        if (result.response === 1) { quitting = true; app.quit(); return; }
        try { store.saveSettings({ closeExplained: true }); } catch (e) { reportError(e); }
      }
      win.hide();
    } else { quitting = true; app.quit(); }
  });
  screen.on('display-removed', () => win.setBounds(clampBounds(win.getBounds())));
  screen.on('display-metrics-changed', () => win.setBounds(clampBounds(win.getBounds())));
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

if (require.main === module) start().catch(error => { dialog.showErrorBox('日序无法启动', error.message); app.quit(); });
module.exports = { start };
