/* global TrelloPowerUp */
/*
  Reports data layer.
  window.ProgressReport.build(t, mode) -> {
    metrics: { active, achieved, hours, overtime },
    deadlineTrend: [%...],      // bar chart, per stored period (oldest -> newest)
    hoursTracked: [hrs...],     // line chart, per day (from session logs)
    productivityDay: "Tuesday",
    history: [ { range,total,completed,overtime,deadline,rating } ]  // newest first
  }
  or { needsAuth: true } / { error: "..." }

  NOTE: shares the Trello API key with card-progress-iframe.js. Centralise both
  into one config when you do the personal/company key split.
*/
window.ProgressReport = (function () {
  const API_KEY = "93b1fabac6fe3f9a688c9b4cc836f97d";
  const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  /* Strip decorations some boards put in list titles: emoji + "(2/4)" style counters */
  function cleanListName(name) {
    return String(name || "")
      .replace(/\(\s*\d+\s*\/\s*\d+\s*\)/g, "")          // (2/4) counters
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, "") // emoji & pictographs
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  /* ── per-card derivations (mirror card-progress-iframe.js) ── */
  function computeProgress(s) {
    if (!s) return 0;
    if (s.progressSource === "manual") return Number(s.manualProgress) || 0;
    if (s.progressSource === "tasks") {
      if (!s.tasks || !s.tasks.length) return 0;
      const done = s.tasks.filter((tk) => tk.done).length;
      return Math.round((done / s.tasks.length) * 100);
    }
    const u = s.trackingUnit || "hours";
    const a = (s.data && s.data[u]) || { elapsed: 0, estimated: 1 };
    let el = Number(a.elapsed) || 0;
    if (s.running && s.startTime) el += Math.floor((Date.now() - s.startTime) / 1000);
    return Math.min(100, Math.round((el / (a.estimated || 1)) * 100));
  }
  function elapsedOf(s) {
    const u = (s && s.trackingUnit) || "hours";
    const a = (s && s.data && s.data[u]) || { elapsed: 0 };
    let el = Number(a.elapsed) || 0;
    if (s && s.running && s.startTime) el += Math.floor((Date.now() - s.startTime) / 1000);
    return el;
  }
  function estimatedOf(s) {
    const u = (s && s.trackingUnit) || "hours";
    const a = (s && s.data && s.data[u]) || { estimated: 0 };
    return Number(a.estimated) || 0;
  }

  /* ── fetch every card on the board + its plugin state via REST ── */
  async function fetchCards(t, token) {
    const ctx = t.getContext();
    const boardId = ctx.board;
    const ourPluginId = ctx.plugin || null;
    const base = `key=${API_KEY}&token=${token}`;
    const [cardsRes, listsRes] = await Promise.all([
      fetch(`https://api.trello.com/1/boards/${boardId}/cards?fields=name,idList,due,dueComplete&pluginData=true&${base}`),
      fetch(`https://api.trello.com/1/boards/${boardId}/lists?fields=name&${base}`),
    ]);
    if (!cardsRes.ok) throw new Error("REST " + cardsRes.status);
    const cards = await cardsRes.json();
    const listName = {};
    if (listsRes.ok) {
      (await listsRes.json()).forEach((l) => { listName[l.id] = cleanListName(l.name); });
    }
    const map = {};
    cards.forEach((c) => {
      let state = null;
      (c.pluginData || []).forEach((pd) => {
        // Only our own Power-Up's data — other plugins store pluginData on the same cards
        if (ourPluginId && pd.idPlugin && pd.idPlugin !== ourPluginId) return;
        try {
          const v = JSON.parse(pd.value);
          if (v && (v.data || v.tasks || v.progressSource)) state = v;
        } catch (e) {}
      });
      map[c.id] = { meta: c, state, list: listName[c.idList] || "" };
    });
    return map;
  }

  /* ── period helpers ── */
  function fmtDay(d) { return `${MO[d.getMonth()]} ${d.getDate()}`; }
  function weekStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x; }
  function periodInfo(mode, now) {
    if (mode === "monthly") {
      const y = now.getFullYear();
      return { key: `${y}-${String(now.getMonth() + 1).padStart(2, "0")}`, range: `${MO[now.getMonth()]} ${y}` };
    }
    const s = weekStart(now);
    const e = new Date(s); e.setDate(s.getDate() + 6);
    return { key: `${s.getFullYear()}-${s.getMonth()}-${s.getDate()}`, range: `${fmtDay(s)} – ${fmtDay(e)}, ${e.getFullYear()}` };
  }
  function rating(pct) { return pct >= 90 ? "Excellent" : pct >= 80 ? "Good" : "Need attention"; }

  /* ── snapshot current period, then return full stored history (newest first) ── */
  async function snapshot(t, mode, agg) {
    const storeKey = mode === "monthly" ? "reportHistoryMonthly" : "reportHistoryWeekly";
    let hist = (await t.get("board", "shared", storeKey)) || [];
    const p = periodInfo(mode, new Date());
    const deadline = agg.total ? Math.round((agg.completed / agg.total) * 100) : 0;
    const snap = {
      period: p.key, range: p.range, total: agg.total, completed: agg.completed,
      overtime: agg.overtime, deadline, rating: rating(deadline),
    };
    const idx = hist.findIndex((h) => h.period === p.key);
    if (idx >= 0) hist[idx] = snap; else hist.push(snap);
    if (hist.length > 26) hist = hist.slice(-26);
    try { await t.set("board", "shared", storeKey, hist); } catch (e) {}
    return hist;
  }

  /* ── main ── */
  async function build(t, mode) {
    let token;
    try {
      if (!(await t.getRestApi().isAuthorized())) return { needsAuth: true };
      token = await t.getRestApi().getToken();
      if (!token) return { needsAuth: true };
    } catch (e) { return { needsAuth: true }; }

    let cardMap, mapped;
    try {
      cardMap = await fetchCards(t, token);
      mapped = (await t.get("board", "shared", "mappedCards")) || [];
    } catch (e) { return { error: e.message || "Could not load board data" }; }

    let active = 0, completed = 0, hoursSec = 0, overtime = 0;
    const sessions = [];
    const debug = [];
    const breakdown = { active: [], achieved: [], hours: [], overtime: [] };
    mapped.forEach((id) => {
      const entry = cardMap[id];
      if (!entry) return;
      active++;
      const s = entry.state;
      const name = entry.meta.name || "(unnamed card)";
      const list = entry.list || "";
      const prog = computeProgress(s);
      const el = elapsedOf(s), est = estimatedOf(s);
      const elH = +(el / 3600).toFixed(1), estH = +(est / 3600).toFixed(1);

      breakdown.active.push({ name, list, value: prog + "%" });
      if (prog >= 100) { completed++; breakdown.achieved.push({ name, list, value: "100%" }); }
      hoursSec += el;
      if (el > 0) breakdown.hours.push({ name, list, value: elH + "h", sort: el });
      if (est > 0 && el > est) {
        overtime++;
        breakdown.overtime.push({ name, list, value: `${elH}h / ${estH}h`, badge: `+${(elH - estH).toFixed(1)}h over` });
      }
      if (s && Array.isArray(s.history)) {
        s.history.forEach((h) => sessions.push({ date: h.date, seconds: Number(h.seconds) || 0 }));
      }
      debug.push({
        card: name.slice(0, 30),
        hasState: !!s,
        elapsedSec: el,
        running: !!(s && s.running),
        sessions: s && Array.isArray(s.history) ? s.history.length : 0,
      });
    });
    breakdown.hours.sort((a, b) => b.sort - a.sort);
    console.log("[ProgressReport] mapped cards:", debug, "| total sessions:", sessions.length);

    /* line chart — hours per day from session logs (dates have no year → assume current) */
    const year = new Date().getFullYear();
    const byDay = {};
    sessions.forEach((x) => { byDay[x.date] = (byDay[x.date] || 0) + x.seconds; });
    const dayKeys = Object.keys(byDay).sort(
      (a, b) => new Date(`${a} ${year}`) - new Date(`${b} ${year}`),
    );
    const span = mode === "monthly" ? 12 : 7;
    const recent = dayKeys.slice(-span);
    const hoursTracked = recent.map((k) => +(byDay[k] / 3600).toFixed(1));
    const hoursLabels = recent; // "Jul 15" style day keys

    /* most productivity day — weekday with most tracked time */
    const byWd = [0, 0, 0, 0, 0, 0, 0];
    sessions.forEach((x) => {
      const d = new Date(`${x.date} ${year}`);
      if (!isNaN(d)) byWd[d.getDay()] += x.seconds;
    });
    let best = 0;
    byWd.forEach((v, i) => { if (v > byWd[best]) best = i; });
    const productivityDay = sessions.length ? WD[best] : "—";

    /* snapshot + history-derived table & bar chart */
    const hist = await snapshot(t, mode, { total: active, completed, overtime });
    const history = hist.slice().reverse().map((h) => ({
      range: h.range, total: h.total, completed: h.completed,
      overtime: h.overtime, deadline: h.deadline, rating: h.rating,
    }));
    const deadlineTrend = hist.map((h) => h.deadline);
    const trendLabels = hist.map((h) => {
      // short label: "Jul 12" from "Jul 12 – Jul 18, 2026" or "Jun 2026"
      const r = String(h.range || "");
      return r.split("–")[0].replace(/,.*$/, "").trim().slice(0, 8);
    });

    return {
      metrics: { active, achieved: completed, hours: +(hoursSec / 3600).toFixed(1), overtime },
      deadlineTrend: deadlineTrend.length ? deadlineTrend : [],
      trendLabels,
      hoursTracked: hoursTracked.length ? hoursTracked : [],
      hoursLabels,
      productivityDay,
      history,
      breakdown,
    };
  }

  return { build };
})();