// PUT YOUR REAL API KEY HERE:
const TRELLO_API_KEY = "58a903ef47a68cf462fd91ad5101444e"; 

const t = TrelloPowerUp.iframe({
  appKey: TRELLO_API_KEY,
  appName: 'Progress Tracker'
});

const UNIT_RATES = {
  hours: 3600, days: 86400, weeks: 604800, months: 2592000
};

const CALENDAR_UNITS = {
  days: ['1 Day', '2 Days', '3 Days', '4 Days', '5 Days', '6 Days', '7 Days'],
  weeks: ['1 Week', '2 Weeks', '3 Weeks', '4 Weeks'],
  months: ['1 Month', '2 Months', '3 Months', '4 Months', '5 Months', '6 Months', '7 Months', '8 Months', '9 Months', '10 Months', '11 Months', '12 Months']
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
    hours: { elapsed: 0, estimated: 8 * 3600 },
    days: { elapsed: 0, estimated: 86400 * 5 }, 
    weeks: { elapsed: 0, estimated: 604800 * 4 }, 
    months: { elapsed: 0, estimated: 2592000 * 12 } 
  },
  history: [] 
};

let timer = null;

function formatDisplay(seconds, unit) {
  if (unit === 'hours') {
    const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
    const sec = String(seconds % 60).padStart(2, "0");
    return `${h}:${m}:${sec}`;
  }
  return ""; 
}

// Rewritten Graph Generator with Axes, Tooltips, and Gridlines
function generateChartSVG(type) {
  if (state.history.length === 0) return '<div style="text-align:center; padding: 20px; color: var(--text-muted);">No activity yet</div>';
  
  const width = 350, height = 140, pX = 40, pY = 25, topP = 15, rightP = 15;
  const plotW = width - pX - rightP, plotH = height - pY - topP, bottomY = height - pY;
  
  let dataPoints = [...state.history].slice(-7); 
  const maxSecs = Math.max(...dataPoints.map(d => d.seconds), 60); 
  
  let elementsHTML = '', labelsHTML = '', linePoints = [];
  const barWidth = Math.min(30, (plotW / dataPoints.length) - 5);
  
  dataPoints.forEach((d, i) => {
    const x = dataPoints.length === 1 ? pX + plotW/2 : pX + (i / (dataPoints.length - 1)) * plotW;
    const y = bottomY - ((d.seconds / maxSecs) * plotH);
    
    const shortDate = d.date.split(',')[0]; 
    labelsHTML += `<text x="${x}" y="${height - 5}" font-size="10" fill="var(--text-muted)" text-anchor="middle">${shortDate}</text>`;
    
    if (type === 'line') {
      linePoints.push(`${x},${y}`);
      elementsHTML += `<circle cx="${x}" cy="${y}" r="4" fill="var(--bg-panel)" stroke="var(--color-primary)" stroke-width="2" style="cursor:help;"><title>${d.date} at ${d.time} (${UNIT_LABELS[d.unit] || 'Session'}): ${formatDisplay(d.seconds, 'hours')}</title></circle>`;
    } else if (type === 'bar') {
      elementsHTML += `<rect x="${x - barWidth/2}" y="${y}" width="${barWidth}" height="${bottomY - y}" fill="var(--color-primary)" rx="3" class="chart-bar" style="cursor:help;"><title>${d.date} at ${d.time} (${UNIT_LABELS[d.unit] || 'Session'}): ${formatDisplay(d.seconds, 'hours')}</title></rect>`;
    }
  });

  function formatY(secs) {
    if (secs >= 3600) return parseFloat((secs / 3600).toFixed(1)) + 'h';
    if (secs >= 60) return Math.round(secs / 60) + 'm';
    return secs + 's';
  }

  labelsHTML += `<text x="${pX - 8}" y="${topP + 4}" font-size="10" fill="var(--text-muted)" text-anchor="end">${formatY(maxSecs)}</text><line x1="${pX}" y1="${topP}" x2="${width - rightP}" y2="${topP}" stroke="var(--border-color)" stroke-width="1" stroke-dasharray="4" />`;
  const midY = topP + plotH/2;
  labelsHTML += `<text x="${pX - 8}" y="${midY + 4}" font-size="10" fill="var(--text-muted)" text-anchor="end">${formatY(maxSecs/2)}</text><line x1="${pX}" y1="${midY}" x2="${width - rightP}" y2="${midY}" stroke="var(--border-color)" stroke-width="1" stroke-dasharray="4" />`;
  labelsHTML += `<text x="${pX - 8}" y="${bottomY + 4}" font-size="10" fill="var(--text-muted)" text-anchor="end">0</text><line x1="${pX}" y1="${bottomY}" x2="${width - rightP}" y2="${bottomY}" stroke="var(--border-color)" stroke-width="1" />`;

  let polylineHTML = type === 'line' ? `<polyline points="${linePoints.join(' ')}" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />` : '';

  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}">${labelsHTML}${polylineHTML}${elementsHTML}</svg>`;
}

function renderInput(id, isElapsed, val) {
  if (state.trackingUnit === 'hours') {
    if (isElapsed) {
      return `<div id="${id}" class="time-display">${formatDisplay(val, 'hours')}</div>`;
    }
    return `<input id="${id}" class="time-input" value="${formatDisplay(val, 'hours')}" />`;
  }

  const options = CALENDAR_UNITS[state.trackingUnit];
  const rate = UNIT_RATES[state.trackingUnit];
  let currentIndex = Math.max(0, Math.floor(val / rate) - 1);
  if (currentIndex >= options.length) currentIndex = options.length - 1;

  const disabled = state.running ? 'disabled' : '';

  let html = `<select id="${id}" class="time-select" ${disabled}>`;
  if (isElapsed && val === 0) html += `<option value="0" selected>--</option>`;
  
  options.forEach((opt, idx) => {
    const optionValue = (idx + 1) * rate;
    const selected = (val > 0 && currentIndex === idx) ? 'selected' : '';
    html += `<option value="${optionValue}" ${selected}>${opt}</option>`;
  });
  
  html += `</select>`;
  return html;
}

async function load() {
  const card = (await t.get("card", "shared")) || {};
  
  state.running = card.running || false;
  state.startTime = card.startTime || null;
  state.focusMode = card.focusMode || false;
  state.trackingUnit = card.trackingUnit || 'hours';
  state.logView = card.logView || 'list';
  state.showAllLogs = card.showAllLogs || false;
  state.history = card.history || [];

  if (card.data) {
    state.data = card.data;
  } else if (card.estimated !== undefined) {
    state.data.hours.elapsed = card.elapsed || 0;
    state.data.hours.estimated = card.estimated || 8 * 3600;
  }

  render();
  
  if (state.running) {
    startTick();
  } else {
    // RESTORED: Auto-Tracking "On Card Open" Logic
    const mode = await t.get("board", "shared", "autoTrackMode");
    if (mode === "open" || mode === "both") {
      state.running = true;
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

function save() {
  t.set("card", "shared", state);
}

function startTick() {
  if (timer) return;
  timer = setInterval(() => {
    if (state.running) {
      const now = Date.now();
      const sessionSecs = Math.floor((now - state.startTime) / 1000);
      
      if (state.trackingUnit === 'hours') {
        const live = state.data.hours.elapsed + sessionSecs;
        const el = document.getElementById("elapsedInput");
        if (el) el.textContent = formatDisplay(live, 'hours');
      } else {
        const ticker = document.getElementById("liveSessionTicker");
        if (ticker) ticker.textContent = "Session: " + formatDisplay(sessionSecs, 'hours');
      }
      
      const est = state.data[state.trackingUnit].estimated || 1;
      const liveTotal = state.data[state.trackingUnit].elapsed + sessionSecs;
      const pct = Math.min(100, Math.round((liveTotal / est) * 100));
      
      const fill = document.getElementById("progressBarFill");
      if (fill) {
        fill.style.width = pct + "%";
        if (liveTotal > est) fill.classList.add('overtime');
      }
    }
  }, 1000);
}

function stopSession() {
  if (!state.running) return;
  
  const now = Date.now();
  const sessionSeconds = Math.floor((now - state.startTime) / 1000);
  
  state.data[state.trackingUnit].elapsed += sessionSeconds;
  state.running = false;
  state.focusMode = false;
  t.set("card", "shared", "focusMode", false);

  if (sessionSeconds > 5) { 
    const startDate = new Date(state.startTime);
    const record = {
      date: startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      time: startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      seconds: sessionSeconds,
      unit: state.trackingUnit
    };
    
    state.history.push(record);
    if (state.history.length > 20) state.history.shift(); 
  }
  
  state.startTime = null;
  clearInterval(timer);
  timer = null;
}


// --- UPGRADED CALENDAR SYNC LOGIC ---
async function syncTrelloDueDate(estimatedSeconds) {
  try {
    const targetDate = new Date(Date.now() + estimatedSeconds * 1000);
    const card = await t.card('id');

    // 1. Check authorization status. If not authorized, force the Trello Auth Popup!
    const isAuth = await t.getRestApi().isAuthorized();
    if (!isAuth) {
      await t.getRestApi().authorize({
        scope: 'read,write',
        expiration: 'never'
      });
    }

    // 2. Grab the authorized token
    const token = await t.getRestApi().getToken();
    if (!token) {
      console.warn("User canceled authorization.");
      return; 
    }

    // 3. Send the updated Due Date to Trello
    const response = await fetch(`https://api.trello.com/1/cards/${card.id}?key=${TRELLO_API_KEY}&token=${token}&due=${targetDate.toISOString()}`, {
      method: 'PUT'
    });

    if (response.ok) {
      console.log("✅ Due Date successfully synced to Trello!");
      // Trello quirk: To force the UI to show the new date badge immediately, 
      // we can trigger a minor alert or just let the user see it when they close/reopen.
    } else {
      console.error("❌ Trello API Error:", await response.text());
    }

  } catch (err) {
    console.error("Failed to sync due date:", err);
  }
}

function toggleTimer() {
  if (state.running) {
    stopSession();
  } else {
    state.running = true;
    state.startTime = Date.now();
    startTick();
    
    // --> TRIGGER CALENDAR SYNC HERE <--
    // We only sync Days/Weeks/Months. (Hours are too short for a calendar event)
    if (state.trackingUnit !== 'hours') {
      syncTrelloDueDate(state.data[state.trackingUnit].estimated);
    }
  }
  save();
  render();
}

function handleReset() {
  state.data[state.trackingUnit].elapsed = 0;
  state.running = false;
  state.startTime = null;
  state.focusMode = false;
  t.set("card", "shared", "focusMode", false);
  if (timer) { clearInterval(timer); timer = null; }
  save();
  render();
}

window.setView = function(view) {
  state.logView = view;
  save();
  render();
};

window.toggleShowAll = function() {
  state.showAllLogs = !state.showAllLogs;
  save();
  render();
};

function render() {
  const activeData = state.data[state.trackingUnit];
  
  let liveElapsed = activeData.elapsed;
  if (state.running && state.trackingUnit === 'hours') {
    liveElapsed += Math.floor((Date.now() - state.startTime) / 1000);
  }

  const est = activeData.estimated || 1;
  const rawPct = Math.round((liveElapsed / est) * 100);
  const displayPct = Math.min(100, rawPct);
  const isOvertime = liveElapsed > est;

  const btnText = state.running ? "Stop Timer" : (liveElapsed > 0 ? "Resume Timer" : "Start Timer");
  const playIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
  const stopIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>`;
  const resetIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>`;
  const clockIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>`;

  const reversedHistory = [...state.history].reverse();
  const logsToDisplay = state.showAllLogs ? reversedHistory : reversedHistory.slice(0, 3);

  document.getElementById("root").innerHTML = `
    <div class="tracker-card">
      
      <div class="header-row">
        <div class="title">${clockIcon} Progress Tracker</div>
        <select id="unitSelect" class="unit-picker" ${state.running ? 'disabled' : ''}>
          <option value="hours" ${state.trackingUnit === 'hours' ? 'selected' : ''}>Hourly</option>
          <option value="days" ${state.trackingUnit === 'days' ? 'selected' : ''}>Daily</option>
          <option value="weeks" ${state.trackingUnit === 'weeks' ? 'selected' : ''}>Weekly</option>
          <option value="months" ${state.trackingUnit === 'months' ? 'selected' : ''}>Monthly</option>
        </select>
      </div>

      <div class="data-row">
        <div class="data-block">
          <span class="label">Elapsed</span>
          ${renderInput('elapsedInput', true, liveElapsed)}
        </div>
        <div class="data-block right">
          <span class="label">Estimate</span>
          ${renderInput('estimatedInput', false, activeData.estimated)}
        </div>
      </div>

      <div>
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <span class="label" style="color: ${isOvertime ? 'var(--color-danger)' : 'var(--text-muted)'}">
            ${isOvertime ? 'Overtime' : 'Completion'}
          </span>
          <span class="label" style="color: var(--text-main); font-family: monospace; font-size: 13px;">${rawPct}%</span>
        </div>
        <div class="progress-container">
          <div id="progressBarFill" class="progress-fill ${isOvertime ? 'overtime' : ''}" style="width: ${displayPct}%"></div>
        </div>
      </div>

      ${(state.running && state.trackingUnit !== 'hours') ? `
        <div id="liveSessionTicker" class="session-ticker">
          Session: 00:00:00
        </div>
      ` : ''}

      <div class="controls-row">
        <button id="btnToggle" class="btn btn-primary ${state.running ? 'is-running' : ''}">
          ${state.running ? stopIcon : playIcon} ${btnText}
        </button>
        <button id="btnReset" class="btn btn-icon" title="Reset Data">
          ${resetIcon}
        </button>
      </div>

      ${state.history.length > 0 ? `
        <div class="history-section">
          <div class="log-header">
            <span class="label">Activity Log</span>
            <div class="view-toggle">
              <button class="view-btn ${state.logView === 'list' ? 'active' : ''}" onclick="setView('list')">List</button>
              <button class="view-btn ${state.logView === 'line' ? 'active' : ''}" onclick="setView('line')">Line</button>
              <button class="view-btn ${state.logView === 'bar' ? 'active' : ''}" onclick="setView('bar')">Bar</button>
            </div>
          </div>
          
          ${state.logView === 'list' ? `
            <div class="history-list">
              ${logsToDisplay.map(h => {
                const unitBadge = h.unit ? `<span class="unit-badge">${UNIT_LABELS[h.unit] || h.unit}</span>` : '';
                return `
                <div class="history-item">
                  <span>${h.date} at ${h.time} ${unitBadge}</span>
                  <span class="val">+${formatDisplay(h.seconds, 'hours')}</span>
                </div>`;
              }).join('')}
              ${state.history.length > 3 ? `
                <button class="show-more-btn" onclick="toggleShowAll()">
                  ${state.showAllLogs ? 'Show Less' : 'Show More'}
                </button>
              ` : ''}
            </div>
          ` : `
            ${generateChartSVG(state.logView)}
          `}
        </div>
      ` : ''}

    </div>
  `;

  document.getElementById("btnToggle").onclick = toggleTimer;
  document.getElementById("btnReset").onclick = handleReset;

  const unitSelect = document.getElementById("unitSelect");
  if (unitSelect) {
    unitSelect.onchange = (e) => {
      state.trackingUnit = e.target.value;
      save();
      render(); 
    };
  }

  const elInput = document.getElementById("elapsedInput");
  if (elInput && elInput.tagName === 'SELECT') {
    elInput.onchange = (e) => {
      state.data[state.trackingUnit].elapsed = parseInt(e.target.value, 10) || 0;
      save();
      render();
    };
  }

  const estInput = document.getElementById("estimatedInput");
  if (estInput) {
    if (estInput.tagName === 'SELECT') {
      estInput.onchange = (e) => {
        state.data[state.trackingUnit].estimated = parseInt(e.target.value, 10) || UNIT_RATES[state.trackingUnit];
        save();
        render();
      };
    } else {
      estInput.onchange = (e) => {
        const val = e.target.value.trim();
        const parts = val.split(":").map(Number);
        let h = 0, m = 0, s = 0;
        if (parts.length === 3) [h, m, s] = parts;
        else if (parts.length === 2) { m = parts[0]; s = parts[1]; }
        else if (parts.length === 1) { s = parts[0]; }
        
        const total = h * 3600 + m * 60 + s;
        if (!isNaN(total) && total > 0) {
          state.data.hours.estimated = total;
          save();
          render();
        } else {
          e.target.value = formatDisplay(state.data.hours.estimated, 'hours');
        }
      };
    }
  }
  
  setTimeout(() => t.sizeTo(document.body).done(), 50);
}