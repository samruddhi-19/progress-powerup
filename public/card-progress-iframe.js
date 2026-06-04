const TRELLO_API_KEY = "58a903ef47a68cf462fd91ad5101444e";

const t = TrelloPowerUp.iframe({
  appKey: TRELLO_API_KEY,
  appName: 'Progress Tracker'
});

/* ── Constants ── */
const UNIT_LABELS = { hours: 'Session', days: 'Daily', weeks: 'Weekly', months: 'Monthly' };

/* ── State ── */
let state = {
  trackingUnit: 'hours',
  running: false,
  startTime: null,
  focusMode: false,
  manualProgress: 0,       // 0-100, set by slider
  progressSource: 'tasks', // 'manual' | 'tasks' | 'timer'
  etaDate: '',             // "YYYY-MM-DD"
  etaTime: '',             // "HH:MM"
  tasks: [],               // [{ id, name, done }]
  logView: 'list',
  showAllLogs: false,
  data: {
    hours:  { elapsed: 0, estimated: 8 * 3600 },
    days:   { elapsed: 0, estimated: 86400 * 5 },
    weeks:  { elapsed: 0, estimated: 604800 * 4 },
    months: { elapsed: 0, estimated: 2592000 * 12 }
  },
  history: []
};

let cardMeta = { name: '', labelName: '', labelColor: '' };
let timerInterval = null;

/* ── Helpers ── */
function formatHM(sec) {
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  return `${h}:${m}`;
}

function formatHMS(sec) {
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function parseHM(str) {
  const parts = str.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
  if (parts.length === 1) return parts[0] * 3600;
  return 8 * 3600;
}

function getLabelStyle(color) {
  const map = {
    blue: '#0079bf', sky: '#00c2e0', lime: '#51e898', green: '#61bd4f',
    yellow: '#f2d600', orange: '#ff9f1a', red: '#eb5a46', pink: '#ff78cb',
    purple: '#c377e0'
  };
  const bg  = map[color] || '#00bcd4';
  const txt = ['yellow','lime','sky'].includes(color) ? '#002830' : '#ffffff';
  return `background:${bg};color:${txt};`;
}

function computeProgress() {
  if (state.progressSource === 'manual') return state.manualProgress;

  if (state.progressSource === 'tasks') {
    if (!state.tasks || state.tasks.length === 0) return 0;
    const done = state.tasks.filter(t => t.done).length;
    return Math.round((done / state.tasks.length) * 100);
  }

  // timer
  const active = state.data[state.trackingUnit];
  let elapsed  = active.elapsed;
  if (state.running && state.startTime) {
    elapsed += Math.floor((Date.now() - state.startTime) / 1000);
  }
  const est = active.estimated || 1;
  return Math.min(100, Math.round((elapsed / est) * 100));
}

function getLiveElapsed() {
  const active = state.data[state.trackingUnit];
  let el = active.elapsed;
  if (state.running && state.startTime) {
    el += Math.floor((Date.now() - state.startTime) / 1000);
  }
  return el;
}

/* ── Fetch card meta ── */
async function fetchCardMeta() {
  try {
    const card = await t.card('name', 'labels');
    cardMeta.name = card.name || '';
    if (card.labels && card.labels.length > 0) {
      cardMeta.labelName  = card.labels[0].name  || card.labels[0].color || 'Label';
      cardMeta.labelColor = card.labels[0].color || '';
    }
  } catch (e) {}
}

/* ── Save / Load ── */
function save() { 
  try { t.set('card', 'shared', state); } 
  catch(e) { console.error('[ProgressCard] save error:', e); }
}


async function load() {
  try {
  await fetchCardMeta();
  const saved = (await t.get('card', 'shared')) || {};

  if (saved.data)            state.data            = saved.data;
  if (saved.history)         state.history         = saved.history;
  if (saved.tasks)           state.tasks           = saved.tasks;
  state.running        = saved.running        || false;
  state.startTime      = saved.startTime      || null;
  state.focusMode      = saved.focusMode      || false;
  state.trackingUnit   = saved.trackingUnit   || 'hours';
  state.logView        = saved.logView        || 'list';
  state.showAllLogs    = saved.showAllLogs    || false;
  state.manualProgress = saved.manualProgress ?? 0;
  state.progressSource = saved.progressSource || 'tasks';
  state.etaDate        = saved.etaDate        || '';
  state.etaTime        = saved.etaTime        || '';

  // Migrate old elapsed/estimated format
  if (saved.estimated !== undefined && !saved.data) {
    state.data.hours.elapsed   = saved.elapsed   || 0;
    state.data.hours.estimated = saved.estimated || 8 * 3600;
  }

  render();
  if (state.running) startTick();

   setTimeout(() => { try { t.sizeTo(document.body); } catch(e) {} }, 40);
  } catch(err) {
    console.error('[ProgressCard] load error:', err);
  }
}

load();

/* ── Timer ── */
function startTick() {
  if (timerInterval) return;
  timerInterval = setInterval(() => {
    if (!state.running) return;
    const elapsed = getLiveElapsed();

    // Update timer display
    const disp = document.getElementById('timerDisplay');
    if (disp) {
      disp.textContent = formatHM(elapsed);
    }

    // Update session ticker for non-hour units
    if (state.trackingUnit !== 'hours') {
      const sessionSec = Math.floor((Date.now() - state.startTime) / 1000);
      const ticker = document.getElementById('sessionTicker');
      if (ticker) ticker.textContent = 'Session: ' + formatHMS(sessionSec);
    }

    // Update progress bar if source is timer
    if (state.progressSource === 'timer') {
      const pct = computeProgress();
      updateProgressUI(pct);
    }
  }, 1000);
}

function updateProgressUI(pct) {
  const fill    = document.getElementById('progressFill');
  const botFill = document.getElementById('bottomBarFill');
  const pctEl   = document.getElementById('pctDisplay');
  const isOver  = pct > 100;
  const disp    = Math.min(100, pct);

  if (fill)    { fill.style.width    = disp + '%'; fill.className    = 'slider-fill'    + (isOver ? ' overtime' : ''); }
  if (botFill) { botFill.style.width = disp + '%'; botFill.className = 'bottom-bar-fill' + (isOver ? ' overtime' : ''); }
  if (pctEl)   { pctEl.textContent   = pct + '%';  pctEl.className   = 'completion-pct' + (isOver ? ' overtime' : ''); }
}

function stopSession() {
  if (!state.running) return;
  const sessionSec = Math.floor((Date.now() - state.startTime) / 1000);
  state.data[state.trackingUnit].elapsed += sessionSec;
  state.running   = false;
  state.focusMode = false;
  t.set('card', 'shared', 'focusMode', false);

  if (sessionSec > 5) {
    const d = new Date(state.startTime);
    state.history.push({
      date:    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      time:    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      seconds: sessionSec,
      unit:    state.trackingUnit
    });
    if (state.history.length > 20) state.history.shift();
  }

  state.startTime = null;
  clearInterval(timerInterval);
  timerInterval = null;
}

/* ── Calendar sync ── */
async function syncDueDate(isoDate) {
  try {
    const card   = await t.card('id');
    const isAuth = await t.getRestApi().isAuthorized();
    if (!isAuth) await t.getRestApi().authorize({ scope: 'read,write', expiration: 'never' });
    const token = await t.getRestApi().getToken();
    if (!token) return;
    await fetch(`https://api.trello.com/1/cards/${card.id}?key=${TRELLO_API_KEY}&token=${token}&due=${isoDate}`, { method: 'PUT' });
  } catch (e) { console.error('Due date sync error:', e); }
}

/* ── Global handlers (called from HTML) ── */
window.onSliderInput = function(val) {
  state.manualProgress = parseInt(val);
  state.progressSource = 'manual';
  updateProgressUI(state.manualProgress);
  save();
};

window.onSliderChange = function(val) {
  state.manualProgress = parseInt(val);
  state.progressSource = 'manual';
  save();
  render();
};

window.toggleTask = function(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  task.done = !task.done;
  // Auto switch to tasks source
  state.progressSource = 'tasks';
  save();
  render();
};

window.deleteTask = function(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  save();
  render();
};

window.addTask = function() {
  const input = document.getElementById('newTaskInput');
  if (!input) return;
  const name = input.value.trim();
  if (!name) return;
  state.tasks.push({ id: Date.now().toString(), name, done: false });
  state.progressSource = 'tasks';
  input.value = '';
  save();
  render();
};

window.onNewTaskKey = function(e) {
  if (e.key === 'Enter') window.addTask();
};

window.onEtaDateChange = function(val) {
  state.etaDate = val;
  save();
  // Sync to Trello if both date and time set
  if (state.etaDate && state.etaTime) {
    const iso = new Date(`${state.etaDate}T${state.etaTime}`).toISOString();
    syncDueDate(iso);
  }
};

window.onEtaTimeChange = function(val) {
  state.etaTime = val;
  save();
  if (state.etaDate && state.etaTime) {
    const iso = new Date(`${state.etaDate}T${state.etaTime}`).toISOString();
    syncDueDate(iso);
  }
};

window.toggleTimer = function() {
  if (state.running) {
    stopSession();
  } else {
    state.running   = true;
    state.startTime = Date.now();
    startTick();
  }
  save();
  render();
};

window.resetTimer = function() {
  stopSession();
  state.data[state.trackingUnit].elapsed = 0;
  state.running   = false;
  state.startTime = null;
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  save();
  render();
};

window.onEstChange = function(val) {
  const sec = parseHM(val);
  if (sec > 0) {
    state.data[state.trackingUnit].estimated = sec;
    save();
  }
};

window.setView       = v  => { state.logView = v;                    save(); render(); };
window.toggleShowAll = () => { state.showAllLogs = !state.showAllLogs; save(); render(); };

/* ── Chart ── */
function generateChartSVG(type) {
  if (!state.history || state.history.length === 0)
    return '<div style="text-align:center;padding:16px;color:#475569;font-size:12px;">No activity yet</div>';

  const W=320, H=120, pX=34, pY=20, tP=10, rP=8;
  const plotW = W-pX-rP, plotH = H-pY-tP, bY = H-pY;

  const pts     = [...state.history].slice(-7);
  const maxSecs = Math.max(...pts.map(d => d.seconds), 60);
  const bw      = Math.min(26, (plotW / pts.length) - 4);

  let els='', lbs='', lp=[];

  pts.forEach((d,i) => {
    const x = pts.length===1 ? pX+plotW/2 : pX + (i/(pts.length-1))*plotW;
    const y = bY - ((d.seconds/maxSecs)*plotH);
    lbs += `<text x="${x}" y="${H-3}" font-size="9" fill="#475569" text-anchor="middle">${d.date.split(',')[0]}</text>`;
    if (type==='line') {
      lp.push(`${x},${y}`);
      els += `<circle cx="${x}" cy="${y}" r="3.5" fill="#22272b" stroke="#00bcd4" stroke-width="2"><title>${d.date} ${d.time}: ${formatHMS(d.seconds)}</title></circle>`;
    } else {
      els += `<rect x="${x-bw/2}" y="${y}" width="${bw}" height="${bY-y}" fill="#00bcd4" rx="3" class="chart-bar"><title>${d.date} ${d.time}: ${formatHMS(d.seconds)}</title></rect>`;
    }
  });

  const gc='rgba(255,255,255,0.06)';
  const fmtY = s => s>=3600 ? parseFloat((s/3600).toFixed(1))+'h' : s>=60 ? Math.round(s/60)+'m' : s+'s';
  lbs += `<text x="${pX-5}" y="${tP+4}" font-size="9" fill="#475569" text-anchor="end">${fmtY(maxSecs)}</text>
          <line x1="${pX}" y1="${tP}" x2="${W-rP}" y2="${tP}" stroke="${gc}" stroke-dasharray="3"/>
          <text x="${pX-5}" y="${tP+plotH/2+4}" font-size="9" fill="#475569" text-anchor="end">${fmtY(maxSecs/2)}</text>
          <line x1="${pX}" y1="${tP+plotH/2}" x2="${W-rP}" y2="${tP+plotH/2}" stroke="${gc}" stroke-dasharray="3"/>
          <line x1="${pX}" y1="${bY}" x2="${W-rP}" y2="${bY}" stroke="${gc}"/>`;

  const poly = type==='line' ? `<polyline points="${lp.join(' ')}" fill="none" stroke="#00bcd4" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` : '';
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}">${lbs}${poly}${els}</svg>`;
}

/* ── Render ── */
function render() {
  const pct      = computeProgress();
  const dispPct  = Math.min(100, pct);
  const isOver   = pct > 100;
  const elapsed  = getLiveElapsed();
  const active   = state.data[state.trackingUnit];

  const hasLabel   = cardMeta.labelName.length > 0;
  const labelStyle = hasLabel ? getLabelStyle(cardMeta.labelColor) : '';
  const labelTxt   = hasLabel ? (cardMeta.labelName.length > 14 ? cardMeta.labelName.slice(0,14)+'…' : cardMeta.labelName) : 'No Label';
  const labelCls   = hasLabel ? '' : 'no-label';

  const doneTasks  = (state.tasks || []).filter(t => t.done).length;
  const totalTasks = (state.tasks || []).length;

  const revHistory  = [...(state.history||[])].reverse();
  const logsToShow  = state.showAllLogs ? revHistory : revHistory.slice(0,3);

  const playIcon  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
  const stopIcon  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>`;
  const resetIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>`;

  document.getElementById('root').innerHTML = `
    <div class="card">

      <!-- Header: label + card name -->
      <div class="card-header">
        <span class="header-title">Progress Card</span>
        <span class="label-tag ${labelCls}" style="${labelStyle}">${labelTxt}</span>
      </div>
      <div class="card-name">${cardMeta.name || 'Progress Tracker'}</div>

      <!-- ── Completion ── -->
      <div class="section">
        <div class="completion-row">
          <span class="completion-label">Completion :</span>
          <span class="completion-pct ${isOver ? 'overtime' : ''}" id="pctDisplay">${pct}%</span>
        </div>

        <div class="slider-wrap">
          <div class="slider-track">
            <div class="slider-fill ${isOver ? 'overtime' : ''}" id="progressFill" style="width:${dispPct}%"></div>
          </div>
          <input type="range" min="0" max="100" value="${state.progressSource === 'manual' ? state.manualProgress : dispPct}"
  oninput="onSliderInput(this.value)"
  onchange="onSliderChange(this.value)" />
        </div>

        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
          <button onclick="setProgressSource('manual')" style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:6px;border:none;cursor:pointer;${state.progressSource==='manual'?'background:#00bcd4;color:#002830;':'background:rgba(255,255,255,0.06);color:#64748b;'}">Manual</button>
          <button onclick="setProgressSource('tasks')"  style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:6px;border:none;cursor:pointer;${state.progressSource==='tasks' ?'background:#00bcd4;color:#002830;':'background:rgba(255,255,255,0.06);color:#64748b;'}">From Tasks</button>
          <button onclick="setProgressSource('timer')"  style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:6px;border:none;cursor:pointer;${state.progressSource==='timer' ?'background:#00bcd4;color:#002830;':'background:rgba(255,255,255,0.06);color:#64748b;'}">From Timer</button>
        </div>
      </div>

      <!-- ── ETA ── -->
      <div class="section">
        <div class="section-label">ETA</div>
        <div class="eta-row">
          <span class="eta-pre">ETA :</span>
          <input type="date" class="eta-input" value="${state.etaDate}" onchange="onEtaDateChange(this.value)" />
          <span class="eta-amp">&amp;</span>
          <input type="time" class="eta-input" value="${state.etaTime}" onchange="onEtaTimeChange(this.value)" />
        </div>
      </div>

      <!-- ── Tasks ── -->
      <div class="section">
        <div class="section-label">Tasks ${totalTasks > 0 ? `<span style="color:#00bcd4;margin-left:4px;">${doneTasks}/${totalTasks}</span>` : ''}</div>
        <div class="tasks-list">
          ${totalTasks === 0
            ? `<div class="empty-tasks">No tasks yet. Add one below.</div>`
            : state.tasks.map(task => `
              <div class="task-item">
                <div class="task-cb ${task.done ? 'checked' : ''}" onclick="toggleTask('${task.id}')"></div>
                <span class="task-name ${task.done ? 'done' : ''}">${task.name.replace(/</g,'&lt;')}</span>
                <button class="task-del" onclick="deleteTask('${task.id}')" title="Remove">×</button>
              </div>`).join('')
          }
        </div>
        <div class="add-task-row">
          <input id="newTaskInput" class="add-task-input" type="text" placeholder="Add a task…" onkeydown="onNewTaskKey(event)" maxlength="80" />
          <button class="add-task-btn" onclick="addTask()">+</button>
        </div>
      </div>

      <!-- ── Time Tracking ── -->
      <div class="section">
        <div class="section-label">Time Tracking</div>
        <div class="timer-row">
          <div class="timer-label-row">
            <span class="timer-lbl">Time Tracking :</span>
            <span class="timer-display ${state.running ? 'running' : ''}" id="timerDisplay">${formatHM(elapsed)}</span>
          </div>
          <div class="timer-controls">
            ${state.running
              ? `<button class="btn-timer-stop" onclick="toggleTimer()">${stopIcon} Stop</button>`
              : `<button class="btn-timer-start" onclick="toggleTimer()">${playIcon} ${elapsed > 0 ? 'Resume' : 'Start'}</button>`
            }
            <button class="btn-reset" onclick="resetTimer()" title="Reset">${resetIcon}</button>
          </div>
        </div>

        ${state.running && state.trackingUnit !== 'hours'
          ? `<div id="sessionTicker" class="session-ticker">Session: 00:00:00</div>`
          : ''
        }

        <div class="timer-meta">
          <span class="timer-meta-pill">⏱ Elapsed <span>${formatHM(elapsed)}</span></span>
          <span class="timer-meta-pill">🎯 Est
            <input class="est-input" value="${formatHM(active.estimated)}"
              onchange="onEstChange(this.value)"
              onclick="this.select()"
              style="background:transparent;border:none;color:#00bcd4;font-family:'SF Mono',monospace;font-size:11px;font-weight:700;width:52px;padding:0;outline:none;cursor:text;"
            />
          </span>
        </div>
      </div>

      <!-- ── Activity Log ── -->
      ${state.history && state.history.length > 0 ? `
      <div class="section">
        <div class="history-header">
          <span class="section-label" style="margin:0;">Activity Log</span>
          <div class="view-toggle">
            <button class="view-btn ${state.logView==='list'?'active':''}" onclick="setView('list')">List</button>
            <button class="view-btn ${state.logView==='line'?'active':''}" onclick="setView('line')">Line</button>
            <button class="view-btn ${state.logView==='bar' ?'active':''}" onclick="setView('bar')">Bar</button>
          </div>
        </div>
        ${state.logView === 'list' ? `
          <div class="history-list">
            ${logsToShow.map(h => {
              const badge = h.unit ? `<span class="unit-badge">${UNIT_LABELS[h.unit]||h.unit}</span>` : '';
              return `<div class="history-item">
                <span>${h.date} at ${h.time}${badge}</span>
                <span class="val">+${formatHMS(h.seconds)}</span>
              </div>`;
            }).join('')}
            ${state.history.length > 3 ? `
              <button class="show-more-btn" onclick="toggleShowAll()">
                ${state.showAllLogs ? 'Show Less ▲' : 'Show More ▼'}
              </button>` : ''}
          </div>
        ` : generateChartSVG(state.logView)}
      </div>` : ''}

      <!-- Bottom progress bar -->
      <div class="bottom-bar">
        <div class="bottom-bar-fill ${isOver ? 'overtime' : ''}" id="bottomBarFill" style="width:${dispPct}%"></div>
      </div>

    </div>
  `;

  setTimeout(() => { try { t.sizeTo(document.body); } catch(e) {} }, 50);
}

/* ── Progress source toggle ── */
window.setProgressSource = function(source) {
  state.progressSource = source;
  if (source === 'manual') {
    // Sync slider to current computed value before switching
    state.manualProgress = computeProgress();
  }
  save();
  render();
};