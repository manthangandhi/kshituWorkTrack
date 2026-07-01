const DEFAULT_CONFIG = window.WORKTRACK_CONFIG || {};
const CONFIG_FILES = {
  apiUrl: './apps-script-url.txt',
  sheetUrl: './sheet-url.txt',
};
const STATUS_OPTIONS = ['Planned', 'In Progress', 'Blocked', 'Done'];
const VIEW_LABELS = {
  'dashboard-view': { kicker: 'Dashboard', title: 'Overview' },
  'tasks-view': { kicker: 'Tasks', title: 'Log and review' },
  'reports-view': { kicker: 'Reports', title: 'Performance' },
  'history-view': { kicker: 'History', title: 'Audit trail' },
  'settings-view': { kicker: 'Settings', title: 'Workspace' },
};

const state = {
  config: { ...DEFAULT_CONFIG },
  apiUrl: '',
  sheetUrl: '',
  view: 'dashboard-view',
  tasksTab: 'entry',
  analyticsRange: 'weekly',
  reportRange: 'weekly',
  tasks: [],
  history: [],
  summary: null,
  editingId: null,
  pendingDeleteId: null,
};

const nodes = {
  connectionPill: document.getElementById('connection-pill'),
  connectionPillMobile: document.getElementById('connection-pill-mobile'),
  syncButton: document.getElementById('sync-button'),
  openSheetButton: document.getElementById('open-sheet-button'),
  quickAddButton: document.getElementById('quick-add-button'),
  fabAdd: document.getElementById('fab-add'),
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
  saveButtonLabel: document.getElementById('save-button-label'),
  formModeLabel: document.getElementById('form-mode-label'),
  formTitle: document.getElementById('form-title'),
  searchInput: document.getElementById('search-input'),
  filterDate: document.getElementById('filter-date'),
  filterStatus: document.getElementById('filter-status'),
  taskList: document.getElementById('task-list'),
  taskCountLabel: document.getElementById('task-count-label'),
  dashboardRecentList: document.getElementById('dashboard-recent-list'),
  analyticsChart: document.getElementById('analytics-chart'),
  reportChart: document.getElementById('report-chart'),
  analyticsRangeLabel: document.getElementById('analytics-range-label'),
  reportSummaryShort: document.getElementById('report-summary-short'),
  reportSummary: document.getElementById('report-summary'),
  reportPeriodTitle: document.getElementById('report-period-title'),
  reportPeriodCount: document.getElementById('report-period-count'),
  reportTaskList: document.getElementById('report-task-list'),
  historyList: document.getElementById('history-list'),
  openSheetLink: document.getElementById('open-sheet-link'),
  kpiTotal: document.getElementById('kpi-total'),
  kpiDelta: document.getElementById('kpi-delta'),
  kpiCompleted: document.getElementById('kpi-completed'),
  kpiProgress: document.getElementById('kpi-progress'),
  kpiBlocked: document.getElementById('kpi-blocked'),
  reportCompleted: document.getElementById('report-completed'),
  reportProgress: document.getElementById('report-progress'),
  reportBlocked: document.getElementById('report-blocked'),
  reportPlanned: document.getElementById('report-planned'),
  toast: document.getElementById('toast'),
  deleteModal: document.getElementById('delete-modal'),
  deleteModalBody: document.getElementById('delete-modal-body'),
  deleteCancel: document.getElementById('delete-cancel'),
  deleteConfirm: document.getElementById('delete-confirm'),
  tasksEntryPanel: document.getElementById('tasks-entry-panel'),
  tasksListPanel: document.getElementById('tasks-list-panel'),
};

function uid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `task_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function todayISO() {
  return toLocalISO(new Date());
}

function toLocalISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

let isBusy = false;

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

function setToast(message, timeout = 2800) {
  nodes.toast.textContent = message;
  nodes.toast.hidden = false;
  window.clearTimeout(setToast.timer);
  setToast.timer = window.setTimeout(() => {
    nodes.toast.hidden = true;
  }, timeout);
}

function setConnectionState(status) {
  const map = {
    checking: { text: 'Checking...', className: 'pill pill-neutral' },
    connecting: { text: 'Connecting...', className: 'pill pill-loading' },
    synced: { text: 'Synced', className: 'pill pill-synced' },
    error: { text: 'Unavailable', className: 'pill pill-error' },
    waiting: { text: 'Not configured', className: 'pill pill-neutral' },
  };
  const entry = map[status] || map.checking;
  [nodes.connectionPill, nodes.connectionPillMobile].filter(Boolean).forEach((pill) => {
    pill.textContent = entry.text;
    pill.className = entry.className + (pill.id === 'connection-pill-mobile' ? ' mobile-only' : '');
  });
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
    throw new Error('Connection not configured. Ask your admin to deploy the app.');
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
    throw new Error(data.error || `Could not load data (${res.status})`);
  }
  return data;
}

async function saveRemoteTask(task) {
  const res = await requestEndpoint('save', 'POST', task);
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Could not save task (${res.status})`);
  }
  return {
    task: normalizeTask(data.task || task),
    history: Array.isArray(data.history) ? data.history.map(normalizeHistory) : [],
    summary: data.summary || null,
  };
}

async function deleteRemoteTask(id) {
  const res = await requestEndpoint('delete', 'POST', { id });
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Could not delete task (${res.status})`);
  }
  return Array.isArray(data.history) ? data.history.map(normalizeHistory) : [];
}

function getRangeBounds(range) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  if (range === 'daily') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { start, end, label: 'Today' };
  }

  if (range === 'weekly') {
    const start = new Date();
    const weekday = start.getDay() || 7;
    start.setDate(start.getDate() - weekday + 1);
    start.setHours(0, 0, 0, 0);
    return { start, end, label: 'This week' };
  }

  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  return { start, end, label: 'This month' };
}

function filterTasksByRange(tasks, range) {
  const { start, end } = getRangeBounds(range);
  return tasks.filter((task) => {
    const date = toDate(task.date);
    return date && date >= start && date <= end;
  });
}

function countByStatus(tasks) {
  return {
    completed: tasks.filter((task) => task.status === 'Done').length,
    blocked: tasks.filter((task) => task.status === 'Blocked').length,
    in_progress: tasks.filter((task) => task.status === 'In Progress').length,
    planned: tasks.filter((task) => task.status === 'Planned').length,
  };
}

function buildSummary(tasks) {
  const now = new Date();
  const weekStart = new Date(now);
  const weekday = weekStart.getDay() || 7;
  weekStart.setDate(weekStart.getDate() - weekday + 1);
  weekStart.setHours(0, 0, 0, 0);
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(weekStart);
  const weekTasks = filterTasksByRange(tasks, 'weekly');
  const previousWeekTasks = tasks.filter((task) => {
    const date = toDate(task.date);
    return date && date >= lastWeekStart && date < lastWeekEnd;
  });
  const counts = countByStatus(tasks);
  const deltaBase = previousWeekTasks.length || 1;
  const delta = Math.round(((weekTasks.length - previousWeekTasks.length) / deltaBase) * 100);
  return {
    totals: {
      total: tasks.length,
      weekly_total: weekTasks.length,
      completed: counts.completed,
      blocked: counts.blocked,
      in_progress: counts.in_progress,
      planned: counts.planned,
      delta,
    },
    by_status: counts,
  };
}

function normalizeSummary(summary, tasks) {
  const fallback = buildSummary(tasks);
  if (!summary) return fallback;

  const totals = summary.totals || {};
  const byStatus = summary.by_status || {};
  const completed = totals.completed ?? byStatus.Done ?? byStatus.completed ?? fallback.totals.completed;
  const blocked = totals.blocked ?? byStatus.Blocked ?? byStatus.blocked ?? fallback.totals.blocked;
  const inProgress = totals.in_progress ?? byStatus['In Progress'] ?? byStatus.in_progress ?? fallback.totals.in_progress;
  const planned = totals.planned ?? byStatus.Planned ?? byStatus.planned ?? fallback.totals.planned;

  return {
    totals: {
      total: totals.total ?? fallback.totals.total,
      weekly_total: totals.weekly_total ?? fallback.totals.weekly_total,
      completed,
      blocked,
      in_progress: inProgress,
      planned,
      delta: totals.delta ?? fallback.totals.delta,
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
    const iso = toLocalISO(date);
    return {
      label: date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3),
      value: tasks.filter((task) => task.date === iso).length,
    };
  });
  return days;
}

function renderChart(container, series) {
  if (!container) return;
  const max = Math.max(1, ...series.map((item) => item.value));
  container.style.gridTemplateColumns = `repeat(${series.length}, minmax(36px, 1fr))`;
  container.innerHTML = series
    .map((item) => {
      const height = Math.max(8, Math.round((item.value / max) * 100));
      return `
        <div class="bar">
          <div class="bar-value">${item.value || ''}</div>
          <div class="bar-track">
            <div class="bar-fill" style="height:${height}%"></div>
          </div>
          <div class="bar-label">${escapeText(item.label)}</div>
        </div>
      `;
    })
    .join('');
}

function renderEmptyState(icon, title, message) {
  return `
    <article class="empty-state">
      <span class="material-symbols-outlined" aria-hidden="true">${escapeText(icon)}</span>
      <p class="task-title">${escapeText(title)}</p>
      <p class="muted">${escapeText(message)}</p>
    </article>
  `;
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
      ${task.details ? `<p class="muted">${escapeText(task.details)}</p>` : ''}
      ${task.comments ? `<p class="muted"><strong>Notes:</strong> ${escapeText(task.comments)}</p>` : ''}
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
  const subset = tasks.slice(0, 5);
  nodes.dashboardRecentList.innerHTML = subset.length
    ? subset.map((task) => renderTaskCard(task, false)).join('')
    : renderEmptyState('edit_note', 'No tasks yet', 'Tap + to log your first task for today.');
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

  if (nodes.taskCountLabel) {
    nodes.taskCountLabel.textContent = `${filtered.length} task${filtered.length === 1 ? '' : 's'}`;
  }

  nodes.taskList.innerHTML = filtered.length
    ? filtered.map((task) => renderTaskCard(task, true)).join('')
    : renderEmptyState('search_off', 'No tasks found', 'Try adjusting your filters or add a new entry.');
}

function renderReports() {
  const periodTasks = filterTasksByRange(state.tasks, state.reportRange);
  const periodCounts = countByStatus(periodTasks);
  const { label } = getRangeBounds(state.reportRange);

  nodes.reportCompleted.textContent = String(periodCounts.completed);
  nodes.reportProgress.textContent = String(periodCounts.in_progress);
  nodes.reportBlocked.textContent = String(periodCounts.blocked);
  nodes.reportPlanned.textContent = String(periodCounts.planned);
  nodes.reportSummary.innerHTML = `
    For <strong>${escapeText(label.toLowerCase())}</strong>, you logged
    <strong>${periodTasks.length}</strong> tasks —
    <strong>${periodCounts.completed}</strong> completed,
    <strong>${periodCounts.in_progress}</strong> in progress, and
    <strong>${periodCounts.blocked}</strong> blocked.
  `;
  nodes.reportSummaryShort.textContent = `${periodTasks.length} tasks`;
  nodes.reportPeriodTitle.textContent = `Tasks for ${label.toLowerCase()}`;
  nodes.reportPeriodCount.textContent = `${periodTasks.length} task${periodTasks.length === 1 ? '' : 's'}`;
  nodes.reportTaskList.innerHTML = periodTasks.length
    ? periodTasks.map((task) => renderTaskCard(task, false)).join('')
    : renderEmptyState('event_busy', 'Nothing in this period', 'Switch the range above or log a new task.');
  renderChart(nodes.reportChart, chartSeries(state.tasks, state.reportRange));
}

function renderDashboard() {
  const summary = normalizeSummary(state.summary, state.tasks);
  const weekCounts = countByStatus(filterTasksByRange(state.tasks, 'weekly'));

  nodes.kpiTotal.textContent = String(summary.totals.weekly_total);
  const delta = summary.totals.delta;
  nodes.kpiDelta.textContent = `${delta >= 0 ? '+' : ''}${delta}% vs last week`;
  nodes.kpiDelta.className = `delta ${delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral'}`;
  nodes.kpiCompleted.textContent = String(weekCounts.completed);
  nodes.kpiProgress.textContent = String(weekCounts.in_progress);
  nodes.kpiBlocked.textContent = String(weekCounts.blocked);
  nodes.analyticsRangeLabel.textContent =
    state.analyticsRange === 'daily' ? 'Today' : state.analyticsRange === 'weekly' ? 'This week' : 'This month';
  renderChart(nodes.analyticsChart, chartSeries(state.tasks, state.analyticsRange));
  renderRecent(state.tasks);
}

function renderHistory() {
  if (!state.history.length) {
    nodes.historyList.innerHTML = renderEmptyState('history', 'No history yet', 'Changes will appear here after you save or edit tasks.');
    return;
  }

  const sorted = [...state.history].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  nodes.historyList.innerHTML = sorted
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
      </article>
    `)
    .join('');
}

function renderSettings() {
  const sheetUrl = getSheetUrl();
  if (nodes.openSheetLink) nodes.openSheetLink.disabled = !sheetUrl;
}

function updateFormMode() {
  const editing = Boolean(state.editingId);
  if (nodes.formModeLabel) nodes.formModeLabel.textContent = editing ? 'Editing' : 'New entry';
  if (nodes.formTitle) nodes.formTitle.textContent = editing ? 'Update task' : 'Log a task';
  if (nodes.saveButtonLabel) nodes.saveButtonLabel.textContent = editing ? 'Update task' : 'Save task';
}

function setTasksTab(tab) {
  state.tasksTab = tab;
  document.querySelectorAll('[data-tasks-tab]').forEach((button) => {
    if (!button.classList.contains('segment') && !button.classList.contains('mobile-link')) return;
    const isActive = button.dataset.tasksTab === tab;
    if (button.classList.contains('segment')) {
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    }
  });
  if (nodes.tasksEntryPanel) nodes.tasksEntryPanel.classList.toggle('active', tab === 'entry');
  if (nodes.tasksListPanel) nodes.tasksListPanel.classList.toggle('active', tab === 'list');
  if (tab === 'list') renderTasks();
}

function updatePageHeader(viewId) {
  const meta = VIEW_LABELS[viewId] || VIEW_LABELS['dashboard-view'];
  nodes.pageKicker.textContent = meta.kicker;
  nodes.pageTitle.textContent = meta.title;
}

function setActiveNav(viewId) {
  document.querySelectorAll('[data-view-target]').forEach((button) => {
    if (!button.dataset.viewTarget) return;
    const isViewNav = button.classList.contains('rail-link') || button.classList.contains('mobile-link');
    if (!isViewNav) return;
    button.classList.toggle('active', button.dataset.viewTarget === viewId);
  });
}

function showView(viewId, options = {}) {
  state.view = viewId;
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('active', view.id === viewId);
  });
  setActiveNav(viewId);
  updatePageHeader(viewId);
  if (viewId === 'tasks-view') {
    setTasksTab(options.tasksTab || state.tasksTab || 'entry');
    updateFormMode();
    if ((options.tasksTab || state.tasksTab) === 'list') renderTasks();
  }
  if (viewId === 'dashboard-view') renderDashboard();
  if (viewId === 'reports-view') renderReports();
  if (viewId === 'history-view') renderHistory();
  if (viewId === 'settings-view') renderSettings();
  if (viewId === 'tasks-view' && options.tasksTab === 'entry') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function clearForm() {
  state.editingId = null;
  nodes.taskId.value = '';
  nodes.taskDate.value = todayISO();
  nodes.taskTitle.value = '';
  nodes.taskDetails.value = '';
  nodes.taskStatus.value = 'Planned';
  nodes.taskComments.value = '';
  updateFormMode();
}

function fillForm(task) {
  state.editingId = task.id;
  nodes.taskId.value = task.id;
  nodes.taskDate.value = task.date;
  nodes.taskTitle.value = task.task;
  nodes.taskDetails.value = task.details;
  nodes.taskStatus.value = task.status;
  nodes.taskComments.value = task.comments;
  updateFormMode();
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
  if (!payload.task) throw new Error('Task name is required.');
  if (!STATUS_OPTIONS.includes(payload.status)) throw new Error('Choose a valid status.');
  return normalizeTask(payload);
}

function setSyncLoading(loading) {
  if (!nodes.syncButton) return;
  nodes.syncButton.disabled = loading;
  nodes.syncButton.classList.toggle('sync-button-loading', loading);
  const label = nodes.syncButton.querySelector('.sync-label');
  if (label) label.textContent = loading ? 'Syncing...' : 'Sync';
}

function openDeleteModal(task) {
  state.pendingDeleteId = task.id;
  if (nodes.deleteModalBody) {
    nodes.deleteModalBody.textContent = `"${task.task}" will be permanently removed from your sheet.`;
  }
  if (nodes.deleteModal) nodes.deleteModal.hidden = false;
}

function closeDeleteModal() {
  state.pendingDeleteId = null;
  if (nodes.deleteModal) nodes.deleteModal.hidden = true;
}

async function confirmDelete() {
  const id = state.pendingDeleteId;
  if (!id || isBusy) return;
  const task = state.tasks.find((item) => item.id === id);
  if (!task) {
    closeDeleteModal();
    return;
  }

  isBusy = true;
  if (nodes.deleteConfirm) nodes.deleteConfirm.disabled = true;
  try {
    const history = await deleteRemoteTask(id);
    state.tasks = state.tasks.filter((item) => item.id !== id);
    state.history = [...history, ...state.history].slice(0, 100);
    state.summary = normalizeSummary(null, state.tasks);
    closeDeleteModal();
    renderTasks();
    renderDashboard();
    renderReports();
    renderHistory();
    setToast('Task deleted');
  } catch (error) {
    setToast(error.message || 'Could not delete task');
  } finally {
    isBusy = false;
    if (nodes.deleteConfirm) nodes.deleteConfirm.disabled = false;
  }
}

async function refreshData() {
  setSyncLoading(true);
  setConnectionState('connecting');
  try {
    const data = await fetchBootstrap();
    state.tasks = Array.isArray(data.tasks)
      ? data.tasks.map(normalizeTask).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt))
      : [];
    state.history = Array.isArray(data.history) ? data.history.map(normalizeHistory) : [];
    state.summary = normalizeSummary(data.summary, state.tasks);
    setConnectionState('synced');
    showView(state.view);
  } finally {
    setSyncLoading(false);
  }
}

function openSheet() {
  const target = getSheetUrl();
  if (!target) {
    setToast('Spreadsheet link not available.');
    return;
  }
  window.open(target, '_blank', 'noopener,noreferrer');
}

function bindNav() {
  document.querySelectorAll('[data-view-target]').forEach((button) => {
    button.addEventListener('click', () => {
      const tasksTab = button.dataset.tasksTab || (button.id === 'fab-add' || button.id === 'quick-add-button' ? 'entry' : undefined);
      showView(button.dataset.viewTarget, { tasksTab });
    });
  });
}

function bindTasksTabs() {
  document.querySelectorAll('.segment[data-tasks-tab]').forEach((button) => {
    button.addEventListener('click', () => setTasksTab(button.dataset.tasksTab));
  });
}

function bindRanges() {
  document.querySelectorAll('[data-analytics-range]').forEach((button) => {
    button.addEventListener('click', () => {
      state.analyticsRange = button.dataset.analyticsRange;
      document.querySelectorAll('[data-analytics-range]').forEach((btn) => {
        const active = btn === button;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', String(active));
      });
      renderDashboard();
    });
  });

  document.querySelectorAll('[data-report-range]').forEach((button) => {
    button.addEventListener('click', () => {
      state.reportRange = button.dataset.reportRange;
      document.querySelectorAll('[data-report-range]').forEach((btn) => {
        const active = btn === button;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', String(active));
      });
      renderReports();
    });
  });
}

function bindForms() {
  nodes.taskDate.value = todayISO();
  updateFormMode();

  nodes.taskForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isBusy) return;
    const wasEditing = Boolean(state.editingId);
    isBusy = true;
    nodes.saveButton.disabled = true;
    if (nodes.saveButtonLabel) nodes.saveButtonLabel.textContent = 'Saving...';
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
      state.summary = normalizeSummary(result.summary, state.tasks);
      clearForm();
      setConnectionState('synced');
      setToast(wasEditing ? 'Task updated' : 'Task saved');
      showView('tasks-view', { tasksTab: 'list' });
    } catch (error) {
      setToast(error.message || 'Could not save task');
    } finally {
      isBusy = false;
      nodes.saveButton.disabled = false;
      updateFormMode();
    }
  });

  nodes.resetButton.addEventListener('click', clearForm);

  nodes.taskList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const task = state.tasks.find((item) => item.id === button.dataset.id);
    if (!task) return;

    if (button.dataset.action === 'edit') {
      fillForm(task);
      showView('tasks-view', { tasksTab: 'entry' });
      return;
    }

    if (button.dataset.action === 'delete') {
      openDeleteModal(task);
    }
  });
}

function bindModal() {
  if (nodes.deleteCancel) {
    nodes.deleteCancel.addEventListener('click', closeDeleteModal);
  }
  if (nodes.deleteConfirm) {
    nodes.deleteConfirm.addEventListener('click', confirmDelete);
  }
  document.querySelectorAll('[data-dismiss="modal"]').forEach((el) => {
    el.addEventListener('click', closeDeleteModal);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nodes.deleteModal && !nodes.deleteModal.hidden) {
      closeDeleteModal();
    }
  });
}

function bindSettings() {
  nodes.openSheetLink.addEventListener('click', openSheet);
}

function bindToolbar() {
  nodes.syncButton.addEventListener('click', async () => {
    try {
      await refreshData();
      setToast('Synced with sheet');
    } catch (error) {
      setConnectionState('error');
      setToast(error.message || 'Sync failed');
    }
  });

  nodes.openSheetButton.addEventListener('click', openSheet);
}

function bindFilters() {
  [nodes.searchInput, nodes.filterDate, nodes.filterStatus].forEach((node) => {
    node.addEventListener('input', renderTasks);
    node.addEventListener('change', renderTasks);
  });
}

async function bootstrap() {
  await loadRuntimeConfig();
  bindNav();
  bindTasksTabs();
  bindRanges();
  bindForms();
  bindModal();
  bindSettings();
  bindToolbar();
  bindFilters();
  renderSettings();
  updatePageHeader(state.view);
  setConnectionState('checking');
  clearForm();

  if (getApiUrl()) {
    try {
      await refreshData();
    } catch (error) {
      setConnectionState('error');
      setToast(error.message || 'Could not connect to your sheet');
      showView('settings-view');
    }
  } else {
    setConnectionState('waiting');
    showView('settings-view');
  }
}

bootstrap();