const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ExcelJS = require('exceljs');
const morgan = require('morgan');
const readline = require('readline');

const app = express();
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const dbDir = path.join(os.homedir(), 'Documents', 'Taskify_DB');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

function getFileName(dateStr) { return path.join(dbDir, `${dateStr}.json`); }
function readTasks(dateStr) {
  if (fs.existsSync(getFileName(dateStr))) {
    try { return JSON.parse(fs.readFileSync(getFileName(dateStr), 'utf8')); } catch (e) { return []; }
  }
  return [];
}
function writeTasks(dateStr, tasks) {
  fs.writeFileSync(getFileName(dateStr), JSON.stringify(tasks, null, 2), 'utf8');
}
function parseTime(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':');
  if (h === undefined || m === undefined) return null;
  return new Date(1970, 0, 1, parseInt(h), parseInt(m));
}

let userName = '';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Enter your name: ', (answer) => {
  userName = answer.trim() || 'User';
  rl.close();

  // Start server after username input
  const PORT = 3000;
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
});

// --- API handlers below remain the same ---

app.post('/api/tasks', (req, res) => {
  const task = req.body;
  if (!task.date) return res.status(400).json({ error: 'date is required' });
  const tasks = readTasks(task.date);
  if (!task.id) task.id = Date.now();
  tasks.push(task);
  writeTasks(task.date, tasks);
  res.json(task);
});

app.get('/api/tasks/:date', (req, res) => {
  res.json(readTasks(req.params.date));
});

app.put('/api/tasks/:date/:id', (req, res) => {
  const { date, id } = req.params;
  let tasks = readTasks(date);
  const idx = tasks.findIndex(t => t.id == id);
  if (idx === -1) return res.status(404).json({ error: 'Task not found' });
  tasks[idx] = { ...tasks[idx], ...req.body };
  writeTasks(date, tasks);
  res.json(tasks[idx]);
});

app.delete('/api/tasks/:date/:id', (req, res) => {
  const { date, id } = req.params;
  let tasks = readTasks(date);
  tasks = tasks.filter(t => t.id != id);
  writeTasks(date, tasks);
  res.json({ ok: true });
});

app.get('/api/filter', (req, res) => {
  const { mode, from, to } = req.query;
  const allFiles = fs.readdirSync(dbDir).filter(f => f.endsWith('.json'));
  const now = new Date();
  let result = [];

  function parseDate(str) {
    const [y, m, d] = str.split('-');
    return new Date(y, m - 1, d);
  }

  for (const file of allFiles) {
    const dateStr = file.replace('.json', '');
    const [y, m, d] = dateStr.split('-');
    const fileDate = new Date(y, m - 1, d);

    let include = false;
    if (mode === 'today') include = fileDate.toDateString() === now.toDateString();
    else if (mode === 'tomorrow') {
      const t = new Date(now);
      t.setDate(now.getDate() + 1);
      include = fileDate.toDateString() === t.toDateString();
    }
    else if (mode === 'week') {
    const end = new Date(); // now
    const start = new Date();
    start.setDate(end.getDate() - 6); 
    include = fileDate >= start && fileDate <= end;  
    }
    else if (mode === 'month') include = fileDate.getMonth() === now.getMonth() && fileDate.getFullYear() === now.getFullYear();
    else if (mode === 'custom') {
      if (from && to) {
        const fromD = parseDate(from), toD = parseDate(to);
        include = fileDate >= fromD && fileDate <= toD;
      }
    }
    if (include) result = result.concat(readTasks(dateStr));
  }
  res.json(result);
});

app.get('/api/export-range', async (req, res) => {
  const { mode, from, to } = req.query;
  const allFiles = fs.readdirSync(dbDir).filter(f => f.endsWith('.json'));
  const now = new Date();
  let result = [];

  function parseDate(str) {
    const [y, m, d] = str.split('-');
    return new Date(y, m - 1, d);
  }

  for (const file of allFiles) {
    const dateStr = file.replace('.json', '');
    const [y, m, d] = dateStr.split('-');
    const fileDate = new Date(y, m - 1, d);

    let include = false;
    if (mode === 'today') include = fileDate.toDateString() === now.toDateString();
    else if (mode === 'tomorrow') {
      const t = new Date(now);
      t.setDate(now.getDate() + 1);
      include = fileDate.toDateString() === t.toDateString();
    }
    else if (mode === 'week') {
    const end = new Date(); // now
    const start = new Date();
    start.setDate(end.getDate() - 6); 
    include = fileDate >= start && fileDate <= end; 
    }
    else if (mode === 'month') include = fileDate.getMonth() === now.getMonth() && fileDate.getFullYear() === now.getFullYear();
    else if (mode === 'custom') {
      if (from && to) {
        const fromD = parseDate(from), toD = parseDate(to);
        include = fileDate >= fromD && fileDate <= toD;
      }
    }

    if (include) result = result.concat(readTasks(dateStr));
  }

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Tasks');

  ws.columns = [
    { header: 'Client Name', key: 'clientName', width: 20 },
    { header: 'Project Name', key: 'projectName', width: 20 },
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Start Time', key: 'startTime', width: 15 },
    { header: 'End Time', key: 'endTime', width: 15 },
    { header: 'Duration', key: 'duration', width: 12 },
    { header: 'Description', key: 'description', width: 40 },
    { header: 'Status', key: 'status', width: 15 }
  ];

  result.forEach(t => {
    let duration = '';
    const startTime = parseTime(t.startTime);
    const endTime = parseTime(t.endTime);
    if (startTime && endTime && endTime > startTime) {
      const diffMins = Math.floor((endTime - startTime) / 60000);
      const h = Math.floor(diffMins / 60);
      const m = diffMins % 60;
      duration = h > 0 ? `${h}h ${m}m` : `${m}m`;
    }
    t.duration = duration === '' ? '0m' : duration;
    const row = ws.addRow(t);
    let fillColor;
    switch ((t.status || '').toLowerCase()) {
      case 'completed': fillColor = 'FF2ECC71'; break;
      case 'inprogress': fillColor = 'FFF1C40F'; break;
      case 'pending': fillColor = 'FF3498DB'; break;
      case 'blocked': fillColor = 'FFE74C3C'; break;
      default: fillColor = null;
    }
    if (fillColor) {
      row.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
    }
  });
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const fileName = `${userName}_${dd}_${mm}_${yyyy}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  await workbook.xlsx.write(res);
  res.end();
});