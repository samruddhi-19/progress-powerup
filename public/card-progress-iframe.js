const TRELLO_API_KEY = "93b1fabac6fe3f9a688c9b4cc836f97d";

const t = TrelloPowerUp.iframe({
  appKey: TRELLO_API_KEY,
  appName: 'Progress Tracker'
});

const UNIT_LABELS = { hours: 'Session', days: 'Daily', weeks: 'Weekly', months: 'Monthly' };

let state = {
  trackingUnit: 'hours',
  running: false,
  startTime: null,
  focusMode: false,
  manualProgress: 0,
  progressSource: 'tasks',
  etaDate: '',
  etaTime: '',
  tasks: [],
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
  const bg  = map[color] || '#00c9a7';
  const txt = ['yellow', 'lime', 'sky'].includes(color) ? '#002830' : '#ffffff';
  return `background:${bg};color:${txt};`;
}

function computeProgress() {
  if (state.progressSource === 'manual') return state.manualProgress;
  if (state.progressSource === 'tasks') {
    if (!state.tasks || state.tasks.length === 0) return 0;
    const done = state.tasks.filter(tk => tk.done).length;
    return Math.round((done / state.tasks.length) * 100);
  }
  const unit   = state.trackingUnit || 'hours';
  const active = state.data[unit] || { elapsed: 0, estimated: 8 * 3600 };
  let elapsed  = Number(active.elapsed) || 0;
  if (state.running && state.startTime)
    elapsed += Math.floor((Date.now() - state.startTime) / 1000);
  return Math.min(100, Math.round((elapsed / (active.estimated || 1)) * 100));
}

/* FIX: guard against undefined unit bucket and NaN elapsed */
function getLiveElapsed() {
  const unit   = state.trackingUnit || 'hours';
  const active = state.data[unit] || { elapsed: 0 };
  let el = Number(active.elapsed) || 0;
  if (state.running && state.startTime)
    el += Math.floor((Date.now() - state.startTime) / 1000);
  return el;
}

function updateProgressUI(pct) {
  const fill    = document.getElementById('progressFill');
  const botFill = document.getElementById('bottomBarFill');
  const pctEl   = document.getElementById('pctDisplay');
  const isOver  = pct > 100;
  const disp    = Math.min(100, pct);
  if (fill)    { fill.style.width = disp + '%'; fill.className = 'slider-fill' + (isOver ? ' overtime' : ''); }
  if (botFill) { botFill.style.width = disp + '%'; botFill.className = 'bottom-bar-fill' + (isOver ? ' overtime' : ''); }
  if (pctEl)   { pctEl.textContent = pct + '%'; pctEl.className = 'completion-pct' + (isOver ? ' overtime' : ''); }
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
    if (saved.data)    state.data    = saved.data;
    if (saved.history) state.history = saved.history;
    if (saved.tasks)   state.tasks   = saved.tasks;
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

    // Migrate old format
    if (saved.estimated !== undefined && !saved.data) {
      state.data.hours.elapsed   = saved.elapsed   || 0;
      state.data.hours.estimated = saved.estimated || 8 * 3600;
    }

    /* FIX: repair any NaN elapsed values from previous buggy saves */
    ['hours', 'days', 'weeks', 'months'].forEach(u => {
      if (!state.data[u]) state.data[u] = { elapsed: 0, estimated: 8 * 3600 };
      if (isNaN(state.data[u].elapsed))   state.data[u].elapsed   = 0;
      if (isNaN(state.data[u].estimated)) state.data[u].estimated = 8 * 3600;
    });

    /* FIX: if elapsed is 0 but history exists, rebuild elapsed by summing history */
    const unit = state.trackingUnit || 'hours';
    if (state.data[unit].elapsed === 0 && state.history && state.history.length > 0) {
      const rebuilt = state.history
        .filter(h => !h.unit || h.unit === unit)
        .reduce((sum, h) => sum + (Number(h.seconds) || 0), 0);
      if (rebuilt > 0) {
        state.data[unit].elapsed = rebuilt;
        t.set('card', 'shared', 'data', state.data);
      }
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
    const disp = document.getElementById('timerDisplay');
    if (disp) disp.textContent = formatHM(elapsed);
    if (state.trackingUnit !== 'hours') {
      const sessionSec = Math.floor((Date.now() - state.startTime) / 1000);
      const ticker = document.getElementById('sessionTicker');
      if (ticker) ticker.textContent = formatHMS(sessionSec);
    }
    if (state.progressSource === 'timer') updateProgressUI(computeProgress());
  }, 1000);
}

/* FIX: guard against undefined unit bucket and NaN, fix elapsed accumulation */
function stopSession() {
  if (!state.running) return;
  const sessionSec = Math.floor((Date.now() - state.startTime) / 1000);
  if (sessionSec <= 0) { state.running = false; state.startTime = null; return; }

  const unit = state.trackingUnit || 'hours';
  if (!state.data[unit]) state.data[unit] = { elapsed: 0, estimated: 8 * 3600 };
  const prev = Number(state.data[unit].elapsed) || 0;
  state.data[unit].elapsed = prev + sessionSec;

  state.running   = false;
  state.focusMode = false;
  try { t.set('card', 'shared', 'focusMode', false); } catch(e) {}

  if (sessionSec > 5) {
    const d = new Date(state.startTime);
    state.history.push({
      date:    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      time:    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      seconds: sessionSec,
      unit:    unit
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

/* ── Chart ── */
function generateChartSVG(type) {
  if (!state.history || state.history.length === 0)
    return '<div style="text-align:center;padding:16px;color:#4d5868;font-size:12px;">No activity yet</div>';

  const W=320, H=120, pX=34, pY=20, tP=10, rP=8;
  const plotW = W-pX-rP, plotH = H-pY-tP, bY = H-pY;
  const pts = [...state.history].slice(-7);
  const maxSecs = Math.max(...pts.map(d => d.seconds), 60);
  const bw = Math.min(26, (plotW / pts.length) - 4);
  let els='', lbs='', lp=[];

  pts.forEach((d, i) => {
    const x = pts.length===1 ? pX+plotW/2 : pX + (i/(pts.length-1))*plotW;
    const y = bY - ((d.seconds/maxSecs)*plotH);
    lbs += `<text x="${x}" y="${H-3}" font-size="9" fill="#4d5868" text-anchor="middle">${d.date.split(',')[0]}</text>`;
    if (type === 'line') {
      lp.push(`${x},${y}`);
      els += `<circle cx="${x}" cy="${y}" r="3" fill="#1e2328" stroke="#00c9a7" stroke-width="2"><title>${d.date} ${d.time}: ${formatHMS(d.seconds)}</title></circle>`;
    } else {
      els += `<rect x="${x-bw/2}" y="${y}" width="${bw}" height="${bY-y}" fill="#00c9a7" opacity="0.8" rx="3" class="chart-bar"><title>${d.date} ${d.time}: ${formatHMS(d.seconds)}</title></rect>`;
    }
  });

  const gc = 'rgba(255,255,255,0.05)';
  const fmtY = s => s>=3600 ? parseFloat((s/3600).toFixed(1))+'h' : s>=60 ? Math.round(s/60)+'m' : s+'s';
  lbs += `<text x="${pX-5}" y="${tP+4}" font-size="9" fill="#4d5868" text-anchor="end">${fmtY(maxSecs)}</text>
          <line x1="${pX}" y1="${tP}" x2="${W-rP}" y2="${tP}" stroke="${gc}" stroke-dasharray="3"/>
          <text x="${pX-5}" y="${tP+plotH/2+4}" font-size="9" fill="#4d5868" text-anchor="end">${fmtY(maxSecs/2)}</text>
          <line x1="${pX}" y1="${tP+plotH/2}" x2="${W-rP}" y2="${tP+plotH/2}" stroke="${gc}" stroke-dasharray="3"/>
          <line x1="${pX}" y1="${bY}" x2="${W-rP}" y2="${bY}" stroke="${gc}"/>`;

  const poly = type === 'line'
    ? `<polyline points="${lp.join(' ')}" fill="none" stroke="#00c9a7" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`
    : '';
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}">${lbs}${poly}${els}</svg>`;
}

/* ── SVG Icons ── */
const playIcon  = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const stopIcon  = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>`;
const resetIcon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>`;

/* ── Render ── */
function render() {
  const pct     = computeProgress();
  const dispPct = Math.min(100, pct);
  const isOver  = pct > 100;
  const elapsed = getLiveElapsed();
  const active  = state.data[state.trackingUnit];

  const hasLabel   = cardMeta.labelName.length > 0;
  const labelStyle = hasLabel ? getLabelStyle(cardMeta.labelColor) : '';
  const labelTxt   = hasLabel ? (cardMeta.labelName.length > 14 ? cardMeta.labelName.slice(0,14)+'…' : cardMeta.labelName) : 'No Label';
  const labelCls   = hasLabel ? '' : 'no-label';

  const doneTasks  = (state.tasks || []).filter(tk => tk.done).length;
  const totalTasks = (state.tasks || []).length;
  const revHistory = [...(state.history||[])].reverse();
  const logsToShow = state.showAllLogs ? revHistory : revHistory.slice(0, 3);

  const sa = s => state.progressSource === s ? ' active' : '';

  document.getElementById('root').innerHTML = `
    <div class="card">

      <div class="card-header">
        <div class="header-eyebrow">
          <div class="header-dot"></div>
          <span class="header-title">Progress Card</span>
        </div>
        <span class="label-tag ${labelCls}" style="${labelStyle}">${labelTxt}</span>
      </div>

      <div class="card-name">${cardMeta.name || 'Progress Tracker'}</div>

      <!-- Completion -->
      <div class="section">
        <div class="completion-row">
          <span class="completion-label">Completion</span>
          <span class="completion-pct${isOver ? ' overtime' : ''}" id="pctDisplay">${pct}%</span>
        </div>
        <div class="slider-wrap">
          <div class="slider-track">
            <div class="slider-fill${isOver ? ' overtime' : ''}" id="progressFill" style="width:${dispPct}%"></div>
          </div>
          <input id="progressSlider" type="range" min="0" max="100"
            value="${state.progressSource === 'manual' ? state.manualProgress : dispPct}" />
        </div>
        <div class="src-buttons">
          <button data-source="manual" class="src-btn${sa('manual')}">Manual</button>
          <button data-source="tasks"  class="src-btn${sa('tasks')}">From Tasks</button>
          <button data-source="timer"  class="src-btn${sa('timer')}">From Timer</button>
        </div>
      </div>

      <!-- ETA -->
      <div class="section">
        <div class="section-label">ETA</div>
        <div class="eta-row">
          <span class="eta-label">Due</span>
          <input id="etaDate" type="date" class="eta-input" value="${state.etaDate}" />
          <span class="eta-sep">at</span>
          <input id="etaTime" type="time" class="eta-input" value="${state.etaTime}" />
        </div>
      </div>

      <!-- Tasks -->
      <div class="section">
        <div class="section-label">
          Tasks
          ${totalTasks > 0 ? `<span class="count-pill">${doneTasks}/${totalTasks}</span>` : ''}
        </div>
        <div class="tasks-list">
          ${totalTasks === 0
            ? `<div class="empty-tasks">No tasks yet — add one below</div>`
            : state.tasks.map(task => `
              <div class="task-item">
                <div class="task-cb${task.done ? ' checked' : ''}" data-taskid="${task.id}"></div>
                <span class="task-name${task.done ? ' done' : ''}">${task.name.replace(/</g,'&lt;')}</span>
                <button class="task-del" data-delid="${task.id}" title="Remove">×</button>
              </div>`).join('')
          }
        </div>
        <div class="add-task-row">
          <input id="newTaskInput" class="add-task-input" type="text" placeholder="Add a task…" maxlength="80" />
          <button id="addTaskBtn" class="add-task-btn">+</button>
        </div>
      </div>

      <!-- Time Tracking -->
      <div class="section">
        <div class="section-label">Time Tracking</div>
        <div class="timer-main">
          <div class="timer-time">
            <div class="timer-sublabel">Elapsed</div>
            <div class="timer-display${state.running ? ' running' : ''}" id="timerDisplay">${formatHM(elapsed)}</div>
          </div>
          <div class="timer-controls">
            ${state.running
              ? `<button id="timerBtn" class="btn-timer-stop">${stopIcon} Stop</button>`
              : `<button id="timerBtn" class="btn-timer-start">${playIcon} ${elapsed > 0 ? 'Resume' : 'Start'}</button>`
            }
            <button id="resetBtn" class="btn-reset" title="Reset">${resetIcon}</button>
          </div>
        </div>
        ${state.running && state.trackingUnit !== 'hours'
          ? `<div id="sessionTicker" class="session-ticker">00:00:00</div>` : ''}
        <div class="timer-meta">
          <span class="timer-meta-pill">Elapsed <span class="val">${formatHM(elapsed)}</span></span>
          <span class="timer-meta-pill">Target <input id="estInput" class="est-input" value="${formatHM(active.estimated)}" /></span>
        </div>
      </div>

      <!-- Activity Log -->
      ${state.history && state.history.length > 0 ? `
      <div class="section">
        <div class="log-header">
          <div class="section-label" style="margin:0;">Activity Log</div>
          <div class="view-toggle">
            <button data-view="list" class="view-btn${state.logView==='list'?' active':''}">List</button>
            <button data-view="line" class="view-btn${state.logView==='line'?' active':''}">Line</button>
            <button data-view="bar"  class="view-btn${state.logView==='bar' ?' active':''}">Bar</button>
          </div>
        </div>
        ${state.logView === 'list' ? `
          <div class="history-list">
            ${logsToShow.map(h => {
              const badge = h.unit ? `<span class="unit-badge">${UNIT_LABELS[h.unit]||h.unit}</span>` : '';
              return `<div class="history-item">
                <span class="meta">${h.date} · ${h.time}${badge}</span>
                <span class="val">+${formatHMS(h.seconds)}</span>
              </div>`;
            }).join('')}
            ${state.history.length > 3 ? `
              <button id="showMoreBtn" class="show-more-btn">
                ${state.showAllLogs ? '↑ Show less' : '↓ Show more'}
              </button>` : ''}
          </div>
        ` : generateChartSVG(state.logView)}
      </div>` : ''}

      <div class="bottom-bar">
        <div class="bottom-bar-fill${isOver ? ' overtime' : ''}" id="bottomBarFill" style="width:${dispPct}%"></div>
      </div>

    </div>
  `;

  bindEvents();
  setTimeout(() => { try { t.sizeTo(document.body); } catch(e) {} }, 50);
}

/* ── Event bindings ── */
function bindEvents() {

  const slider = document.getElementById('progressSlider');
  if (slider) {
    slider.addEventListener('input', function() {
      state.manualProgress = parseInt(this.value);
      state.progressSource = 'manual';
      updateProgressUI(state.manualProgress);
      save();
    });
    slider.addEventListener('change', function() {
      state.manualProgress = parseInt(this.value);
      state.progressSource = 'manual';
      save(); render();
    });
  }

  document.querySelectorAll('.src-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      state.progressSource = this.dataset.source;
      if (state.progressSource === 'manual') state.manualProgress = computeProgress();
      save(); render();
    });
  });

  const etaDate = document.getElementById('etaDate');
  if (etaDate) etaDate.addEventListener('change', function() {
    state.etaDate = this.value; save();
    if (state.etaDate && state.etaTime)
      syncDueDate(new Date(`${state.etaDate}T${state.etaTime}`).toISOString());
  });

  const etaTime = document.getElementById('etaTime');
  if (etaTime) etaTime.addEventListener('change', function() {
    state.etaTime = this.value; save();
    if (state.etaDate && state.etaTime)
      syncDueDate(new Date(`${state.etaDate}T${state.etaTime}`).toISOString());
  });

  document.querySelectorAll('.task-cb').forEach(cb => {
    cb.addEventListener('click', function() {
      const task = state.tasks.find(tk => tk.id === this.dataset.taskid);
      if (!task) return;
      task.done = !task.done;
      state.progressSource = 'tasks';
      save(); render();
    });
  });

  document.querySelectorAll('.task-del').forEach(btn => {
    btn.addEventListener('click', function() {
      state.tasks = state.tasks.filter(tk => tk.id !== this.dataset.delid);
      save(); render();
    });
  });

  const addBtn = document.getElementById('addTaskBtn');
  if (addBtn) addBtn.addEventListener('click', function() {
    const input = document.getElementById('newTaskInput');
    if (!input) return;
    const name = input.value.trim();
    if (!name) return;
    state.tasks.push({ id: Date.now().toString(), name, done: false });
    state.progressSource = 'tasks';
    input.value = '';
    save(); render();
  });

  const taskInput = document.getElementById('newTaskInput');
  if (taskInput) taskInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') document.getElementById('addTaskBtn').click();
  });

  const timerBtn = document.getElementById('timerBtn');
  if (timerBtn) timerBtn.addEventListener('click', function() {
    if (state.running) { stopSession(); }
    else { state.running = true; state.startTime = Date.now(); startTick(); }
    save(); render();
  });

  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn) resetBtn.addEventListener('click', function() {
    stopSession();
    const unit = state.trackingUnit || 'hours';
    state.data[unit].elapsed = 0;
    state.running = false; state.startTime = null;
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    save(); render();
  });

  const estInput = document.getElementById('estInput');
  if (estInput) {
    estInput.addEventListener('click', function() { this.select(); });
    estInput.addEventListener('change', function() {
      const sec = parseHM(this.value);
      if (sec > 0) { state.data[state.trackingUnit].estimated = sec; save(); }
    });
  }

  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', function() { state.logView = this.dataset.view; save(); render(); });
  });

  const showMoreBtn = document.getElementById('showMoreBtn');
  if (showMoreBtn) showMoreBtn.addEventListener('click', function() {
    state.showAllLogs = !state.showAllLogs; save(); render();
  });
}