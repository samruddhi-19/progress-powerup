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

function renderDashboard(){
  const d = report, m = d.metrics;

  const rows = d.billable.length ? d.billable.map((c)=>`
    <tr>
      <td>${esc(c.name)}</td>
      <td style="color:var(--dim)">${esc(c.list)}</td>
      <td class="num" style="text-align:right">$${c.rate}/hr</td>
      <td class="num" style="text-align:right">${c.hours}h</td>
      <td class="num" style="text-align:right;font-weight:600">$${c.amount.toFixed(2)}</td>
      <td>${dueBadge(c.due)}</td>
    </tr>`).join("") : `<tr><td colspan="6" class="empty-cell">No cards have an hourly rate set yet.</td></tr>`;

  const totalRow = d.billable.length ? `
    <tr class="total-row">
      <td colspan="3">Total</td>
      <td class="num" style="text-align:right">${m.billableHours}h</td>
      <td class="num" style="text-align:right;color:var(--green-fg)">$${m.totalAmount.toFixed(2)}</td>
      <td></td>
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

    <div class="metrics">
      <div class="card metric"><div class="mrow"><div class="chip" style="background:var(--green-bg);color:var(--green-fg)">${icon(ICONS.receipt)}</div><div class="val">${m.billableCards}</div></div><div class="lbl">Billable cards</div></div>
      <div class="card metric"><div class="mrow"><div class="chip" style="background:var(--blue-bg);color:var(--blue-fg)">${icon(ICONS.clock)}</div><div class="val">${m.billableHours}h</div></div><div class="lbl">Billable hours</div></div>
      <div class="card metric"><div class="mrow"><div class="chip" style="background:var(--amber-bg);color:var(--amber-fg)">${icon(ICONS.dollar)}</div><div class="val">$${m.totalAmount.toFixed(2)}</div></div><div class="lbl">Total amount</div></div>
      <div class="card metric"><div class="mrow"><div class="chip" style="background:var(--red-bg);color:var(--red-fg)">${icon(ICONS.alert)}</div><div class="val">${m.noRateCount}</div></div><div class="lbl">No rate set</div></div>
    </div>

    <div class="sec-row"><span class="sec-h">Billable cards</span></div>
    <div class="table-card">
      <table>
        <thead><tr>
          <th style="width:26%">Card</th><th style="width:16%">List</th>
          <th style="width:12%;text-align:right">Rate</th><th style="width:11%;text-align:right">Hours</th>
          <th style="width:15%;text-align:right">Amount</th><th style="width:20%">Due</th>
        </tr></thead>
        <tbody>${rows}${totalRow}</tbody>
      </table>
    </div>

    ${banner}

    <button class="export" id="export">${icon(ICONS.dl)}Generate invoice</button>
  `;

  document.getElementById("export").onclick = exportCSV;
  fit();
}

function exportCSV(){
  if(!report || !report.billable.length) return;
  const header = ["Card","List","Rate ($/hr)","Hours","Amount ($)","Due status"];
  const lines = report.billable.map(c =>
    [c.name, c.list, c.rate, c.hours, c.amount.toFixed(2), c.due ? c.due.label : ""]
      .map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")
  );
  const stamp = new Date().toISOString().slice(0,10);
  const blob = new Blob([[header.join(","), ...lines].join("\n")], {type:"text/csv;charset=utf-8"});
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