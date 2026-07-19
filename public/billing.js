/* global TrelloPowerUp, ProgressBilling */
const t = TrelloPowerUp.iframe({
  appKey: "93b1fabac6fe3f9a688c9b4cc836f97d",
  appName: "Progress Tracker",
});

let report = null;

const icon = (p) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const ICONS = {
  receipt:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  dollar:'<path d="M12 2v20M17 6.5c0-1.9-2.2-3.5-5-3.5S7 4.6 7 6.5 9.2 10 12 10s5 1.4 5 3.5-2.2 3.5-5 3.5-5-1.6-5-3.5"/>',
  alert:'<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.1"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 8v.1M12 11v5"/>',
  dl:'<path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 21h16"/>',
};

function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function fmtDate(d){ return d ? d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : ""; }
function app(){ return document.getElementById("app"); }
function fit(){ t.sizeTo("body").catch(()=>{}); }
function showState(html){ app().innerHTML = `<div class="state">${html}</div>`; fit(); }

function dueBadge(ds){
  if(!ds) return "";
  const map = {
    overdue:["var(--red-bg)","var(--red-fg)"],
    today:["var(--amber-bg)","var(--amber-fg)"],
    upcoming:["var(--green-bg)","var(--green-fg)"],
    done:["var(--blue-bg)","var(--blue-fg)"],
  };
  const [bg,fg] = map[ds.key] || map.upcoming;
  const dateLine = ds.date ? `<span class="due-date">Due ${fmtDate(ds.date)}</span>` : "";
  return `<span class="badge" style="background:${bg};color:${fg}">${ds.label.toUpperCase()}</span>${dateLine}`;
}

async function connect(){
  try { await t.getRestApi().authorize({ scope:"read,write", expiration:"never" }); load(); }
  catch(e){ showState(`<h2>Couldn't connect</h2><div>${e.message||"Authorization was cancelled."}</div><button id="cbtn">Try again</button>`);
    const b=document.getElementById("cbtn"); if(b) b.onclick=connect; }
}

function progressBar(pct){
  const clamped = Math.min(100, pct||0);
  const color = clamped>=100 ? "var(--green-fg)" : clamped>=50 ? "var(--blue-fg)" : "var(--amber-fg)";
  return `<div style="display:flex;align-items:center;gap:7px">
    <div style="flex:1;height:5px;border-radius:4px;background:var(--track);overflow:hidden"><div style="width:${clamped}%;height:100%;background:${color}"></div></div>
    <span class="num" style="font-size:10.5px;color:var(--dim);min-width:30px;text-align:right">${clamped}%</span>
  </div>`;
}

function renderDashboard(){
  const d = report || {};
  const cardDetails = Array.isArray(d.cardDetails) ? d.cardDetails : [];
  const billableList = Array.isArray(d.billable) ? d.billable : [];
  const m = d.metrics || { billableCards:0, billableHours:0, totalAmount:0, noRateCount:0 };

  /* ── Card Details: every tracked card, always populated ── */
  const detailRows = cardDetails.length ? cardDetails.map((c)=>`
    <tr>
      <td>${esc(c.name)}<div style="font-size:10px;color:var(--muted);margin-top:2px">${esc(c.list)}</div></td>
      <td style="width:26%">${progressBar(c.progress)}</td>
      <td class="num" style="text-align:right">${c.hours}h</td>
      <td>${dueBadge(c.due) || `<span style="color:var(--muted);font-size:11px">No due date</span>`}</td>
    </tr>`).join("") : `<tr><td colspan="4" class="empty-cell">No cards are mapped for tracking yet.</td></tr>`;

  /* ── Active Billable Tasks: only cards with a rate set ── */
  const billRows = billableList.length ? billableList.map((c)=>`
    <tr>
      <td>${esc(c.name)}<div style="font-size:10px;color:var(--muted);margin-top:2px">${esc(c.list)}</div></td>
      <td class="num" style="text-align:right">${c.hours}h</td>
      <td class="num" style="text-align:right">$${c.rate}/hr</td>
      <td class="num" style="text-align:right;font-weight:600">$${c.amount.toFixed(2)}</td>
    </tr>`).join("") : `<tr><td colspan="4" class="empty-cell">No cards have an hourly rate set yet.</td></tr>`;

  const totalRow = billableList.length ? `
    <tr class="total-row">
      <td>Total</td>
      <td class="num" style="text-align:right">${m.billableHours}h</td>
      <td></td>
      <td class="num" style="text-align:right;color:var(--green-fg)">$${m.totalAmount.toFixed(2)}</td>
    </tr>` : "";

  const banner = m.noRateCount > 0 ? `
    <div class="banner">${icon(ICONS.info)}
      <span>${m.noRateCount} tracked card${m.noRateCount===1?"":"s"} ${m.noRateCount===1?"has":"have"} no hourly rate yet — open a card and use <strong>Add Hourly Rate</strong> (under Billing) to include it here.</span>
    </div>` : "";

  app().innerHTML = `
    <div class="topbar">
      <h1>Workspace &amp; billing</h1>
      <span class="hint">Rates are set per-card, from the card itself</span>
    </div>

    <div class="sec-row"><span class="sec-h">Card details</span><span class="hint">${cardDetails.length} tracked</span></div>
    <div class="table-card">
      <table>
        <thead><tr>
          <th style="width:34%">Task name</th><th style="width:26%">Completion</th>
          <th style="width:14%;text-align:right">Hours taken</th><th style="width:26%">Due status</th>
        </tr></thead>
        <tbody>${detailRows}</tbody>
      </table>
    </div>

    <div class="sec-row"><span class="sec-h">Active billable tasks</span></div>
    <div class="table-card">
      <table>
        <thead><tr>
          <th style="width:40%">Work</th><th style="width:20%;text-align:right">Hours</th>
          <th style="width:20%;text-align:right">Hourly rate</th><th style="width:20%;text-align:right">Total amount</th>
        </tr></thead>
        <tbody>${billRows}${totalRow}</tbody>
      </table>
    </div>

    ${banner}

    <button class="export" id="export">${icon(ICONS.dl)}Generate invoice</button>
  `;

  document.getElementById("export").onclick = exportCSV;
  fit();
}

function exportCSV(){
  if(!report) return;
  const cardDetails = Array.isArray(report.cardDetails) ? report.cardDetails : [];
  const billableList = Array.isArray(report.billable) ? report.billable : [];
  const metrics = report.metrics || { billableHours:0, totalAmount:0 };
  const q = v => `"${String(v).replace(/"/g,'""')}"`;
  const lines = [];
  lines.push(q("Card Details"));
  lines.push(["Task name","List","Completion (%)","Hours taken","Due status"].map(q).join(","));
  cardDetails.forEach(c => lines.push(
    [c.name, c.list, c.progress, c.hours, c.due ? c.due.label : ""].map(q).join(",")
  ));
  lines.push("");
  lines.push(q("Active Billable Tasks"));
  lines.push(["Work","List","Hours","Hourly rate ($)","Total amount ($)"].map(q).join(","));
  billableList.forEach(c => lines.push(
    [c.name, c.list, c.hours, c.rate, c.amount.toFixed(2)].map(q).join(",")
  ));
  if (billableList.length) {
    lines.push(["Total","", metrics.billableHours, "", metrics.totalAmount.toFixed(2)].map(q).join(","));
  }
  const stamp = new Date().toISOString().slice(0,10);
  const blob = new Blob([lines.join("\n")], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = `progress-invoice-${stamp}.csv`; a.click();
  URL.revokeObjectURL(url);
}

async function load(){
  showState("Loading billing…");
  let res;
  try { res = await ProgressBilling.build(t); }
  catch(e){ showState(`<h2>Something went wrong</h2><div>${e.message||e}</div><button id="rbtn">Retry</button>`);
    const b=document.getElementById("rbtn"); if(b) b.onclick=load; return; }
  if(res.needsAuth){ showState(`<h2>Connect Trello to load billing</h2><div>Billing reads your board's cards to compute rates and hours.</div><button id="cbtn">Connect Trello</button>`);
    const b=document.getElementById("cbtn"); if(b) b.onclick=connect; return; }
  if(res.error){ showState(`<h2>Couldn't load board data</h2><div>${res.error}</div><button id="rbtn">Retry</button>`);
    const b=document.getElementById("rbtn"); if(b) b.onclick=load; return; }
  report = res;
  renderDashboard();
}

document.documentElement.dataset.theme = "dark";
load();