const DEFAULT_CONFIG = window.WORKTRACK_CONFIG || {};
const CONFIG_FILES = {
  apiUrl: './apps-script-url.txt',
  sheetUrl: './sheet-url.txt',
};
const STATUS_OPTIONS = ['Planned', 'In Progress', 'Blocked', 'Done'];
const VIEW_LABELS = {
  'dashboard-view': { kicker: 'Dashboard', title: 'Overview' },
  'tasks-view': { kicker: 'Tasks', title: 'Task entry and review' },
  'reports-view': { kicker: 'Reports', title: 'Analytics' },
  'history-view': { kicker: 'History', title: 'Audit trail' },
  'settings-view': { kicker: 'Settings', title: 'Sheet connection' },
};

const state = {
  config: { ...DEFAULT_CONFIG },
  apiUrl: '',
  sheetUrl: '',
  view: 'dashboard-view',
  analyticsRange: 'weekly',
  reportRange: 'weekly',
  tasks: [],
  history: [],
  summary: null,
  editingId: null,
};

const nodes = {
  connectionPill: document.getElementById('connection-pill'),
  syncButton: document.getElementById('sync-button'),
  openSheetButton: document.getElementById('open-sheet-button'),
  mobileMenuButton: document.getElementById('mobile-menu-button'),
  closeMenuButton: document.getElementById('close-menu-button'),
  railScrim: document.getElementById('rail-scrim'),
  pageKicker: document.getElementById('page-kicker'),
  pageTitle: document.getElementById('page-title'),
  taskForm: document.getElementById('task-form'),
  taskId: document.getElementById('task-id'),
  taskDate: document.getElementById('task-date'),
  taskTitle: document.getElementById('task-title'),
  taskDetails: document.getElementById('task-details'),
  taskStatus: document.getElementById('task-status'),
  taskComments: document.getElementById('task-comments'),
  resetButton: document.getElementById('reset-button'),
  saveButton: document.getElementById('save-button'),
  searchInput: document.getElementById('search-input'),
  filterDate: document.getElementById('filter-date'),
  filterStatus: document.getElementById('filter-status'),
  taskList: document.getElementById('task-list'),
  dashboardRecentList: document.getElementById('dashboard-recent-list'),
  analyticsChart: document.getElementById('analytics-chart'),
  reportChart: document.getElementById('report-chart'),
  analyticsRangeLabel: document.getElementById('analytics-range-label'),
  reportSummaryShort: document.getElementById('report-summary-short'),
  reportSummary: document.getElementById('report-summary'),
  historyList: document.getElementById('history-list'),
  openSheetLink: document.getElementById('open-sheet-link'),
  kpiTotal: document.getElementById('kpi-total'),
  kpiDelta: document.getElementById('kpi-delta'),
  kpiCompleted: document.getElementById('kpi-completed'),
  kpiFlagged: document.getElementById('kpi-flagged'),
  reportCompleted: document.getElementById('report-completed'),
  reportProgress: document.getElementById('report-progress'),
  reportBlocked: document.getElementById('report-blocked'),
  reportPlanned: document.getElementById('report-planned'),
  toast: document.getElementById('toast'),
};

function uid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `task_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function escapeText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function toDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value, options = {}) {
  const date = toDate(value);
  if (!date) return '-';
  return date.toLocaleDateString(undefined, options);
}

function formatDateShort(value) {
  return formatDate(value, { month: 'short', day: 'numeric' });
}

function formatTime(value) {
  const date = toDate(value);
  if (!date) return '-';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatRelativeWeekLabel(offset = 0) {
  const today = new Date();
  const day = today.getDay() || 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - day + 1 + offset * 7);
  return monday;
}

async function loadTextFile(path) {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) return '';
    return (await res.text()).trim();
  } catch (error) {
    return '';
  }
}

async function loadRuntimeConfig() {
  const [fileApiUrl, fileSheetUrl] = await Promise.all([
    loadTextFile(CONFIG_FILES.apiUrl),
    loadTextFile(CONFIG_FILES.sheetUrl),
  ]);

  state.apiUrl = fileApiUrl || String(state.config.apiUrl || '').trim();
  state.sheetUrl = fileSheetUrl || String(state.config.sheetUrl || '').trim();
}

function getApiUrl() {
  return String(state.apiUrl || '').trim();
}

function getSheetUrl() {
  return String(state.sheetUrl || '').trim();
}

function setToast(message, timeout = 2400) {
  nodes.toast.textContent = message;
  nodes.toast.hidden = false;
  window.clearTimeout(setToast.timer);
  setToast.timer = window.setTimeout(() => {
    nodes.toast.hidden = true;
  }, timeout);
}

function setConnectionLabel(text) {
  nodes.connectionPill.textContent = text;
}

function normalizeTask(task) {
  return {
    id: task.id || uid(),
    date: String(task.date || todayISO()),
    task: String(task.task || '').trim(),
    details: String(task.details || '').trim(),
    status: STATUS_OPTIONS.includes(task.status) ? task.status : 'Planned',
    comments: String(task.comments || '').trim(),
    createdAt: task.createdAt || task.updatedAt || new Date().toISOString(),
    updatedAt: task.updatedAt || task.createdAt || new Date().toISOString(),
  };
}

function normalizeHistory(entry) {
  return {
    id: entry.id || uid(),
    timestamp: entry.timestamp || new Date().toISOString(),
    action: entry.action || 'updated',
    taskId: entry.taskId || '',
    task: entry.task || '',
    status: entry.status || '',
    details: entry.details || '',
    actor: entry.actor || 'Web app',
  };
}

function statusClass(status) {
  if (status === 'Done') return 'status-done';
  if (status === 'Blocked') return 'status-blocked';
  if (status === 'In Progress') return 'status-progress';
  return 'status-planned';
}

function requestEndpoint(action, method = 'GET', payload = null) {
  const apiUrl = getApiUrl();
  if (!apiUrl) {
    throw new Error('Apps Script URL not configured.');
  }

  if (method === 'GET') {
    const url = new URL(apiUrl);
    url.searchParams.set('action', action);
    return fetch(url.toString(), { cache: 'no-store' });
  }

  return fetch(apiUrl, {
    method,
    cache: 'no-store',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ action, ...payload }),
  });
}

async function fetchBootstrap() {
  const res = await requestEndpoint('bootstrap');
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Failed to load data (${res.status})`);
  }
  return data;
}

async function saveRemoteTask(task) {
  const res = await requestEndpoint('save', 'POST', task);
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Failed to save task (${res.status})`);
  }
  return {
    task: normalizeTask(data.task || task),
    history: Array.isArray(data.history) ? data.history.map(normalizeHistory) : [],
  };
}

async function deleteRemoteTask(id) {
  const res = await requestEndpoint('delete', 'POST', { id });
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Failed to delete task (${res.status})`);
  }
  return Array.isArray(data.history) ? data.history.map(normalizeHistory) : [];
}

function buildSummary(tasks) {
  const now = new Date();
  const weekStart = new Date(now);
  const weekday = weekStart.getDay() || 7;
  weekStart.setDate(weekStart.getDate() - weekday + 1);
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(weekStart);
  const weekTasks = tasks.filter((task) => {
    const date = toDate(task.date);
    return date && date >= weekStart && date <= now;
  });
  const previousWeekTasks = tasks.filter((task) => {
    const date = toDate(task.date);
    return date && date >= lastWeekStart && date < lastWeekEnd;
  });
  const blocked = tasks.filter((task) => task.status === 'Blocked').length;
  const completed = tasks.filter((task) => task.status === 'Done').length;
  const inProgress = tasks.filter((task) => task.status === 'In Progress').length;
  const planned = tasks.filter((task) => task.status === 'Planned').length;
  const deltaBase = previousWeekTasks.length || 1;
  const delta = Math.round(((weekTasks.length - previousWeekTasks.length) / deltaBase) * 100);
  return {
    totals: {
      total: tasks.length,
      weekly_total: weekTasks.length,
      completed,
      blocked,
      in_progress: inProgress,
      planned,
      delta,
    },
    by_status: { completed, blocked, in_progress: inProgress, planned },
  };
}

function chartSeries(tasks, range) {
  if (range === 'monthly') {
    const currentYear = new Date().getFullYear();
    const months = Array.from({ length: 12 }, (_, index) => ({
      label: new Date(currentYear, index, 1).toLocaleDateString(undefined, { month: 'short' }),
      value: 0,
    }));
    tasks.forEach((task) => {
      const date = toDate(task.date);
      if (!date) return;
      months[date.getMonth()].value += 1;
    });
    return months;
  }

  if (range === 'weekly') {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const weeks = [];
    for (let i = 0; i < 5; i += 1) {
      const start = new Date(monthStart);
      start.setDate(1 + i * 7);
      if (start >= monthEnd) break;
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      weeks.push({
        label: `W${i + 1}`,
        value: tasks.filter((task) => {
          const date = toDate(task.date);
          return date && date >= start && date <= end;
        }).length,
      });
    }
    return weeks;
  }

  const monday = formatRelativeWeekLabel(0);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const iso = date.toISOString().slice(0, 10);
    return {
      label: date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3).toUpperCase(),
      value: tasks.filter((task) => task.date === iso).length,
    };
  });
  return days;
}

function renderChart(container, series) {
  if (!container) return;
  const max = Math.max(1, ...series.map((item) => item.value));
  container.style.gridTemplateColumns = `repeat(${series.length}, minmax(0, 1fr))`;
  container.innerHTML = series
    .map((item) => {
      const height = Math.max(18, Math.round((item.value / max) * 100));
      return `
        <div class="bar">
          <div class="bar-track">
            <div class="bar-fill" style="height:${height}%"></div>
          </div>
          <div class="bar-label">${escapeText(item.label)}</div>
        </div>
      `;
    })
    .join('');
}

function renderTaskCard(task, includeActions = true) {
  return `
    <article class="task-row ${statusClass(task.status)}" data-status="${escapeText(task.status)}" data-task-id="${escapeText(task.id)}">
      <div class="task-top">
        <div>
          <h4 class="task-title">${escapeText(task.task)}</h4>
          <div class="task-meta">
            <span>${escapeText(formatDateShort(task.date))}</span>
            <span>${escapeText(formatTime(task.updatedAt))}</span>
          </div>
        </div>
        <span class="status-pill ${statusClass(task.status)}">${escapeText(task.status)}</span>
      </div>
      <p class="muted">${escapeText(task.details || 'No details added')}</p>
      ${task.comments ? `<p class="muted"><strong>Comments:</strong> ${escapeText(task.comments)}</p>` : ''}
      ${includeActions ? `
        <div class="task-actions">
          <button class="ghost-button" data-action="edit" data-id="${escapeText(task.id)}" type="button">Edit</button>
          <button class="ghost-button danger" data-action="delete" data-id="${escapeText(task.id)}" type="button">Delete</button>
        </div>
      ` : ''}
    </article>
  `;
}

function renderRecent(tasks) {
  const subset = tasks.slice(0, 3);
  nodes.dashboardRecentList.innerHTML = subset.length
    ? subset.map((task) => renderTaskCard(task, false)).join('')
    : `<article class="task-row"><p class="task-title">No tasks yet</p><p class="muted">Connect your sheet and start logging work.</p></article>`;
}

function renderTasks() {
  const q = nodes.searchInput.value.trim().toLowerCase();
  const date = nodes.filterDate.value;
  const status = nodes.filterStatus.value;

  const filtered = state.tasks.filter((task) => {
    const haystack = [task.task, task.details, task.comments, task.status, task.date].join(' ').toLowerCase();
    const okQuery = !q || haystack.includes(q);
    const okDate = !date || task.date === date;
    const okStatus = !status || task.status === status;
    return okQuery && okDate && okStatus;
  });

  nodes.taskList.innerHTML = filtered.length
    ? filtered.map((task) => renderTaskCard(task, true)).join('')
    : `<article class="task-row"><p class="task-title">No tasks found</p><p class="muted">Adjust filters or add a new entry.</p></article>`;
}

function renderReports() {
  const summary = state.summary || buildSummary(state.tasks);
  nodes.reportCompleted.textContent = String(summary.by_status.completed || 0);
  nodes.reportProgress.textContent = String(summary.by_status.in_progress || 0);
  nodes.reportBlocked.textContent = String(summary.by_status.blocked || 0);
  nodes.reportPlanned.textContent = String(summary.by_status.planned || 0);
  nodes.reportSummary.innerHTML = `
    The ledger currently contains <strong>${summary.totals.total}</strong> tasks.
    Completion stands at <strong>${summary.totals.completed}</strong>, while
    <strong>${summary.totals.blocked}</strong> are flagged for attention.
  `;
  nodes.reportSummaryShort.textContent = `${summary.totals.total} tasks • ${summary.totals.blocked} blocked`;
  nodes.analyticsRangeLabel.textContent =
    state.reportRange === 'daily' ? 'This week' : state.reportRange === 'weekly' ? 'This month' : 'This year';
  renderChart(nodes.reportChart, chartSeries(state.tasks, state.reportRange));
}

function renderDashboard() {
  const summary = state.summary || buildSummary(state.tasks);
  nodes.kpiTotal.textContent = String(summary.totals.weekly_total);
  nodes.kpiDelta.textContent = `${summary.totals.delta >= 0 ? '+' : ''}${summary.totals.delta}% vs last week`;
  nodes.kpiCompleted.textContent = String(summary.totals.completed);
  nodes.kpiFlagged.textContent = String(summary.totals.blocked);
  renderChart(nodes.analyticsChart, chartSeries(state.tasks, state.analyticsRange));
  renderRecent(state.tasks.slice(0, 5));
}

function renderHistory() {
  if (!state.history.length) {
    nodes.historyList.innerHTML = `<article class="timeline-item"><p class="task-title">No audit trail yet</p><p class="muted">Edits and deletions will appear here after the first sync.</p></article>`;
    return;
  }

  nodes.historyList.innerHTML = state.history
    .map((entry) => `
      <article class="timeline-item ${statusClass(entry.status)}" data-status="${escapeText(entry.status || '')}">
        <div class="task-top">
          <div>
            <h4 class="task-title">${escapeText(entry.task || entry.action)}</h4>
            <div class="task-meta">
              <span>${escapeText(formatDate(entry.timestamp, { month: 'short', day: 'numeric', year: 'numeric' }))}</span>
              <span>${escapeText(formatTime(entry.timestamp))}</span>
            </div>
          </div>
          <span class="status-pill ${statusClass(entry.status)}">${escapeText(entry.action)}</span>
        </div>
        <p class="muted">${escapeText(entry.details || 'Audit entry')}</p>
        <p class="muted"><strong>Actor:</strong> ${escapeText(entry.actor)}</p>
      </article>
    `)
    .join('');
}

function renderSettings() {
  const apiUrl = getApiUrl();
  const sheetUrl = getSheetUrl();
  const connectionText = apiUrl
    ? 'Apps Script URL loaded from deploy config'
    : 'Apps Script URL not set';
  if (nodes.connectionPill) nodes.connectionPill.textContent = connectionText;
  if (nodes.openSheetLink) nodes.openSheetLink.disabled = !sheetUrl;
}

function updatePageHeader(viewId) {
  const meta = VIEW_LABELS[viewId] || VIEW_LABELS['dashboard-view'];
  nodes.pageKicker.textContent = meta.kicker;
  nodes.pageTitle.textContent = meta.title;
}

function setActiveNav(viewId) {
  document.querySelectorAll('[data-view-target]').forEach((button) => {
    button.classList.toggle('active', button.dataset.viewTarget === viewId);
  });
}

function showView(viewId) {
  state.view = viewId;
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('active', view.id === viewId);
  });
  setActiveNav(viewId);
  updatePageHeader(viewId);
  if (viewId === 'dashboard-view') renderDashboard();
  if (viewId === 'tasks-view') renderTasks();
  if (viewId === 'reports-view') renderReports();
  if (viewId === 'history-view') renderHistory();
  if (viewId === 'settings-view') renderSettings();
  closeRail();
}

function closeRail() {
  document.body.classList.remove('rail-open');
  if (nodes.railScrim) nodes.railScrim.hidden = true;
}

function toggleRail(force) {
  const shouldOpen = typeof force === 'boolean' ? force : !document.body.classList.contains('rail-open');
  document.body.classList.toggle('rail-open', shouldOpen);
  if (nodes.railScrim) nodes.railScrim.hidden = !shouldOpen;
}

function clearForm() {
  state.editingId = null;
  nodes.taskId.value = '';
  nodes.taskDate.value = todayISO();
  nodes.taskTitle.value = '';
  nodes.taskDetails.value = '';
  nodes.taskStatus.value = 'Planned';
  nodes.taskComments.value = '';
}

function fillForm(task) {
  state.editingId = task.id;
  nodes.taskId.value = task.id;
  nodes.taskDate.value = task.date;
  nodes.taskTitle.value = task.task;
  nodes.taskDetails.value = task.details;
  nodes.taskStatus.value = task.status;
  nodes.taskComments.value = task.comments;
}

function collectFormData() {
  const payload = {
    id: nodes.taskId.value || uid(),
    date: nodes.taskDate.value || todayISO(),
    task: nodes.taskTitle.value.trim(),
    details: nodes.taskDetails.value.trim(),
    status: nodes.taskStatus.value,
    comments: nodes.taskComments.value.trim(),
  };

  if (!payload.date) throw new Error('Date is required.');
  if (!payload.task) throw new Error('Task is required.');
  if (!STATUS_OPTIONS.includes(payload.status)) throw new Error('Choose a valid status.');
  return normalizeTask(payload);
}

async function refreshData() {
  const data = await fetchBootstrap();
  state.tasks = Array.isArray(data.tasks) ? data.tasks.map(normalizeTask).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt)) : [];
  state.history = Array.isArray(data.history) ? data.history.map(normalizeHistory) : [];
  state.summary = data.summary || buildSummary(state.tasks);
  setConnectionLabel('Synced');
  showView(state.view);
}

function openSheet() {
  const target = getSheetUrl();
  if (!target) {
    setToast('Sheet URL not configured in deploy config.');
    return;
  }
  window.open(target, '_blank', 'noopener,noreferrer');
}

function bindNav() {
  document.querySelectorAll('[data-view-target]').forEach((button) => {
    button.addEventListener('click', () => showView(button.dataset.viewTarget));
  });
}

function bindRanges() {
  document.querySelectorAll('[data-analytics-range]').forEach((button) => {
    button.addEventListener('click', () => {
      state.analyticsRange = button.dataset.analyticsRange;
      document.querySelectorAll('[data-analytics-range]').forEach((btn) => btn.classList.toggle('active', btn === button));
      renderDashboard();
    });
  });

  document.querySelectorAll('[data-report-range]').forEach((button) => {
    button.addEventListener('click', () => {
      state.reportRange = button.dataset.reportRange;
      document.querySelectorAll('[data-report-range]').forEach((btn) => btn.classList.toggle('active', btn === button));
      renderReports();
    });
  });
}

function bindForms() {
  nodes.taskDate.value = todayISO();

  nodes.taskForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const wasEditing = Boolean(state.editingId);
    try {
      const task = collectFormData();
      const result = await saveRemoteTask(task);
      const existingIndex = state.tasks.findIndex((item) => item.id === result.task.id);
      if (existingIndex >= 0) {
        state.tasks[existingIndex] = result.task;
      } else {
        state.tasks.unshift(result.task);
      }
      state.history = [...result.history, ...state.history].slice(0, 100);
      state.tasks.sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
      state.summary = buildSummary(state.tasks);
      clearForm();
      setToast(wasEditing ? 'Task updated' : 'Task saved');
      showView('tasks-view');
    } catch (error) {
      setToast(error.message || 'Unable to save task');
    }
  });

  nodes.resetButton.addEventListener('click', clearForm);

  nodes.taskList.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const task = state.tasks.find((item) => item.id === button.dataset.id);
    if (!task) return;

    if (button.dataset.action === 'edit') {
      fillForm(task);
      showView('tasks-view');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (button.dataset.action === 'delete') {
      if (!window.confirm(`Delete "${task.task}"?`)) return;
      try {
        const history = await deleteRemoteTask(task.id);
        state.tasks = state.tasks.filter((item) => item.id !== task.id);
        state.history = [...history, ...state.history].slice(0, 100);
        state.summary = buildSummary(state.tasks);
        renderTasks();
        renderDashboard();
        renderReports();
        renderHistory();
        setToast('Task deleted');
      } catch (error) {
        setToast(error.message || 'Unable to delete task');
      }
    }
  });

  nodes.dashboardRecentList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-view-target]');
    if (button) showView(button.dataset.viewTarget);
  });
}

function bindSettings() {
  nodes.openSheetLink.addEventListener('click', openSheet);
}

function bindToolbar() {
  nodes.syncButton.addEventListener('click', async () => {
    try {
      await refreshData();
      setToast('Synced');
    } catch (error) {
      setConnectionLabel('Sync failed');
      setToast(error.message || 'Sync failed');
    }
  });

  nodes.openSheetButton.addEventListener('click', openSheet);

  if (nodes.mobileMenuButton) {
    nodes.mobileMenuButton.addEventListener('click', () => {
      toggleRail();
    });
  }

  if (nodes.closeMenuButton) {
    nodes.closeMenuButton.addEventListener('click', closeRail);
  }

  if (nodes.railScrim) {
    nodes.railScrim.addEventListener('click', closeRail);
  }

  document.addEventListener('pointerdown', (event) => {
    if (!document.body.classList.contains('rail-open')) return;
    const rail = document.querySelector('.side-rail');
    const menuButton = nodes.mobileMenuButton;
    const target = event.target;
    if (rail?.contains(target) || menuButton?.contains(target)) return;
    closeRail();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeRail();
  });
}

function bindFilters() {
  [nodes.searchInput, nodes.filterDate, nodes.filterStatus].forEach((node) => {
    node.addEventListener('input', renderTasks);
    node.addEventListener('change', renderTasks);
  });
}

function bootConnectionState() {
  if (!getApiUrl()) {
    setConnectionLabel('Waiting for deploy config');
  } else {
    setConnectionLabel('Connecting...');
  }
}

async function bootstrap() {
  await loadRuntimeConfig();
  bindNav();
  bindRanges();
  bindForms();
  bindSettings();
  bindToolbar();
  bindFilters();
  renderSettings();
  updatePageHeader(state.view);
  bootConnectionState();
  clearForm();
  if (nodes.railScrim) nodes.railScrim.hidden = true;

  if (getApiUrl()) {
    try {
      await refreshData();
      setConnectionLabel('Synced');
    } catch (error) {
      setConnectionLabel('Sheet unavailable');
      setToast(error.message || 'Could not load the sheet');
      showView('settings-view');
    }
  } else {
    showView('settings-view');
  }
}


bootstrap();
