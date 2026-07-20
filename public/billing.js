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

function fmtShort(d){ return d ? new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric"}) : ""; }
function daysBetween(a,b){ return Math.floor((a-b)/86400000); }

function progressBar(pct){
  const p = Math.min(100, pct||0);
  const grad = p>=100 ? "linear-gradient(90deg,#37b57f,#4bce97)"
             : p>=50  ? "linear-gradient(90deg,#579dff,#85b8ff)"
             :          "linear-gradient(90deg,#f5a05f,#fbbf7c)";
  return `<span class="pbar"><span class="ptrack"><span class="pfill" style="width:${p}%;background:${grad}"></span></span><span class="ppct">${p}%</span></span>`;
}

function dueCell(ds){
  if(!ds) return `<span class="due-none">No due date</span>`;
  const now = Date.now();
  const d = ds.date ? new Date(ds.date).getTime() : null;
  if(ds.key === "done")
    return `<span class="due"><span class="dot green"></span><span class="due-txt muted">Completed</span></span>`;
  if(ds.key === "overdue"){
    const n = Math.max(1, daysBetween(now, d));
    return `<span class="due"><span class="dot red"></span><span class="due-txt">${fmtShort(d)}</span><span class="due-sub">&middot; overdue ${n}d</span></span>`;
  }
  if(ds.key === "today")
    return `<span class="due"><span class="dot amber"></span><span class="due-txt">Due today</span></span>`;
  const n = Math.max(1, daysBetween(d, now));
  return `<span class="due"><span class="dot blue"></span><span class="due-txt">${fmtShort(d)}</span><span class="due-sub">&middot; in ${n}d</span></span>`;
}

function money(n, decimals){
  return Number(n||0).toLocaleString("en-US",{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
}

function renderDashboard(){
  const d = report || {};
  const cardDetails = Array.isArray(d.cardDetails) ? d.cardDetails : [];
  const billableList = Array.isArray(d.billable) ? d.billable : [];
  const m = d.metrics || { billableCards:0, billableHours:0, totalAmount:0, noRateCount:0 };

  const detailRows = cardDetails.length ? cardDetails.map((c)=>`
    <tr>
      <td class="tname">${esc(c.name)}<span class="tlist">${esc(c.list)}</span></td>
      <td class="mid">${progressBar(c.progress)}</td>
      <td class="mid r num">${c.hours}</td>
      <td class="r">${dueCell(c.due)}</td>
    </tr>`).join("") : `<tr><td colspan="4" class="empty-cell">No cards are mapped for tracking yet.</td></tr>`;

  const billRows = billableList.length ? billableList.map((c)=>`
    <tr>
      <td class="tname">${esc(c.name)}<span class="tlist">${esc(c.list)}</span></td>
      <td class="mid r num">${c.hours}</td>
      <td class="mid r rate">$${c.rate}</td>
      <td class="r amt">$${money(c.amount,2)}</td>
    </tr>`).join("") : `<tr><td colspan="4" class="empty-cell">No cards have an hourly rate set yet.</td></tr>`;

  const footStrip = billableList.length ? `
    <div class="foot-strip">
      <span class="fl">Total payable</span>
      <span class="fr"><span class="fh">${m.billableHours}h billed</span><span class="fa">$${money(m.totalAmount,2)}</span></span>
    </div>` : "";

  const rateHint = m.noRateCount > 0
    ? `<span class="sec-hint">${m.noRateCount} without a rate &middot; set from the card&rsquo;s <span class="link">Billing</span> section</span>`
    : "";

  app().innerHTML = `
    <div class="topbar">
      <div>
        <h1>Workspace &amp; billing</h1>
        <div class="sub">Rates are set per-card, from the card&rsquo;s Billing section</div>
      </div>
      <div class="sumstrip">
        <span class="stat"><span class="sv">${cardDetails.length}</span><span class="sl">Tracked</span></span>
        <span class="div"></span>
        <span class="stat"><span class="sv">${m.billableHours}h</span><span class="sl">Billable</span></span>
        <span class="div"></span>
        <span class="stat"><span class="sv green">$${money(m.totalAmount,0)}</span><span class="sl">Total</span></span>
      </div>
    </div>

    <div class="sec-row">
      <div class="sec-left"><span class="sec-h">Card details</span><span class="pill">${cardDetails.length}</span></div>
    </div>
    <div class="table-card">
      <table>
        <thead><tr>
          <th style="width:37%">Task</th>
          <th class="mid" style="width:23%">Completion</th>
          <th class="mid r" style="width:12%">Hours</th>
          <th class="r" style="width:28%">Due</th>
        </tr></thead>
        <tbody>${detailRows}</tbody>
      </table>
    </div>

    <div class="sec-row">
      <div class="sec-left"><span class="sec-h">Active billable tasks</span><span class="pill">${billableList.length}</span></div>
      <button class="export sm" id="export">${icon(ICONS.dl)}Generate invoice</button>
    </div>
    <div class="table-card">
      <table>
        <thead><tr>
          <th style="width:46%">Work</th>
          <th class="mid r" style="width:17%">Hours</th>
          <th class="mid r" style="width:17%">Rate</th>
          <th class="r" style="width:20%">Amount</th>
        </tr></thead>
        <tbody>${billRows}</tbody>
      </table>
      ${footStrip}
    </div>

    <div class="bottom">
      ${rateHint || "<span></span>"}
      <span class="note">Invoice exports as CSV &middot; includes both tables</span>
    </div>
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