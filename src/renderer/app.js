'use strict';

(() => {
  const $ = selector => document.querySelector(selector);
  const api = window.fourfold;
  const { tr, html, setLanguage, locale, captureDOM } = window.RixuI18n;
  const translateStatic = captureDOM(document);
  const { effectiveLevel, urgency, remainingHours, remainingLabel, plannedDay, byOrder, todayTasks, weekDays } = window.FourfoldTime;
  let labels = [tr('马上做'), tr('尽快做'), tr('按计划做'), tr('先放着')];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const pad = n => String(n).padStart(2, '0');
  const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const localTime = value => { if (!value) return ''; const d = new Date(value); return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const fullDate = value => value ? new Date(value).toLocaleString(locale(), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : tr('未设置截止时间');
  const taskDay = task => task.due ? dateKey(new Date(task.due)) : '';
  let panelActive = false;
  let state, now = Date.now(), month = new Date(new Date().getFullYear(), new Date().getMonth(), 1), selectedDay = '', draggedId = null;
  let draftChecklist = [];
  let repeatLabels = { daily: tr('每天'), weekdays: tr('工作日'), weekly: tr('每周'), monthly: tr('每月') };
  let editorSession = 0, pendingAttachments = 0;
  let editingId = null, editorInitial = '', draftFiles = [], availability = new Map(), toastTimer, busy = false;

  function toast(text, undo = false) {
    $('#toast').textContent = text;
    $('#undo').hidden = !undo || !state?.canUndo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('#toast').textContent = ''; $('#undo').hidden = true; }, 8000);
  }
  function error(error) { toast(error.message || tr('操作未完成，请重试')); $('#save-status').textContent = tr('操作未完成'); }
  function action(fn) { return event => Promise.resolve().then(() => fn(event)).catch(error); }
  async function call(name, payload) { const result = await api.call(name, payload); $('#save-status').textContent = tr('本地保存'); return result; }
  function closePopovers() { $('#app-menu').hidden = true; $('#opacity-popover').hidden = true; $('#menu-button').setAttribute('aria-expanded', 'false'); $('#opacity-button').setAttribute('aria-expanded', 'false'); }
  function setTransparency(value) { document.documentElement.style.setProperty('--alpha', String((100 - value) / 100)); $('#opacity-label').textContent = `${value}%`; $('#transparency').value = value; $('#transparency-value').textContent = `${value}%`; }
  function setTextTransparency(value) {
    document.documentElement.style.setProperty('--text-alpha', String((100 - value) / 100));
    $('#text-transparency').value = value; $('#text-transparency-value').textContent = `${value}%`;
  }
  function receive(next) {
    const languageChanged = !state || state.settings.language !== next.settings.language;
    state = next; panelActive = !!next.native.panelActive;
    setLanguage(state.settings.language);
    if (languageChanged) {
      translateStatic();
      labels = ['马上做', '尽快做', '按计划做', '先放着'].map(value => tr(value));
      repeatLabels = { daily: tr('每天'), weekdays: tr('工作日'), weekly: tr('每周'), monthly: tr('每月') };
      $('#task-dialog-title').textContent = tr(editingId ? '任务详情' : '新建任务');
      $('#library-title').textContent = tr($('#library-filter').value === 'completed' ? '已完成' : $('#library-filter').value === 'deleted' ? '回收站' : '搜索任务');
      $('#toast').textContent = ''; $('#save-status').textContent = tr('本地保存');
    }
    now = Date.now(); document.documentElement.dataset.theme = state.settings.theme;
    document.body.classList.toggle('desktop-blend', state.settings.desktopBlend);
    document.body.classList.toggle('quiet-controls', state.settings.quietControls);
    $('#blend-toggle').setAttribute('aria-pressed', String(state.settings.desktopBlend));
    setTransparency(state.settings.transparency); setTextTransparency(state.settings.textTransparency);
    $('#calendar').hidden = !state.settings.calendarOpen;
    $('#workspace').classList.toggle('with-calendar', state.settings.calendarOpen);
    $('#calendar-toggle').setAttribute('aria-expanded', String(state.settings.calendarOpen));
    $('#calendar-toggle').setAttribute('aria-label', state.settings.calendarOpen ? tr('收起日历') : tr('显示日历'));
    $('#calendar-toggle').title = $('#calendar-toggle').getAttribute('aria-label');
    document.body.classList.toggle('position-fixed', state.settings.positionFixed);
    $('#position-toggle').setAttribute('aria-pressed', String(state.settings.positionFixed));
    $('#position-toggle').setAttribute('aria-label', state.settings.positionFixed ? tr('解锁位置') : tr('固定位置'));
    $('#position-toggle').title = $('#position-toggle').getAttribute('aria-label');
    $('#app').setAttribute('aria-label', tr('日序'));
    document.body.classList.toggle('edge-docked', state.settings.windowPosition === 'top-right' && state.settings.desktopInset === 0);
    renderBoard(); renderCalendar(); renderPlanner();
    if ($('#library-dialog').open) renderLibrary();
    if ($('#settings-dialog').open) renderSettings();
    if ($('#task-dialog').open) renderAttachments();
    renderUpdateStatus(); tryShowUpdate();
  }
  function renderBoard() {
    if (!state) return;
    const scroll = Array.from(document.querySelectorAll('.task-list'), list => list.scrollTop);
    const active = state.tasks.filter(t => t.status === 'active' && !t.inbox);
    $('#board').innerHTML = labels.map((label, level) => {
      const list = active.filter(t => effectiveLevel(t, now) === level).sort((a, b) => (remainingHours(a, now) - remainingHours(b, now)) || a.createdAt.localeCompare(b.createdAt));
      return html`<section class="zone" data-level="${level}" aria-label="${label}"><div class="zone-heading"><h2>${label}<span class="count">${list.length}</span></h2><button data-add="${level}" aria-label="在${label}添加任务">${icon('plus')}</button></div><div class="task-list">${list.map(taskHTML).join('') || html('<div class="empty-zone">拖入文件或文件夹，或点 ＋ 添加</div>')}</div></section>`;
    }).join('');
    document.querySelectorAll('.task-list').forEach((list, i) => { list.scrollTop = scroll[i] || 0; });
    $('#task-count').textContent = tr`${active.length} 件待办`;
  }
  function taskHTML(t) {
    const auto = t.level === 1 && effectiveLevel(t, now) === 0;
    return html`<article class="task" data-task="${esc(t.id)}" draggable="true" data-priority="${effectiveLevel(t, now)}" data-heat="${urgency(t, now)}" data-selected="${!!selectedDay && taskDay(t) === selectedDay}"><div class="task-top"><input type="checkbox" data-complete="${esc(t.id)}" aria-label="完成：${esc(t.title)}"><button class="task-title" data-edit="${esc(t.id)}">${esc(t.title)}</button></div>${t.due || t.files.length || t.estimatedMinutes || t.repeat !== 'none' || t.checklist.length ? `<div class="task-meta">${t.estimatedMinutes ? html`<span>${t.estimatedMinutes} 分钟</span>` : ''}${t.repeat !== 'none' ? `<span class="repeat-tag">↻ ${repeatLabels[t.repeat]}</span>` : ''}${t.checklist.length ? `<span>☑ ${t.checklist.filter(i => i.done).length}/${t.checklist.length}</span>` : ''}<span class="due" title="${esc(fullDate(t.due))}">${remainingLabel(t, now, state.settings.language)}</span>${auto ? html('<span class="auto-label">自动移入</span>') : ''}${t.files.length ? `<span class="file-tag">${icon('clip')}<span>${esc(t.files[0].name)}${t.files.length > 1 ? ` +${t.files.length - 1}` : ''}</span></span>` : ''}</div>` : ''}<div class="task-tools"><button data-start="${esc(t.id)}" title="设为当前任务">${t.current ? tr('正在做') : tr('开始')}</button>${t.due && remainingHours(t, now) <= 0 ? html`<button data-review="${esc(t.id)}">处理到期</button>` : ''}<button data-today="${esc(t.id)}" title="安排今天做">今天做</button></div></article>`;
  }
  let weekOffset = 0, reviewingId = null;
  function planRow(t, top = false) {
    const today = dateKey(new Date(now));
    return html`<article class="plan-task task" data-task="${esc(t.id)}" draggable="true" data-priority="${effectiveLevel(t, now)}" data-heat="${urgency(t, now)}"><div class="task-top"><input type="checkbox" data-complete="${esc(t.id)}" aria-label="完成：${esc(t.title)}"><button class="task-title" data-edit="${esc(t.id)}">${esc(t.title)}</button>${!t.inbox ? `<button class="focus-star ${top ? 'chosen' : ''}" data-focus="${esc(t.id)}" title="${top ? tr('移出今天最重要的三件事') : tr('加入今天最重要的三件事')}" aria-label="${top ? tr('取消重要') : tr('标为重要')}">${top ? '★' : '☆'}</button>` : ''}</div><div class="task-meta">${t.repeat !== 'none' ? `<span>↻ ${repeatLabels[t.repeat]}</span>` : ''}${t.checklist.length ? `<span>☑ ${t.checklist.filter(i => i.done).length}/${t.checklist.length}</span>` : ''}<span>${t.estimatedMinutes ? tr`${t.estimatedMinutes} 分钟` : tr('未估时')}</span>${t.due ? `<span class="due" title="${esc(fullDate(t.due))}">${remainingLabel(t, now, state.settings.language)}</span>` : ''}${plannedDay(t) && plannedDay(t) < today ? html('<span>之前待办</span>') : ''}${t.files.length ? `<span>${icon('clip')} ${t.files.length}</span>` : ''}</div><div class="task-tools">${t.inbox ? html`<button data-today="${esc(t.id)}">安排今天</button><button data-edit="${esc(t.id)}">选择日期</button>` : `<button data-start="${esc(t.id)}">${t.current ? tr('正在做') : tr('开始')}</button>`}${t.due && remainingHours(t, now) <= 0 ? html`<button data-review="${esc(t.id)}">处理到期</button>` : ''}</div></article>`;
  }
  function renderPlanner() {
    if (!state) return;
    const { view, compactMode } = state.settings, today = dateKey(new Date(now));
    document.body.classList.toggle('compact-mode', compactMode);
    $('#compact-toggle').setAttribute('aria-label', compactMode ? tr('展开完整计划') : tr('缩为小窗'));
    $('#compact-toggle').title = $('#compact-toggle').getAttribute('aria-label');
    $('#compact-panel').hidden = !compactMode;
    $('#board').hidden = view !== 'quadrants'; $('#planner').hidden = view === 'quadrants';
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-current', String(b.dataset.tab === view)));
    const active = state.tasks.filter(t => t.status === 'active');
    const inbox = active.filter(t => t.inbox).sort(byOrder), todays = todayTasks(active, today);
    const top = todays.filter(t => t.focusDay === today), other = todays.filter(t => t.focusDay !== today);
    $('#inbox-count').textContent = inbox.length || '';
    $('#task-count').textContent = tr`${active.length} 件待办`;
    const total = todays.reduce((sum, t) => sum + t.estimatedMinutes, 0);
    if (view === 'today') {
      $('#planner').className = 'planner today-view';
      $('#planner').innerHTML = html`<div class="view-heading"><div><h1>把今天，安排好。</h1><p>${todays.length} 件待办 · 已估时 ${total} 分钟${todays.some(t => !t.estimatedMinutes) ? tr(' · 部分任务未估时') : ''}</p></div><button class="text-button" data-add-today>＋ 安排一件事</button></div><section class="today-focus" data-focus-drop="true"><div class="section-heading"><h2>最重要的三件事</h2><span>${top.length} / 3</span></div><div class="focus-grid">${top.map(t => planRow(t, true)).join('')}${Array.from({ length: 3 - top.length }, (_, i) => html`<div class="focus-placeholder"><span>0${top.length + i + 1}</span><small>点 ☆ 或拖入重要任务</small></div>`).join('')}</div></section><section class="today-others" data-focus-drop="false"><div class="section-heading"><h2>其他待办</h2><span>拖动排序</span></div><div class="today-list">${other.map(t => planRow(t)).join('') || html('<div class="empty-zone">留一点空白给自己。</div>')}</div></section>`;
    } else if (view === 'week') {
      const d = new Date(now); d.setDate(d.getDate() + weekOffset * 7); const days = weekDays(d);
      $('#planner').className = 'planner week-view';
      $('#planner').innerHTML = html`<div class="view-heading"><div><h1>一周的节奏</h1><p>${days[0].slice(5)} — ${days[6].slice(5)} · 每日容量 ${state.settings.dailyCapacity} 分钟</p></div><div><button data-week="-1" aria-label="上一周">${icon('left')}</button><button data-week="0">本周</button><button data-week="1" aria-label="下一周">${icon('right')}</button></div></div><div class="week-board">${days.map((day, i) => {
        const list = active.filter(t => !t.inbox && plannedDay(t) === day).sort(byOrder), minutes = list.reduce((sum, t) => sum + t.estimatedMinutes, 0), unestimated = list.filter(t => !t.estimatedMinutes).length;
        return html`<section class="week-lane" data-schedule="${day}" data-today="${day === today}"><div class="week-title"><span>周${(state.settings.language === 'en' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i] : '一二三四五六日'[i])}</span><strong>${Number(day.slice(-2))}</strong><button data-add-day="${day}" aria-label="安排到 ${day}">＋</button></div><div class="workload ${minutes > state.settings.dailyCapacity ? 'overloaded' : ''}"><span>${minutes} 分钟${minutes > state.settings.dailyCapacity ? tr(' · 偏满') : ''}</span><div class="load-track"><i style="width:${Math.min(100, minutes / state.settings.dailyCapacity * 100)}%"></i></div><small>${unestimated ? tr`${unestimated} 件未估时` : tr`${list.length} 件任务`}</small></div><div class="week-tasks">${list.map(t => planRow(t, t.focusDay === today)).join('') || html('<div class="empty-zone">拖入安排</div>')}</div></section>`;
      }).join('')}</div>`;
    } else if (view === 'inbox') {
      $('#planner').className = 'planner inbox-view';
      $('#planner').innerHTML = html`<div class="view-heading"><div><h1>让想法先落下来。</h1><p>无需选日期。准备好时，再安排进计划。</p></div><button id="capture-inbox">随手记 ＋</button></div><section data-inbox-drop class="inbox-list">${inbox.map(t => planRow(t)).join('') || html('<div class="inbox-empty"><span>收集箱是空的</span><small>Ctrl / ⌘ + Shift + 空格，随时记下一件事</small></div>')}</section>`;
    }
    if (compactMode) {
      const current = active.find(t => t.current);
      const queue = [current, ...top, ...other, ...active.filter(t => !t.inbox).sort((a,b) => effectiveLevel(a, now) - effectiveLevel(b, now) || byOrder(a,b))].filter(Boolean);
      const unique = [...new Map(queue.map(t => [t.id, t])).values()].slice(0,3);
      $('#compact-panel').innerHTML = unique.length ? unique.map((t, i) => html`<div class="compact-task ${i === 0 ? 'current-task' : ''}"><small>${i === 0 ? tr('当前任务') : tr('接下来')}</small><div class="task-top"><input type="checkbox" data-complete="${esc(t.id)}" aria-label="完成：${esc(t.title)}"><button class="task-title" data-expand-edit="${esc(t.id)}">${esc(t.title)}</button><small>${t.estimatedMinutes ? tr`${t.estimatedMinutes} 分` : ''}</small></div></div>`).join('') : html('<div class="empty-zone">今天留一点空白。<br>点 ＋，安排一件事。</div>');
    }
  }
  async function reviewTask(id) {
    const t = state.tasks.find(t => t.id === id); if (!t || t.status !== 'active') return;
    if (!await closeEditor()) return;
    if (state.settings.compactMode) await call('window:compact', { enabled: false });
    reviewingId = id; $('#review-task').textContent = `${t.title} · ${fullDate(t.due)}`;
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(18,0,0,0);
    $('#review-due').value = localTime(tomorrow.toISOString()); $('#review-error').textContent = '';
    if (!$('#review-dialog').open) $('#review-dialog').showModal();
  }
  document.addEventListener('click', action(async e => {
    const tab = e.target.closest('[data-tab]'); if (tab) await call('settings', { view: tab.dataset.tab });
    const star = e.target.closest('[data-focus]'); if (star) { const t = state.tasks.find(t => t.id === star.dataset.focus); await call('plan', { id: t.id, day: dateKey(new Date(now)), focus: t.focusDay !== dateKey(new Date(now)) }); toast(t.focusDay ? tr('已移出今日重点') : tr('已加入今日重点'), true); }
    const today = e.target.closest('[data-today]'); if (today && today.tagName === 'BUTTON' && today.dataset.today !== 'true' && today.dataset.today !== 'false') { await call('plan', { id: today.dataset.today, day: dateKey(new Date(now)) }); toast(tr('已安排今天'), true); }
    const start = e.target.closest('[data-start]'); if (start) { await call('current', { id: start.dataset.start }); toast(tr('已设为当前任务，小窗中可继续查看'), true); }
    const expand = e.target.closest('[data-expand-edit]'); if (expand) { await call('window:compact', { enabled: false }); await openEditor(expand.dataset.expandEdit); }
    const week = e.target.closest('[data-week]'); if (week) { weekOffset = Number(week.dataset.week) === 0 ? 0 : weekOffset + Number(week.dataset.week); renderPlanner(); }
    const add = e.target.closest('[data-add-day]'); if (add) await openEditor(null, { plannedDate: add.dataset.addDay });
    if (e.target.closest('[data-add-today]')) await openEditor(null, { plannedDate: dateKey(new Date(now)) });
    if (e.target.closest('#capture-inbox')) await call('quick:show');
    const review = e.target.closest('[data-review]'); if (review) await reviewTask(review.dataset.review);
    const choice = e.target.closest('[data-review-choice]'); if (choice) {
      try { await call('review', { id: reviewingId, choice: choice.dataset.reviewChoice, due: $('#review-due').value ? new Date($('#review-due').value).toISOString() : null }); $('#review-dialog').close(); toast(choice.dataset.reviewChoice === 'snooze' ? (state.settings.notifications ? tr('30 分钟后提醒，截止时间不变') : tr('已安排稍后提醒；请在设置开启系统通知')) : tr('已处理'), true); }
      catch (e) { $('#review-error').textContent = e.message; }
    }
  }));

  function renderCalendar() {
    if (!state) return;
    const y = month.getFullYear(), m = month.getMonth();
    const offset = (new Date(y, m, 1).getDay() + 6) % 7, total = new Date(y, m + 1, 0).getDate();
    const active = state.tasks.filter(t => t.status === 'active'), counts = new Map();
    for (const t of active) if (t.due) counts.set(taskDay(t), (counts.get(taskDay(t)) || 0) + 1);
    let days = '<span></span>'.repeat(offset);
    for (let d = 1; d <= total; d++) {
      const key = `${y}-${pad(m + 1)}-${pad(d)}`, count = counts.get(key) || 0;
      days += html`<button class="day" data-day="${key}" aria-pressed="${selectedDay === key}" data-today="${key === dateKey(new Date(now))}" aria-label="${key}，${count} 件到期任务">${d}${count ? '<span class="day-dot"></span>' : ''}</button>`;
    }
    const day = selectedDay || dateKey(new Date(now)), list = active.filter(t => taskDay(t) === day).sort((a, b) => a.due.localeCompare(b.due));
    $('#calendar').innerHTML = html`<div class="month-heading"><span>${month.toLocaleDateString(locale(), { year: 'numeric', month: 'long' })}</span><div class="month-navigation"><button data-month="-1" aria-label="上个月">${icon('left')}</button><button id="calendar-today" class="today-button">今天</button><button data-month="1" aria-label="下个月">${icon('right')}</button></div></div><div class="weekdays">${[tr('一'), tr('二'), tr('三'), tr('四'), tr('五'), tr('六'), tr('日')].map(s => `<span>${s}</span>`).join('')}</div><div class="calendar-days">${days}</div><div class="agenda"><div class="agenda-header"><span>${day.slice(5).replace('-', ' / ')} 到期</span><button id="calendar-add" aria-label="在选中日期新建任务">${icon('plus')}</button></div>${list.map(t => `<button class="agenda-item" data-edit="${esc(t.id)}"><small>${localTime(t.due).slice(11)}</small><span>${esc(t.title)}</span></button>`).join('') || html('<div class="agenda-empty">没有到期任务</div>')}</div><p class="calendar-hint">截止日历 · 拖入修改截止日期</p>`;
  }

  function ask(title, detail, options = [{ label: tr('取消'), value: false }, { label: tr('确定'), value: true, primary: true }]) {
    const dialog = $('#confirm-dialog');
    if (dialog.open) return Promise.resolve(false);
    $('#confirm-title').textContent = title; $('#confirm-detail').textContent = detail;
    return new Promise(resolve => {
      $('#confirm-actions').replaceChildren();
      const finish = value => { dialog.oncancel = null; dialog.close(); resolve(value); };
      for (const option of options) { const button = document.createElement('button'); button.textContent = option.label; if (option.primary) button.className = 'primary'; button.onclick = () => finish(option.value); $('#confirm-actions').append(button); }
      dialog.oncancel = event => { event.preventDefault(); finish(false); }; dialog.showModal();
    });
  }
  function editorValue() {
    const previous = state.tasks.find(t => t.id === editingId), localDue = $('#task-due').value;
    const due = localDue === localTime(previous?.due) ? (previous?.due || null) : localDue ? new Date(localDue).toISOString() : null;
    return { repeat: $('#task-repeat').value, checklist: draftChecklist, plannedDate: $('#task-planned').value || null, estimatedMinutes: Number($('#task-estimate').value), inbox: $('#task-inbox').checked, title: $('#task-title').value.trim(), level: Number($('#task-level').value), due, notes: $('#task-notes').value, reminder: $('#task-reminder').checked };
  }
  function editorSignature() { return JSON.stringify({ ...editorValue(), paths: draftFiles.map(f => f.path) }); }
  async function closeEditor() {
    if (!$('#task-dialog').open) return true;
    if (pendingAttachments) return false;
    if (editorSignature() !== editorInitial) {
      const choice = await ask(tr('保存这次编辑？'), tr('还没有保存的修改将会丢失。'), [{ label: tr('继续编辑'), value: false }, { label: tr('放弃修改'), value: 'discard' }, { label: tr('保存'), value: 'save', primary: true }]);
      if (!choice) return false;
      if (choice === 'save') return await saveEditor();
    }
    $('#task-dialog').close(); editingId = null; draftFiles = []; return true;
  }
  async function openEditor(id = null, defaults = {}) {
    closePopovers();
    if (!await closeEditor()) return;
    const t = state.tasks.find(t => t.id === id);
    editorSession++; pendingAttachments = 0; editingId = t?.id || null; draftFiles = []; availability = new Map();
    const source = t || { title: '', notes: '', level: defaults.level ?? 1, due: defaults.due || null, reminder: true, plannedDate: defaults.plannedDate || null, estimatedMinutes: 0, inbox: defaults.inbox || false };
    $('#task-dialog-title').textContent = t ? tr('任务详情') : tr('新建任务');
    $('#task-title').value = source.title; $('#task-level').value = source.level; $('#task-due').value = localTime(source.due); $('#task-notes').value = source.notes; $('#task-reminder').checked = source.reminder;
    $('#task-planned').value = source.plannedDate || ''; $('#task-estimate').value = source.estimatedMinutes || 0; $('#task-inbox').checked = !!source.inbox;
    $('#task-repeat').value = source.repeat || 'none'; draftChecklist = (source.checklist || []).map(item => ({ ...item })); $('#task-checklist').value = draftChecklist.map(item => item.text).join('\n'); renderChecklist();
    $('#delete-task').hidden = !t || t.status === 'deleted'; $('#complete-task').hidden = !t || t.status !== 'active';
    $('#editor-error').hidden = true; $('#save-task').disabled = false;
    updateAutoHint(); editorInitial = editorSignature(); renderAttachments();
    $('#task-dialog').showModal(); $('#task-title').focus();
    if (t) { const checked = await call('files:check', { taskId: id }); if (editingId === id) { availability = new Map(checked.map(f => [f.id, f.available])); renderAttachments(); } }
  }
  function renderChecklist() {
    $('#checklist-progress').textContent = draftChecklist.length ? `${draftChecklist.filter(i => i.done).length}/${draftChecklist.length}` : '';
    $('#checklist-items').innerHTML = draftChecklist.map((item, i) => `<label class="check-field"><input type="checkbox" data-check-item="${i}" ${item.done ? 'checked' : ''}><span>${esc(item.text)}</span></label>`).join('');
  }
  $('#task-checklist').oninput = () => {
    const old = [...draftChecklist];
    draftChecklist = $('#task-checklist').value.split('\n').map(s => s.trim()).filter(Boolean).map(text => {
      const index = old.findIndex(item => item.text === text);
      return index >= 0 ? old.splice(index, 1)[0] : { id: crypto.randomUUID(), text, done: false };
    }); renderChecklist();
  };
  $('#checklist-items').onchange = e => { if (e.target.dataset.checkItem !== undefined) { draftChecklist[Number(e.target.dataset.checkItem)].done = e.target.checked; renderChecklist(); } };
  function updateAutoHint() {
    const t = { status: 'active', level: Number($('#task-level').value), due: $('#task-due').value || null };
    $('#auto-hint').hidden = !(t.level === 1 && effectiveLevel(t, now) === 0);
  }
  async function saveEditor() {
    if (busy || pendingAttachments) return false;
    const form = $('#task-form'); if (!form.reportValidity()) return false;
    const value = editorValue(), previous = state.tasks.find(t => t.id === editingId);
    if (!value.title) { $('#task-title').setCustomValidity(tr('请填写任务名称')); $('#task-title').reportValidity(); return false; }
    if (value.due && Date.parse(value.due) < Date.now() && value.due !== previous?.due) {
      if (!await ask(tr('这个截止时间已经过去'), tr('保存后，任务会显示为已逾期。仍然保存吗？'))) return false;
    }
    busy = true; $('#save-task').disabled = true;
    try {
      if (editingId) await call('update', { id: editingId, patch: value });
      else await call('create', { ...value, paths: draftFiles.map(f => f.path) });
      $('#task-dialog').close(); editingId = null; draftFiles = [];
      toast(value.level === 1 && effectiveLevel({ ...value, status: 'active' }, Date.now()) === 0 ? tr('已保存，距截止不超过 48 小时，显示在「马上做」') : tr('已保存'), true);
      return true;
    } catch (e) { $('#editor-error').textContent = e.message; $('#editor-error').hidden = false; return false; }
    finally { busy = false; $('#save-task').disabled = false; }
  }
  function renderAttachments() {
    const files = editingId ? (state.tasks.find(t => t.id === editingId)?.files || []) : draftFiles;
    $('#attachment-count').textContent = files.length ? String(files.length) : '';
    $('#attachments').innerHTML = files.length ? files.map((file, index) => {
      const missing = availability.get(file.id) === false;
      return html`<div class="attachment ${missing ? 'missing' : ''}"><button type="button" class="attachment-name" data-file-open="${esc(file.id || '')}" title="${esc(file.path)}" ${!editingId ? 'disabled' : ''}>${icon(file.kind === 'directory' ? 'folder' : 'file')}<span>${esc(file.name)}${missing ? tr(' · 文件不可用') : ''}</span></button><div class="attachment-actions">${editingId ? html`<button type="button" data-relink="${esc(file.id)}" aria-label="重新定位 ${esc(file.name)}">重定位</button><button type="button" data-folder="${esc(file.id)}" aria-label="打开 ${esc(file.name)} 所在文件夹">${icon('folder')}</button>` : ''}<button type="button" data-file-remove="${esc(file.id || index)}" aria-label="移除 ${esc(file.name)} 的关联">${icon('close')}</button></div></div>`;
    }).join('') : html('<div class="empty-attachments">添加文件或文件夹后，可以在这里直接打开。</div>');
  }
  function openLibrary(filter = 'all') {
    closePopovers(); $('#library-filter').value = filter; $('#search-input').value = '';
    $('#library-title').textContent = filter === 'completed' ? tr('已完成') : filter === 'deleted' ? tr('回收站') : tr('搜索任务');
    renderLibrary(); $('#library-dialog').showModal(); $('#search-input').focus();
  }
  function renderLibrary() {
    const filter = $('#library-filter').value, query = $('#search-input').value.trim().toLocaleLowerCase();
    const tasks = state.tasks.filter(t => (filter === 'all' ? t.status !== 'deleted' : t.status === filter) && (!query || [t.title, t.notes, ...t.files.map(f => f.name)].some(s => s.toLocaleLowerCase().includes(query)))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    $('#library-list').innerHTML = tasks.length ? tasks.map(t => `<div class="library-item"><button class="library-title" data-edit="${esc(t.id)}"><span>${esc(t.title)}</span><small>${t.status === 'active' ? labels[effectiveLevel(t, now)] + ' · ' + fullDate(t.due) : t.status === 'completed' ? tr('完成于 ') + fullDate(t.completedAt) : t.status === 'cancelled' ? tr('已取消 · 可恢复') : tr('删除于 ') + fullDate(t.deletedAt)}</small></button><div class="library-actions">${['completed', 'cancelled'].includes(t.status) ? html`<button data-status="reopen" data-id="${esc(t.id)}">恢复待办</button>` : ''}${t.status === 'deleted' ? html`<button data-status="restore" data-id="${esc(t.id)}">恢复</button><button class="danger-text" data-purge="${esc(t.id)}">永久删除</button>` : html`<button class="danger-text" data-status="delete" data-id="${esc(t.id)}" aria-label="删除 ${esc(t.title)}">${icon('trash')}</button>`}</div></div>`).join('') : html('<div class="library-empty">这里还没有任务</div>');
  }
  function renderSettings() {
    document.querySelectorAll('[data-setting]').forEach(input => { const value = state.settings[input.dataset.setting]; if (input.type === 'checkbox') input.checked = value; else input.value = value; });
    $('#quick-hint').textContent = !state.settings.quickCapture ? tr('已关闭') : state.native.quickShortcutRegistered ? tr('输入后回车保存到收集箱') : tr('快捷键被占用或系统不支持，请换一组或用托盘随手记');
    $('[data-setting="autoStart"]').disabled = !state.native.autoStartSupported;
    $('#autostart-hint').textContent = state.native.autoStartSupported ? '' : tr('打包后的桌面版可用');
    $('[data-setting="notifications"]').disabled = !state.native.notificationsSupported;
    document.querySelector('.about').textContent = tr`日序 ${state.native.version || '1.0.1'} · 本地优先`;
    renderUpdateStatus();
    $('#notification-hint').textContent = state.native.notificationsSupported ? tr('完全退出应用后不再提醒') : tr('当前系统无法发送原生通知');
  }
  function renderUpdateStatus() {
    const update = state?.updates;
    if (!update) return;
    $('#check-updates').disabled = update.status === 'checking';
    $('#settings-download-update').hidden = update.status !== 'available';
    $('#update-status').textContent = update.status === 'checking' ? tr('正在连接 GitHub…') : update.status === 'available' ? tr`发现新版本 ${update.release.version}` : update.status === 'current' ? tr('当前已是最新正式版') : update.status === 'error' ? tr(update.error) : tr('仅检查日序的 GitHub 正式版本');
    if ($('#update-dialog').open && update.release) $('#update-versions').textContent = tr`当前 ${state.native.version} → 新版 ${update.release.version}`;
  }
  function tryShowUpdate(manual = false) {
    const update = state?.updates;
    if (update?.status !== 'available' || $('#update-dialog').open) return;
    if (!manual && (!state.settings.autoUpdates || update.notifiedVersion === update.release.version || !panelActive || movingPointer !== null || document.querySelector('dialog[open]'))) return;
    $('#update-versions').textContent = tr`当前 ${state.native.version} → 新版 ${update.release.version}`;
    state = { ...state, updates: { ...update, notifiedVersion: update.release.version } };
    $('#update-dialog').showModal();
    call('updates:acknowledge', { version: update.release.version }).catch(error);
  }
  $('#check-updates').onclick = action(async () => { const updates = await call('updates:check'); state = { ...state, updates }; renderUpdateStatus(); tryShowUpdate(true); });
  $('#download-update').onclick = $('#settings-download-update').onclick = action(() => call('updates:open'));
  $('#dismiss-update').onclick = () => $('#update-dialog').close();
  document.addEventListener('close', () => tryShowUpdate(), true);

  async function reschedule(id, targetDay) {
    const t = state.tasks.find(t => t.id === id); if (!t) return;
    const target = t.due ? new Date(t.due) : new Date(`${targetDay}T18:00`);
    const [year, monthNumber, date] = targetDay.split('-').map(Number);
    target.setFullYear(year, monthNumber - 1, date);
    const label = localTime(target.toISOString()).replace('T', ' ');
    if (target.getTime() < Date.now() && !await ask(tr('改到过去的日期？'), tr`截止时间将改为 ${label}，任务会标记为逾期。`)) return;
    await call('update', { id, patch: { due: target.toISOString() } }); selectedDay = targetDay; renderBoard(); renderCalendar(); toast(tr`已改为 ${label}`, true);
  }

  $('#new-task').onclick = action(async () => { if (state.settings.compactMode) await call('window:compact', { enabled: false }); return openEditor(null, state.settings.view === 'inbox' ? { inbox: true, level: 3 } : state.settings.view === 'today' ? { plannedDate: dateKey(new Date(now)) } : {}); });
  $('#calendar-toggle').onclick = action(async () => { closePopovers(); if (state.settings.calendarOpen) selectedDay = ''; await call('settings', { calendarOpen: !state.settings.calendarOpen }); });
  $('#search-button').onclick = () => openLibrary();
  $('#menu-button').onclick = event => { event.stopPropagation(); const show = $('#app-menu').hidden; closePopovers(); $('#app-menu').hidden = !show; event.currentTarget.setAttribute('aria-expanded', String(show)); };
  $('#opacity-button').onclick = event => { event.stopPropagation(); const show = $('#opacity-popover').hidden; closePopovers(); $('#opacity-popover').hidden = !show; event.currentTarget.setAttribute('aria-expanded', String(show)); };
  $('#transparency').oninput = event => setTransparency(Number(event.target.value));
  $('#transparency').onchange = action(async event => { try { await call('settings', { transparency: Number(event.target.value) }); } catch (e) { setTransparency(state.settings.transparency); throw e; } });
  $('#opacity-default').onclick = action(() => call('settings', { transparency: 35, textTransparency: 0 }));
  $('#text-transparency').oninput = e => setTextTransparency(Number(e.target.value));
  $('#text-transparency').onchange = action(e => call('settings', { textTransparency: Number(e.target.value) }));
  $('#compact-toggle').onclick = action(async () => { if (await closeEditor()) await call('window:compact', { enabled: !state.settings.compactMode }); });
  $('#blend-toggle').onclick = action(() => call('settings', { desktopBlend: !state.settings.desktopBlend, ...(state.settings.desktopBlend ? {} : { transparency: Math.max(state.settings.transparency, 65) }) }));
  $('#export-csv').onclick = action(async () => { if (await call('export:csv')) toast(tr('已导出 CSV 表格')); });
  $('#quick-open').onclick = action(() => call('quick:show'));
  $('#task-planned').oninput = () => { if ($('#task-planned').value) $('#task-inbox').checked = false; };
  $('#task-inbox').onchange = () => { if ($('#task-inbox').checked) $('#task-planned').value = ''; };
  $('#position-toggle').onclick = action(() => call('settings', { positionFixed: !state.settings.positionFixed, windowPosition: 'manual' }));
  $('#dock-right').onclick = action(() => call('settings', { windowPosition: 'top-right', positionFixed: true, desktopInset: 0 }));
  $('#settings-button').onclick = () => { closePopovers(); renderSettings(); $('#settings-dialog').showModal(); };
  $('#undo').onclick = action(async () => { await call('undo'); toast(tr('已撤销')); });
  $('#export-backup').onclick = action(async () => { if (await call('backup:export')) toast(tr('备份已导出，不包含原文件')); });
  $('#restore-backup').onclick = action(async () => { if (await call('backup:restore')) { selectedDay = ''; renderBoard(); renderCalendar(); toast(tr('已从备份恢复')); } });
  $('#backup-folder').onclick = action(() => call('backup:folder'));
  $('#task-title').oninput = () => $('#task-title').setCustomValidity('');
  $('#task-level').onchange = updateAutoHint; $('#task-due').oninput = updateAutoHint;
  $('#task-form').onsubmit = event => { event.preventDefault(); saveEditor().catch(error); };
  $('#editor-close').onclick = action(closeEditor);
  $('#task-dialog').oncancel = event => { event.preventDefault(); closeEditor().catch(error); };
  $('#delete-task').onclick = action(async () => { await call('status', { id: editingId, action: 'delete' }); $('#task-dialog').close(); editingId = null; toast(tr('已移到回收站，原文件保持不变'), true); });
  $('#complete-task').onclick = action(async () => { const id = editingId; if (editorSignature() !== editorInitial && !await saveEditor()) return; await call('status', { id, action: 'complete' }); $('#task-dialog').close(); editingId = null; toast(tr('已完成'), true); });
  const attachSelection = directory => action(async () => {
    if (editingId) { await call('files:pick', { taskId: editingId, directory }); }
    else { const files = await call('files:select', { directory }); const known = new Set(draftFiles.map(f => f.path)); draftFiles.push(...files.filter(f => !known.has(f.path))); renderAttachments(); }
  });
  $('#attach-files').onclick = attachSelection(false);
  $('#attach-folder').onclick = attachSelection(true);
  $('#search-input').oninput = renderLibrary; $('#library-filter').onchange = renderLibrary;
  $('#settings-dialog').onchange = action(async event => { const input = event.target.closest('[data-setting]'); if (!input) return; try { await call('settings', { [input.dataset.setting]: input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value }); } catch (e) { renderSettings(); throw e; } });

  document.addEventListener('click', action(async event => {
    if (!event.target.closest('.popover,#menu-button,#opacity-button')) closePopovers();
    const close = event.target.closest('[data-close]'); if (close) document.getElementById(close.dataset.close).close();
    const view = event.target.closest('[data-view]'); if (view) openLibrary(view.dataset.view);
    const add = event.target.closest('[data-add]'); if (add) await openEditor(null, { level: Number(add.dataset.add) });
    const edit = event.target.closest('[data-edit]'); if (edit) await openEditor(edit.dataset.edit);
    const date = event.target.closest('[data-day]'); if (date) { selectedDay = selectedDay === date.dataset.day ? '' : date.dataset.day; renderBoard(); renderCalendar(); }
    const nav = event.target.closest('[data-month]'); if (nav) { month = new Date(month.getFullYear(), month.getMonth() + Number(nav.dataset.month), 1); renderCalendar(); }
    if (event.target.closest('#calendar-today')) { const today = new Date(now); month = new Date(today.getFullYear(), today.getMonth(), 1); selectedDay = dateKey(today); renderBoard(); renderCalendar(); }
    if (event.target.closest('#calendar-add')) await openEditor(null, { level: 1, due: `${selectedDay || dateKey(new Date(now))}T18:00` });
    const status = event.target.closest('[data-status]'); if (status) { await call('status', { id: status.dataset.id, action: status.dataset.status }); toast(status.dataset.status === 'delete' ? tr('已移到回收站') : tr('任务已恢复'), true); }
    const purge = event.target.closest('[data-purge]'); if (purge && await call('purge', { id: purge.dataset.purge })) toast(tr('已永久删除任务记录'));
    const fileOpen = event.target.closest('[data-file-open]'); if (fileOpen && editingId) { try { await call('files:open', { taskId: editingId, fileId: fileOpen.dataset.fileOpen }); } catch (e) { availability.set(fileOpen.dataset.fileOpen, false); renderAttachments(); throw e; } }
    const folder = event.target.closest('[data-folder]'); if (folder) await call('files:open', { taskId: editingId, fileId: folder.dataset.folder, folder: true });
    const relink = event.target.closest('[data-relink]'); if (relink) { await call('files:relink', { taskId: editingId, fileId: relink.dataset.relink }); availability.delete(relink.dataset.relink); renderAttachments(); }
    const remove = event.target.closest('[data-file-remove]'); if (remove) { if (editingId) await call('files:remove', { taskId: editingId, fileId: remove.dataset.fileRemove }); else { draftFiles.splice(Number(remove.dataset.fileRemove), 1); renderAttachments(); } }
  }));
  document.addEventListener('change', action(async event => { if (!event.target.matches('[data-complete]')) return; const input = event.target; try { await call('status', { id: input.dataset.complete, action: 'complete' }); toast(tr('已完成'), true); } catch (e) { input.checked = false; throw e; } }));
  document.addEventListener('dragstart', event => { const task = event.target.closest('[data-task]'); if (!task) return; draggedId = task.dataset.task; event.dataTransfer.setData('text/plain', draggedId); event.dataTransfer.effectAllowed = 'move'; });
  const clearDrag = () => document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
  document.addEventListener('dragover', event => {
    event.preventDefault(); const isFile = Array.from(event.dataTransfer.types).includes('Files');
    const attachmentTarget = event.target.closest('#attachment-drop');
    if (attachmentTarget && $('#task-dialog').open) {
      clearDrag(); event.dataTransfer.dropEffect = isFile ? 'copy' : 'none';
      if (isFile) attachmentTarget.classList.add('drop-target');
      return;
    }
    const target = event.target.closest('[data-schedule],[data-focus-drop],[data-inbox-drop],[data-day],[data-task],[data-level]'); clearDrag();
    if (!target || (!draggedId && !isFile) || (isFile && target.hasAttribute('data-day'))) { event.dataTransfer.dropEffect = 'none'; return; }
    target.classList.add('drop-target'); event.dataTransfer.dropEffect = isFile ? 'copy' : 'move';
  });
  document.addEventListener('dragleave', event => { if (!event.relatedTarget) clearDrag(); });
  document.addEventListener('dragend', () => { draggedId = null; clearDrag(); });
  const handleDrop = async (event, files) => {
    clearDrag(); const id = draggedId; draggedId = null;
    if (event.target.closest('#attachment-drop') && $('#task-dialog').open && files.length) {
      const session = editorSession, taskId = editingId;
      $('#editor-error').hidden = true;
      pendingAttachments++; $('#save-task').disabled = true;
      try {
        if (taskId) await api.dropFiles(files, { taskId });
        else {
          const inspected = await api.inspectDroppedFiles(files);
          if (session !== editorSession || !$('#task-dialog').open) return;
          const key = path => state.native.platform === 'win32' ? path.toLowerCase() : path;
          const known = new Set(draftFiles.map(file => key(file.path)));
          for (const file of inspected) if (!known.has(key(file.path))) { draftFiles.push(file); known.add(key(file.path)); }
        }
        if (session === editorSession && $('#task-dialog').open) renderAttachments();
      } catch (e) {
        if (session === editorSession && $('#task-dialog').open) { $('#editor-error').textContent = e.message; $('#editor-error').hidden = false; }
        else error(e);
      } finally {
        if (session === editorSession) { pendingAttachments--; $('#save-task').disabled = busy || pendingAttachments > 0; }
      }
      return;
    }
    const zone = event.target.closest('[data-level]'), date = event.target.closest('[data-day]');
    const schedule = event.target.closest('[data-schedule]'), focus = event.target.closest('[data-focus-drop]'), inbox = event.target.closest('[data-inbox-drop]');
    const onTask = event.target.closest('[data-task]');
    if (files.length && onTask && !zone) { await api.dropFiles(files, { taskId: onTask.dataset.task }); toast(tr('已关联文件'), true); return; }
    if (id && (schedule || focus)) {
      await call('plan', { id, day: schedule?.dataset.schedule || dateKey(new Date(now)), ...(focus ? { focus: focus.dataset.focusDrop === 'true' } : {}), beforeId: onTask?.dataset.task === id ? undefined : onTask?.dataset.task }); toast(tr('已调整安排，截止时间保持不变'), true); return;
    }
    if (id && inbox) { await call('update', { id, patch: { inbox: true } }); toast(tr('已放回收集箱'), true); return; }
    if (files.length && zone) {
      const task = event.target.closest('[data-task]');
      await api.dropFiles(files, { taskId: task?.dataset.task, level: Number(zone.dataset.level) }); toast(task ? tr('已关联文件') : tr('已从文件创建任务'), true); return;
    }
    if (id && date) await reschedule(id, date.dataset.day);
    else if (id && zone) {
      const level = Number(zone.dataset.level); await call('update', { id, patch: { level, inbox: false } });
      const task = state.tasks.find(t => t.id === id); toast(task && level === 1 && effectiveLevel(task, Date.now()) === 0 ? tr('距截止不超过 48 小时，仍显示在「马上做」') : tr`已移到「${labels[level]}」`, true);
    }
  };
  document.addEventListener('drop', event => {
    event.preventDefault();
    // FileList is only readable during the native drop event. Capture it before any async work.
    handleDrop(event, Array.from(event.dataTransfer.files)).catch(error);
  });
  // Pointer capture keeps movement independent of OS title-bar hit testing.
  // It leaves buttons, task dragging, editable fields and native file drops alone.
  let movingPointer = null, moveFrame = 0;
  document.addEventListener('pointerdown', event => {
    if (event.button !== 0 || state?.settings.positionFixed || document.querySelector('dialog[open]')) return;
    if (event.target.closest('button,input,textarea,select,a,label,[data-task],.compact-task,.popover,dialog')) return;
    if (!event.target.closest('.tool-rail,.zone,.workspace,#compact-panel,.statusbar')) return;
    event.preventDefault(); movingPointer = event.pointerId;
    $('#app').setPointerCapture(event.pointerId); document.body.classList.add('window-moving');
    call('window:move', { phase: 'start' }).catch(error);
  });
  document.addEventListener('pointermove', event => {
    if (event.pointerId !== movingPointer || moveFrame) return;
    moveFrame = requestAnimationFrame(() => { moveFrame = 0; call('window:move', { phase: 'move' }).catch(error); });
  });
  function endWindowMove(event) {
    if (movingPointer === null || event?.pointerId !== undefined && event.pointerId !== movingPointer) return;
    cancelAnimationFrame(moveFrame); moveFrame = 0;
    if ($('#app').hasPointerCapture(movingPointer)) $('#app').releasePointerCapture(movingPointer);
    movingPointer = null; document.body.classList.remove('window-moving'); call('window:move', { phase: 'end' }).catch(error); tryShowUpdate();
  }
  document.addEventListener('pointerup', endWindowMove);
  document.addEventListener('pointercancel', endWindowMove);
  window.addEventListener('blur', () => endWindowMove());
  document.addEventListener('pointerdown', () => document.body.classList.remove('keyboard-navigation'));
  document.addEventListener('keydown', action(async event => {
    if (event.key === 'Tab') document.body.classList.add('keyboard-navigation');
    if (event.key === 'Escape') closePopovers();
    const command = event.ctrlKey || event.metaKey;
    if (!command) return;
    if (event.key.toLowerCase() === 'n' && !document.querySelector('dialog[open]')) { event.preventDefault(); await openEditor(); }
    if (event.key.toLowerCase() === 'f' && !document.querySelector('dialog[open]')) { event.preventDefault(); openLibrary(); }
    if (event.key.toLowerCase() === 'z' && !document.querySelector('dialog[open]') && state.canUndo) { event.preventDefault(); await call('undo'); toast(tr('已撤销')); }
  }));

  if (!api) { $('#task-count').textContent = tr('请通过桌面应用启动日序'); return; }
  api.onActive(active => { panelActive = active; tryShowUpdate(); });
  api.onCommand(command => { if (command === 'settings') $('#settings-button').click(); if (command === 'compact') $('#compact-toggle').click(); });
  api.onState(receive);
  api.onMessage(text => toast(text));
  api.onTick(value => { now = value; renderBoard(); renderCalendar(); renderPlanner(); });
  api.onReview(id => reviewTask(id).catch(error));
  api.onLocate(id => openEditor(id).catch(error));
  call('state').then(data => { receive(data); if (data.recoveryNotice) toast(data.recoveryNotice); else {
    const overdue = data.tasks.filter(t => t.status === 'active' && t.due && Date.parse(t.due) < Date.now()).length;
    if (overdue) toast(tr`${overdue} 件任务已逾期，打开任务可调整日期`);
  } }).catch(error);
})();
