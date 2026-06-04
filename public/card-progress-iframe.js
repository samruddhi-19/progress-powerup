const TRELLO_API_KEY = "58a903ef47a68cf462fd91ad5101444e";

const t = TrelloPowerUp.iframe({
  appKey: TRELLO_API_KEY,
  appName: 'Progress Tracker'
});

const UNIT_RATES = {
  hours: 3600, days: 86400, weeks: 604800, months: 2592000
};

const CALENDAR_UNITS = {
  days:   ['1 Day','2 Days','3 Days','4 Days','5 Days','6 Days','7 Days'],
  weeks:  ['1 Week','2 Weeks','3 Weeks','4 Weeks'],
  months: ['1 Month','2 Months','3 Months','4 Months','5 Months','6 Months',
           '7 Months','8 Months','9 Months','10 Months','11 Months','12 Months']
};

const UNIT_LABELS = { hours: 'Session', days: 'Daily', weeks: 'Weekly', months: 'Monthly' };

let state = {
  running: false,
  startTime: null,
  focusMode: false,
  trackingUnit: 'hours',
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

// Card meta fetched from Trello
let cardMeta = { name: '', labelName: '', labelColor: '', dueDate: null, checklists: [] };

let timer = null;

/* ── Formatters ── */
function formatHMS(seconds) {
  const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatHM(seconds) {
  const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  return `${h}:${m}`;
}

function formatETA(dueDate) {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const day = d.getDate();
  const month = months[d.getMonth()];
  let hours = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `ETA: ${day} ${month}, ${hours}:${mins} ${ampm}`;
}

function getLabelBg(color) {
  const map = {
    blue: '#0079bf', sky: '#00c2e0', lime: '#51e898', green: '#61bd4f',
    yellow: '#f2d600', orange: '#ff9f1a', red: '#eb5a46', pink: '#ff78cb',
    purple: '#c377e0', null: '#00bcd4', '': '#00bcd4'
  };
  return map[color] || '#00bcd4';
}

function getLabelTextColor(color) {
  const light = ['yellow', 'lime', 'sky'];
  return light.includes(color) ? '#002830' : '#ffffff';
}

/* ── Fetch card meta (name, label, due date, checklists) ── */
async function fetchCardMeta() {
  try {
    const card = await t.card('name', 'labels', 'due', 'checklists');
    cardMeta.name = card.name || '';
    
    if (card.labels && card.labels.length > 0) {
      const lbl = card.labels[0];
      cardMeta.labelName  = lbl.name  || lbl.color || 'Label';
      cardMeta.labelColor = lbl.color || '';
    } else {
      cardMeta.labelName  = '';
      cardMeta.labelColor = '';
    }

    cardMeta.dueDate = card.due || null;

    // Get first incomplete checklist item as subtask hint
    cardMeta.subTask = '';
    if (card.checklists && card.checklists.length > 0) {
      for (const cl of card.checklists) {
        const incomplete = (cl.checkItems || []).find(i => i.state === 'incomplete');
        if (incomplete) {
          cardMeta.subTask = 'Sub Task: ' + incomplete.name;
          break;
        }
      }
    }
  } catch (e) {
    // Graceful fallback
  }
}

/* ── Render input for elapsed/estimated ── */
function renderInput(id, isElapsed, val) {
  if (state.trackingUnit === 'hours') {
    if (isElapsed) {
      return `<span id="${id}">${formatHM(val)}</span>`;
    }
    return `<input id="${id}" class="est-input" value="${formatHM(val)}" title="HH:MM" />`;
  }

  const options = CALENDAR_UNITS[state.trackingUnit];
  const rate    = UNIT_RATES[state.trackingUnit];
  let currentIndex = Math.max(0, Math.floor(val / rate) - 1);
  if (currentIndex >= options.length) currentIndex = options.length - 1;

  const disabled = state.running ? 'disabled' : '';
  let html = `<select id="${id}" class="time-select" ${disabled}>`;
  if (isElapsed && val === 0) html += `<option value="0" selected>--</option>`;
  options.forEach((opt, idx) => {
    const optVal = (idx + 1) * rate;
    const selected = (val > 0 && currentIndex === idx) ? 'selected' : '';
    html += `<option value="${optVal}" ${selected}>${opt}</option>`;
  });
  html += `</select>`;
  return html;
}

/* ── Chart ── */
function generateChartSVG(type) {
  if (state.history.length === 0) {
    return '<div style="text-align:center;padding:20px;color:#475569;font-size:12px;">No activity yet</div>';
  }

  const width = 320, height = 130, pX = 36, pY = 22, topP = 12, rightP = 10;
  const plotW = width - pX - rightP, plotH = height - pY - topP, bottomY = height - pY;

  let dataPoints = [...state.history].slice(-7);
  const maxSecs  = Math.max(...dataPoints.map(d => d.seconds), 60);

  let elementsHTML = '', labelsHTML = '', linePoints = [];
  const barWidth = Math.min(28, (plotW / dataPoints.length) - 4);

  dataPoints.forEach((d, i) => {
    const x = dataPoints.length === 1
      ? pX + plotW / 2
      : pX + (i / (dataPoints.length - 1)) * plotW;
    const y = bottomY - ((d.seconds / maxSecs) * plotH);

    const shortDate = d.date.split(',')[0];
    labelsHTML += `<text x="${x}" y="${height - 4}" font-size="9" fill="#475569" text-anchor="middle">${shortDate}</text>`;

    if (type === 'line') {
      linePoints.push(`${x},${y}`);
      elementsHTML += `<circle cx="${x}" cy="${y}" r="3.5" fill="#22272b" stroke="#00bcd4" stroke-width="2"><title>${d.date} ${d.time}: ${formatHMS(d.seconds)}</title></circle>`;
    } else {
      elementsHTML += `<rect x="${x - barWidth/2}" y="${y}" width="${barWidth}" height="${bottomY - y}" fill="#00bcd4" rx="3" class="chart-bar"><title>${d.date} ${d.time}: ${formatHMS(d.seconds)}</title></rect>`;
    }
  });

  function fmtY(s) {
    if (s >= 3600) return parseFloat((s/3600).toFixed(1)) + 'h';
    if (s >= 60)   return Math.round(s/60) + 'm';
    return s + 's';
  }

  const gridColor = 'rgba(255,255,255,0.06)';
  labelsHTML += `
    <text x="${pX-6}" y="${topP+4}" font-size="9" fill="#475569" text-anchor="end">${fmtY(maxSecs)}</text>
    <line x1="${pX}" y1="${topP}" x2="${width-rightP}" y2="${topP}" stroke="${gridColor}" stroke-width="1" stroke-dasharray="3"/>
    <text x="${pX-6}" y="${topP+plotH/2+4}" font-size="9" fill="#475569" text-anchor="end">${fmtY(maxSecs/2)}</text>
    <line x1="${pX}" y1="${topP+plotH/2}" x2="${width-rightP}" y2="${topP+plotH/2}" stroke="${gridColor}" stroke-width="1" stroke-dasharray="3"/>
    <line x1="${pX}" y1="${bottomY}" x2="${width-rightP}" y2="${bottomY}" stroke="${gridColor}" stroke-width="1"/>`;

  const polyline = type === 'line'
    ? `<polyline points="${linePoints.join(' ')}" fill="none" stroke="#00bcd4" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
    : '';

  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}">${labelsHTML}${polyline}${elementsHTML}</svg>`;
}

/* ── Load ── */
async function load() {
  await fetchCardMeta();

  const card = (await t.get("card", "shared")) || {};

  state.running      = card.running      || false;
  state.startTime    = card.startTime    || null;
  state.focusMode    = card.focusMode    || false;
  state.trackingUnit = card.trackingUnit || 'hours';
  state.logView      = card.logView      || 'list';
  state.showAllLogs  = card.showAllLogs  || false;
  state.history      = card.history      || [];

  if (card.data) {
    state.data = card.data;
  } else if (card.estimated !== undefined) {
    state.data.hours.elapsed   = card.elapsed   || 0;
    state.data.hours.estimated = card.estimated || 8 * 3600;
  }

  render();

  if (state.running) {
    startTick();
  } else {
    const mode = await t.get("board", "shared", "autoTrackMode");
    if (mode === "open" || mode === "both") {
      state.running   = true;
      state.startTime = Date.now();
      startTick();
      const autoFocus = await t.get("board", "shared", "autoFocus");
      if (autoFocus) {
        state.focusMode = true;
        t.set("card", "shared", "focusMode", true);
      }
      save();
      render();
    }
  }

  setTimeout(() => t.sizeTo(document.body).done(), 40);
}

load();

function save() { t.set("card", "shared", state); }

/* ── Tick ── */
function startTick() {
  if (timer) return;
  timer = setInterval(() => {
    if (!state.running) return;

    const sessionSecs = Math.floor((Date.now() - state.startTime) / 1000);

    if (state.trackingUnit === 'hours') {
      const live = state.data.hours.elapsed + sessionSecs;
      const el   = document.getElementById("elapsedDisplay");
      if (el) el.textContent = formatHM(live);

      // Update big timer in top-right
      const timerEl = document.getElementById("liveTimerDisplay");
      if (timerEl) timerEl.textContent = formatHM(live);
    } else {
      const ticker = document.getElementById("liveSessionTicker");
      if (ticker) ticker.textContent = "Session: " + formatHMS(sessionSecs);
    }

    const est     = state.data[state.trackingUnit].estimated || 1;
    const total   = state.data[state.trackingUnit].elapsed + sessionSecs;
    const pct     = Math.min(100, Math.round((total / est) * 100));
    const fill    = document.getElementById("progressBarFill");
    const pctVal  = document.getElementById("pctValue");

    if (fill) {
      fill.style.width = pct + "%";
      if (total > est) fill.classList.add('overtime'); else fill.classList.remove('overtime');
    }
    if (pctVal) pctVal.textContent = pct + "%";
  }, 1000);
}

function stopSession() {
  if (!state.running) return;
  const sessionSeconds = Math.floor((Date.now() - state.startTime) / 1000);
  state.data[state.trackingUnit].elapsed += sessionSeconds;
  state.running   = false;
  state.focusMode = false;
  t.set("card", "shared", "focusMode", false);

  if (sessionSeconds > 5) {
    const startDate = new Date(state.startTime);
    state.history.push({
      date:    startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      time:    startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      seconds: sessionSeconds,
      unit:    state.trackingUnit
    });
    if (state.history.length > 20) state.history.shift();
  }

  state.startTime = null;
  clearInterval(timer);
  timer = null;
}

/* ── Calendar sync ── */
async function syncTrelloDueDate(estimatedSeconds) {
  try {
    const targetDate = new Date(Date.now() + estimatedSeconds * 1000);
    const card       = await t.card('id');
    const isAuth     = await t.getRestApi().isAuthorized();
    if (!isAuth) {
      await t.getRestApi().authorize({ scope: 'read,write', expiration: 'never' });
    }
    const token = await t.getRestApi().getToken();
    if (!token) return;
    await fetch(`https://api.trello.com/1/cards/${card.id}?key=${TRELLO_API_KEY}&token=${token}&due=${targetDate.toISOString()}`, { method: 'PUT' });
  } catch (err) {
    console.error("Failed to sync due date:", err);
  }
}

/* ── Toggle ── */
function toggleTimer() {
  if (state.running) {
    stopSession();
  } else {
    state.running   = true;
    state.startTime = Date.now();
    startTick();
    if (state.trackingUnit !== 'hours') {
      syncTrelloDueDate(state.data[state.trackingUnit].estimated);
    }
  }
  save();
  render();
}

function handleReset() {
  state.data[state.trackingUnit].elapsed = 0;
  state.running   = false;
  state.startTime = null;
  state.focusMode = false;
  t.set("card", "shared", "focusMode", false);
  if (timer) { clearInterval(timer); timer = null; }
  save();
  render();
}

window.setView      = v  => { state.logView = v; save(); render(); };
window.toggleShowAll = () => { state.showAllLogs = !state.showAllLogs; save(); render(); };

/* ── Render ── */
function render() {
  const activeData = state.data[state.trackingUnit];

  let liveElapsed = activeData.elapsed;
  if (state.running && state.trackingUnit === 'hours') {
    liveElapsed += Math.floor((Date.now() - state.startTime) / 1000);
  }

  const est        = activeData.estimated || 1;
  const rawPct     = Math.round((liveElapsed / est) * 100);
  const displayPct = Math.min(100, rawPct);
  const isOvertime = liveElapsed > est;

  // Display timer: elapsed if hours, else "00:00"
  const timerText = state.trackingUnit === 'hours'
    ? formatHM(liveElapsed)
    : formatHM(activeData.elapsed);

  // Label tag
  const hasLabel = cardMeta.labelName && cardMeta.labelName.length > 0;
  const labelBg  = hasLabel ? getLabelBg(cardMeta.labelColor) : '';
  const labelTxt = hasLabel ? (cardMeta.labelName.length > 12 ? cardMeta.labelName.slice(0,12)+'…' : cardMeta.labelName) : 'No Label';
  const labelCls = hasLabel ? '' : 'no-label';
  const labelStyle = hasLabel ? `style="background:${labelBg};color:${getLabelTextColor(cardMeta.labelColor)};"` : '';

  // Pills
  const etaText  = formatETA(cardMeta.dueDate);
  const subText  = cardMeta.subTask || '';

  // Btn
  const isRunning  = state.running;
  const btnText    = isRunning ? 'Stop Timer' : (liveElapsed > 0 ? 'Resume Timer' : 'Start Timer');
  const playIcon   = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
  const stopIcon   = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>`;
  const resetIcon  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>`;

  const reversedHistory = [...state.history].reverse();
  const logsToDisplay   = state.showAllLogs ? reversedHistory : reversedHistory.slice(0, 3);

  document.getElementById("root").innerHTML = `
    <div class="progress-card">

      <!-- Top row: Label + Timer -->
      <div class="top-row">
        <span class="label-tag ${labelCls}" ${labelStyle}>${labelTxt}</span>
        <span class="live-timer ${isRunning ? 'running' : ''}" id="liveTimerDisplay">${timerText}</span>
      </div>

      <!-- Card title -->
      <div class="card-title">${cardMeta.name || 'Progress Tracker'}</div>

      <!-- ETA + SubTask pills -->
      ${(etaText || subText) ? `
      <div class="pills-row">
        ${etaText  ? `<span class="pill eta">📅 ${etaText}</span>` : ''}
        ${subText  ? `<span class="pill subtask">☑ ${subText}</span>` : ''}
      </div>` : ''}

      <!-- Progress % label -->
      <div class="pct-row">
        <span class="pct-status ${isOvertime ? 'overtime' : ''}">${isOvertime ? 'Overtime' : 'Progress'}</span>
        <span class="pct-value ${isOvertime ? 'overtime' : ''}" id="pctValue">${rawPct}%</span>
      </div>

      <!-- Cyan progress bar flush to bottom -->
      <div class="progress-track">
        <div id="progressBarFill" class="progress-fill ${isOvertime ? 'overtime' : ''}" style="width:${displayPct}%"></div>
      </div>

      <!-- Divider -->
      <div class="divider"></div>

      <!-- Controls -->
      <div class="controls-section">
        <div class="controls-row">
          <button id="btnToggle" class="btn ${isRunning ? 'btn-stop' : 'btn-start'}">
            ${isRunning ? stopIcon : playIcon} ${btnText}
          </button>
          <button id="btnReset" class="btn btn-icon" title="Reset">${resetIcon}</button>
        </div>

        <!-- Metrics -->
        <div class="metrics-row">
          <div class="metric">
            <span class="metric-label">Elapsed</span>
            <span class="metric-value cyan" id="elapsedDisplay">${
              state.trackingUnit === 'hours' ? formatHM(liveElapsed) : renderInput('_el', true, liveElapsed)
            }</span>
          </div>
          <div class="metric">
            <span class="metric-label">Estimate</span>
            <span class="metric-value">${renderInput('estimatedInput', false, activeData.estimated)}</span>
          </div>
          <div class="metric">
            <span class="metric-label">Unit</span>
            <select id="unitSelect" class="unit-picker" ${isRunning ? 'disabled' : ''}>
              <option value="hours"  ${state.trackingUnit==='hours'  ?'selected':''}>Hours</option>
              <option value="days"   ${state.trackingUnit==='days'   ?'selected':''}>Days</option>
              <option value="weeks"  ${state.trackingUnit==='weeks'  ?'selected':''}>Weeks</option>
              <option value="months" ${state.trackingUnit==='months' ?'selected':''}>Months</option>
            </select>
          </div>
        </div>

        ${(isRunning && state.trackingUnit !== 'hours') ? `
          <div id="liveSessionTicker" class="session-ticker">Session: 00:00:00</div>
        ` : ''}
      </div>

      <!-- Activity Log -->
      ${state.history.length > 0 ? `
      <div class="history-section">
        <div class="history-header">
          <span class="history-title">Activity Log</span>
          <div class="view-toggle">
            <button class="view-btn ${state.logView==='list'?'active':''}" onclick="setView('list')">List</button>
            <button class="view-btn ${state.logView==='line'?'active':''}" onclick="setView('line')">Line</button>
            <button class="view-btn ${state.logView==='bar' ?'active':''}" onclick="setView('bar')">Bar</button>
          </div>
        </div>
        ${state.logView === 'list' ? `
          <div class="history-list">
            ${logsToDisplay.map(h => {
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

    </div>
  `;

  /* ── Bind events ── */
  document.getElementById("btnToggle").onclick = toggleTimer;
  document.getElementById("btnReset").onclick  = handleReset;

  const unitSel = document.getElementById("unitSelect");
  if (unitSel) unitSel.onchange = e => { state.trackingUnit = e.target.value; save(); render(); };

  const estInput = document.getElementById("estimatedInput");
  if (estInput) {
    if (estInput.tagName === 'SELECT') {
      estInput.onchange = e => {
        state.data[state.trackingUnit].estimated = parseInt(e.target.value, 10) || UNIT_RATES[state.trackingUnit];
        save(); render();
      };
    } else {
      estInput.onchange = e => {
        const parts = e.target.value.trim().split(":").map(Number);
        let h=0, m=0;
        if (parts.length >= 2) { h = parts[0]; m = parts[1]; }
        else if (parts.length === 1) { h = parts[0]; }
        const total = h * 3600 + m * 60;
        if (!isNaN(total) && total > 0) {
          state.data.hours.estimated = total;
          save(); render();
        } else {
          e.target.value = formatHM(state.data.hours.estimated);
        }
      };
    }
  }

  setTimeout(() => t.sizeTo(document.body).done(), 50);
}