const TASK_SHEET = 'Tasks';
const HISTORY_SHEET = 'History';

function json(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function spreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function ensureSheet(name, headers) {
  const ss = spreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  const range = sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn() || headers.length));
  const row = range.getValues()[0] || [];
  const hasHeaders = headers.every((header, index) => row[index] === header);
  if (!hasHeaders) {
    sheet.clearContents();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function ensureSchema() {
  ensureSheet(TASK_SHEET, ['id', 'date', 'task', 'details', 'status', 'comments', 'createdAt', 'updatedAt']);
  ensureSheet(HISTORY_SHEET, ['id', 'timestamp', 'action', 'taskId', 'task', 'status', 'details', 'actor']);
}

function setupWorkTrack() {
  ensureSchema();
  SpreadsheetApp.flush();
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('WorkTrack')
    .addItem('Initialize sheets', 'setupWorkTrack')
    .addToUi();
}

function readObjects(sheetName) {
  ensureSchema();
  const sheet = spreadsheet().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  const headers = values.shift();
  return values
    .filter((row) => row.some((cell) => String(cell).trim() !== ''))
    .map((row) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = row[index];
      });
      return record;
    });
}

function writeObjects(sheetName, headers, rows) {
  const sheet = ensureSheet(sheetName, headers);
  const data = [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ''))];
  sheet.clearContents();
  sheet.getRange(1, 1, data.length, headers.length).setValues(data);
}

function readTasks() {
  return readObjects(TASK_SHEET);
}

function readHistory() {
  return readObjects(HISTORY_SHEET);
}

function upsertTaskRow(task) {
  const headers = ['id', 'date', 'task', 'details', 'status', 'comments', 'createdAt', 'updatedAt'];
  const rows = readTasks();
  const index = rows.findIndex((row) => row.id === task.id);
  if (index >= 0) rows[index] = task;
  else rows.unshift(task);
  writeObjects(TASK_SHEET, headers, rows);
}

function deleteTaskRow(id) {
  const headers = ['id', 'date', 'task', 'details', 'status', 'comments', 'createdAt', 'updatedAt'];
  const rows = readTasks().filter((row) => row.id !== id);
  writeObjects(TASK_SHEET, headers, rows);
}

function appendHistory(entry) {
  const headers = ['id', 'timestamp', 'action', 'taskId', 'task', 'status', 'details', 'actor'];
  const sheet = ensureSheet(HISTORY_SHEET, headers);
  sheet.appendRow(headers.map((header) => entry[header] ?? ''));
}

function buildSummary(tasks) {
  const now = new Date();
  const weekStart = new Date(now);
  const weekday = weekStart.getDay() || 7;
  weekStart.setDate(weekStart.getDate() - weekday + 1);
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(weekStart);

  const counts = { Planned: 0, 'In Progress': 0, Blocked: 0, Done: 0 };
  let weeklyTotal = 0;
  let previousWeeklyTotal = 0;

  tasks.forEach((task) => {
    counts[task.status] = (counts[task.status] || 0) + 1;
    const date = new Date(task.date);
    if (!isNaN(date.getTime())) {
      if (date >= weekStart && date <= now) weeklyTotal += 1;
      if (date >= lastWeekStart && date < lastWeekEnd) previousWeeklyTotal += 1;
    }
  });

  const deltaBase = previousWeeklyTotal || 1;
  const delta = Math.round(((weeklyTotal - previousWeeklyTotal) / deltaBase) * 100);

  return {
    totals: {
      total: tasks.length,
      weekly_total: weeklyTotal,
      completed: counts.Done,
      blocked: counts.Blocked,
      in_progress: counts['In Progress'],
      planned: counts.Planned,
      delta,
    },
    by_status: counts,
  };
}

function normalizeTask(task) {
  const now = new Date().toISOString();
  return {
    id: task.id || Utilities.getUuid(),
    date: String(task.date || '').trim() || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    task: String(task.task || '').trim(),
    details: String(task.details || '').trim(),
    status: String(task.status || 'Planned').trim(),
    comments: String(task.comments || '').trim(),
    createdAt: String(task.createdAt || now),
    updatedAt: String(task.updatedAt || now),
  };
}

function getPayload(e) {
  const raw = (e && e.postData && e.postData.contents) || '{}';
  try {
    return JSON.parse(raw);
  } catch (error) {
    return {};
  }
}

function doGet(e) {
  ensureSchema();
  const action = (e && e.parameter && e.parameter.action) || 'bootstrap';

  if (action === 'health') {
    return json({ ok: true });
  }

  if (action === 'tasks') {
    return json({ ok: true, tasks: readTasks() });
  }

  if (action === 'history') {
    return json({ ok: true, history: readHistory() });
  }

  if (action === 'summary') {
    return json({ ok: true, summary: buildSummary(readTasks()) });
  }

  const tasks = readTasks();
  return json({
    ok: true,
    tasks,
    history: readHistory(),
    summary: buildSummary(tasks),
  });
}

function doPost(e) {
  ensureSchema();
  const payload = getPayload(e);
  const action = payload.action || 'save';
  const tasks = readTasks();

  if (action === 'save') {
    if (!payload.task || !payload.date || !payload.status) {
      return json({ ok: false, error: 'Missing required fields' });
    }

    const now = new Date().toISOString();
    const next = normalizeTask({
      id: payload.id || Utilities.getUuid(),
      date: payload.date,
      task: payload.task,
      details: payload.details,
      status: payload.status,
      comments: payload.comments,
      createdAt: payload.createdAt || now,
      updatedAt: now,
    });
    const existing = tasks.find((row) => row.id === next.id);
    upsertTaskRow(next);
    appendHistory({
      id: Utilities.getUuid(),
      timestamp: now,
      action: existing ? 'updated' : 'created',
      taskId: next.id,
      task: next.task,
      status: next.status,
      details: existing ? 'Task updated from the web app.' : 'Task created from the web app.',
      actor: 'Web app',
    });
    return json({
      ok: true,
      task: next,
      history: readHistory(),
      summary: buildSummary(readTasks()),
    });
  }

  if (action === 'delete') {
    if (!payload.id) {
      return json({ ok: false, error: 'Missing task id' });
    }
    const existing = tasks.find((row) => row.id === payload.id);
    if (!existing) {
      return json({ ok: false, error: 'Task not found' });
    }

    deleteTaskRow(payload.id);
    appendHistory({
      id: Utilities.getUuid(),
      timestamp: new Date().toISOString(),
      action: 'deleted',
      taskId: existing.id,
      task: existing.task,
      status: existing.status,
      details: 'Task deleted from the web app.',
      actor: 'Web app',
    });
    return json({ ok: true, history: readHistory(), summary: buildSummary(readTasks()) });
  }

  return json({ ok: false, error: 'Unknown action' });
}
