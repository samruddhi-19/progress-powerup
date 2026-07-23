/* global TrelloPowerUp, ProgressBilling */
const t = TrelloPowerUp.iframe({
  appKey: window.ProgressConfig.API_KEY,
  appName: window.ProgressConfig.APP_NAME,
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
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  check:'<path d="m20 6-11 11-5-5"/>',
  pencil:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  pdf:'<path d="M14 3v5h5"/><path d="M7 3h7l5 5v13H7z"/><path d="M9.5 13v4M9.5 13h1.2a1 1 0 0 1 0 2H9.5M13.5 17v-4h1a1.5 1.5 0 0 1 0 4Z"/>',
};

function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function fmtDate(d){ return d ? d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : ""; }
function app(){ return document.getElementById("app"); }

const FIT_MAX = 660;
const FIT_MIN = 220;

function fit(){
  requestAnimationFrame(() => {
    const el = app();
    if(!el) return;
    el.classList.remove("scrolls");
    el.style.maxHeight = "none";
    const natural = el.scrollHeight;
    const target = Math.min(FIT_MAX, Math.max(FIT_MIN, natural));
    if(natural > FIT_MAX){
      el.style.maxHeight = FIT_MAX + "px";
      el.classList.add("scrolls");
    }
    try{ t.sizeTo(target); }catch(e){}
  });
}

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

  const rateCell = (rate) => rate
    ? `<span class="rate">$${rate}/hr</span>`
    : `<span class="norate-wrap"><span class="norate">Not set yet</span><span class="norate-sub">set on the card</span></span>`;

  const detailRows = cardDetails.length ? cardDetails.map((c)=>`
    <tr>
      <td class="tname">${esc(c.name)}<span class="tlist">${esc(c.list)}</span></td>
      <td class="mid">${progressBar(c.progress)}</td>
      <td class="mid r num">${c.hours}</td>
      <td class="mid r">${rateCell(c.rate)}</td>
      <td class="r">${dueCell(c.due)}</td>
    </tr>`).join("") : `<tr><td colspan="5" class="empty-cell">No cards are mapped for tracking yet.</td></tr>`;

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
    ? `<div class="callout">
         <span class="ci">${icon(ICONS.info)}</span>
         <span class="ctext">
           <span class="ct">${m.noRateCount} card${m.noRateCount===1?"":"s"} ${m.noRateCount===1?"has":"have"} no hourly rate yet</span>
           <span class="cdesc">Open the card on your board &rarr; scroll to <strong>Billing</strong> &rarr; tap <strong>+ Add Hourly Rate</strong>. Cards only appear above once they have a rate.</span>
         </span>
       </div>`
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
          <th style="width:28%">Task</th>
          <th class="mid" style="width:18%">Completion</th>
          <th class="mid r" style="width:10%">Hours</th>
          <th class="mid r" style="width:16%">Rate</th>
          <th class="r" style="width:28%">Due</th>
        </tr></thead>
        <tbody>${detailRows}</tbody>
      </table>
    </div>

    <div class="sec-row">
      <div class="sec-left"><span class="sec-h">Active billable tasks</span><span class="pill">${billableList.length}</span></div>
      <button class="export sm" id="export">Generate Details</button>
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
      ${rateHint || ""}
    </div>
  `;

  document.getElementById("export").onclick = openInvoice;
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


/* ══════════ Invoice builder ══════════ */
let inv = { open:false, name:"", editingName:false, picked:null };

function invItems(){ return Array.isArray(report && report.billable) ? report.billable : []; }

function openInvoice(){
  const items = invItems();
  if(!items.length) return;
  inv.open = true;
  inv.editingName = false;
  if(inv.picked === null) inv.picked = new Set(items.map((_,i)=>i)); // all checked by default
  renderInvoice();
}
function closeInvoice(){ inv.open = false; renderInvoice(); }

function invTotals(){
  const items = invItems();
  let hours = 0, amount = 0, n = 0;
  items.forEach((c,i)=>{ if(inv.picked.has(i)){ n++; hours += Number(c.hours)||0; amount += Number(c.amount)||0; } });
  return { n, hours:+hours.toFixed(2), amount:+amount.toFixed(2) };
}

function renderInvoice(){
  let ov = document.getElementById("invOverlay");
  if(!inv.open){ if(ov) ov.remove(); return; }
  if(!ov){
    ov = document.createElement("div");
    ov.id = "invOverlay";
    ov.className = "ov";
    document.body.appendChild(ov);
    ov.addEventListener("click",(e)=>{ if(e.target === ov) closeInvoice(); });
  }

  const items = invItems();
  const T = invTotals();

  const nameBlock = inv.editingName
    ? `<div class="nm-edit">
         <input id="invName" type="text" placeholder="Untitled Bill" value="${esc(inv.name)}" maxlength="60" />
         <button class="nm-ok" id="invNameOk" aria-label="Save name">${icon(ICONS.check)}</button>
       </div>
       <div class="nm-hint">Enter to save &middot; Esc to cancel</div>`
    : `<div class="nm" id="invNameBtn">
         <span class="txt ${inv.name ? "" : "placeholder"}">${inv.name ? esc(inv.name) : "Untitled Bill"}</span>
         ${icon(ICONS.pencil)}
       </div>`;

  const rows = items.map((c,i)=>{
    const on = inv.picked.has(i);
    return `<tr class="${on?"on":"off"}" data-i="${i}">
      <td style="padding-left:18px;padding-right:0"><span class="cb ${on?"on":""}">${on?icon(ICONS.check):""}</span></td>
      <td class="tname">${esc(c.name)}<span class="tlist">${esc(c.list)}</span></td>
      <td class="mid r num">${c.hours}</td>
      <td class="mid r rate">$${c.rate}</td>
      <td class="r amt" style="padding-right:18px">$${money(c.amount,2)}</td>
    </tr>`;
  }).join("");

  ov.innerHTML = `
    <div class="inv" role="dialog" aria-label="Generate invoice">
      <div class="inv-head">
        <div class="r1">
          <span class="t">Select tasks to include in invoice</span>
          <button class="inv-x" id="invClose" aria-label="Close">${icon(ICONS.x)}</button>
        </div>
        ${nameBlock}
      </div>
      <div class="inv-list">
        <table>
          <thead><tr>
            <th style="width:8%;padding-left:18px"></th>
            <th style="width:42%">Work</th>
            <th class="mid r" style="width:16%">Hours</th>
            <th class="mid r" style="width:15%">Rate</th>
            <th class="r" style="width:19%;padding-right:18px">Amount</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="inv-foot">
        <span class="fl">Total &middot; ${T.n} task${T.n===1?"":"s"}</span>
        <span class="fa">$${money(T.amount,2)}</span>
      </div>
      <div class="inv-act">
        <button id="invGo" ${T.n?"":"disabled"}>${icon(ICONS.pdf)}Generate Invoice</button>
      </div>
    </div>`;

  document.getElementById("invClose").onclick = closeInvoice;

  if(inv.editingName){
    const input = document.getElementById("invName");
    const commit = ()=>{ inv.name = input.value.trim(); inv.editingName = false; renderInvoice(); };
    document.getElementById("invNameOk").onclick = commit;
    input.onkeydown = (e)=>{
      if(e.key === "Enter"){ e.preventDefault(); commit(); }
      if(e.key === "Escape"){ e.preventDefault(); inv.editingName = false; renderInvoice(); }
    };
    input.focus(); input.select();
  } else {
    document.getElementById("invNameBtn").onclick = ()=>{ inv.editingName = true; renderInvoice(); };
  }

  ov.querySelectorAll("tbody tr").forEach((tr)=>{
    tr.onclick = ()=>{
      const i = Number(tr.dataset.i);
      if(inv.picked.has(i)) inv.picked.delete(i); else inv.picked.add(i);
      renderInvoice();
    };
  });

  const go = document.getElementById("invGo");
  if(go) go.onclick = generatePDF;
}

/* ── Invoice PDF: opens a clean printable page, user saves as PDF ── */
function generatePDF(){
  const items = invItems().filter((_,i)=>inv.picked.has(i));
  if(!items.length) return;
  const T = invTotals();
  const title = inv.name || "Untitled Bill";
  const dateStr = new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});

  const rows = items.map((c)=>`
    <tr>
      <td class="w">${esc(c.name)}${c.list ? `<span class="l">${esc(c.list)}</span>` : ""}</td>
      <td class="n">${c.hours}</td>
      <td class="n">$${c.rate}</td>
      <td class="n b">$${money(c.amount,2)}</td>
    </tr>`).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Helvetica,Arial,sans-serif;color:#172b4d;padding:48px 56px;font-size:12px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px}
    h1{font-size:22px;font-weight:700;letter-spacing:-.2px}
    .meta{text-align:right;color:#626f86;font-size:11px;line-height:1.7}
    .meta .lbl{letter-spacing:1.4px;font-size:10px;font-weight:700;color:#8993a4}
    .rule{height:1px;background:#dfe1e6;margin:18px 0 0}
    table{width:100%;border-collapse:collapse;margin-top:22px}
    th{text-align:left;font-size:9px;letter-spacing:1.2px;text-transform:uppercase;color:#8993a4;padding:0 0 8px;font-weight:700;border-bottom:1px solid #dfe1e6}
    th.n,td.n{text-align:right}
    td{padding:13px 0;border-bottom:1px solid #f0f1f4;font-size:12px}
    td.w{font-weight:600}
    td.w .l{font-weight:400;color:#8993a4;font-size:10.5px;margin-left:8px}
    td.b{font-weight:700}
    .tot{display:flex;justify-content:space-between;align-items:baseline;margin-top:26px}
    .tot .lbl{font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#626f86;font-weight:700}
    .tot .hrs{color:#8993a4;font-size:11px;margin-right:18px}
    .tot .amt{font-size:19px;font-weight:700;color:#1a895d}
    .foot{margin-top:44px;font-size:9.5px;color:#8993a4}
    @page{margin:0}
    @media print{body{padding:40px 48px}}
  </style></head><body>
    <div class="top">
      <h1>${esc(title)}</h1>
      <div class="meta"><div class="lbl">INVOICE</div><div>${dateStr}</div></div>
    </div>
    <div class="rule"></div>
    <table>
      <thead><tr><th>Work</th><th class="n">Hours</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="tot">
      <span class="lbl">Total payable</span>
      <span><span class="hrs">${T.hours} hours billed</span><span class="amt">$${money(T.amount,2)}</span></span>
    </div>
    <div class="foot">Generated by Progress for Trello &middot; ${dateStr}</div>
  </body></html>`;

  const win = window.open("", "progress-invoice", "width=900,height=1100");
  if(!win){
    alert("Please allow pop-ups for this site to generate the invoice.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(()=>{ win.print(); }, 250);
  closeInvoice();
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
  inv.picked = null;  // re-default selection to "all" on fresh data
  renderDashboard();
}

document.documentElement.dataset.theme = "dark";
load();
document.addEventListener("keydown",(e)=>{
  if(e.key === "Escape" && inv.open && !inv.editingName) closeInvoice();
});