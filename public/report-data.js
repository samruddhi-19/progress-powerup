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

  /* Start/end (exclusive) of the current period */
  function periodBounds(mode, now) {
    if (mode === "monthly") {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { start: s.getTime(), end: e.getTime() };
    }
    const s = weekStart(now);
    const e = new Date(s); e.setDate(s.getDate() + 7);
    return { start: s.getTime(), end: e.getTime() };
  }

  /* Session timestamp: new entries carry ts; legacy entries get parsed (assumes current year) */
  function sessionTs(h) {
    if (h && typeof h.ts === "number") return h.ts;
    if (!h || !h.date) return NaN;
    const d = new Date(`${h.date} ${new Date().getFullYear()} ${h.time || "12:00 PM"}`);
    return isNaN(d) ? NaN : d.getTime();
  }

  /* ── snapshot current period, then return full stored history ── */
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

  /* ── first-seen trackers: when did a card complete / enter overtime? ──
     Cards don't store these moments, so the report records the first time it
     observes each condition, in board storage. "Completed this week" then
     means: its first-seen-complete timestamp falls inside this week. */
  async function updateSeenMaps(t, mapped, cardMap) {
    const now = Date.now();
    let completedSeen, overtimeSeen;
    try { completedSeen = (await t.get("board", "shared", "completedSeen")) || {}; } catch (e) { completedSeen = {}; }
    try { overtimeSeen = (await t.get("board", "shared", "overtimeSeen")) || {}; } catch (e) { overtimeSeen = {}; }
    let dirty = false;
    mapped.forEach((id) => {
      const entry = cardMap[id];
      if (!entry) return;
      const s = entry.state;
      const prog = computeProgress(s);
      const el = elapsedOf(s), est = estimatedOf(s);
      if (prog >= 100) {
        if (!completedSeen[id]) { completedSeen[id] = now; dirty = true; }
      } else if (completedSeen[id]) { delete completedSeen[id]; dirty = true; } // reopened
      if (est > 0 && el > est) {
        if (!overtimeSeen[id]) { overtimeSeen[id] = now; dirty = true; }
      } else if (overtimeSeen[id]) { delete overtimeSeen[id]; dirty = true; }
    });
    Object.keys(completedSeen).forEach((id) => { if (!mapped.includes(id)) { delete completedSeen[id]; dirty = true; } });
    Object.keys(overtimeSeen).forEach((id) => { if (!mapped.includes(id)) { delete overtimeSeen[id]; dirty = true; } });
    if (dirty) {
      try { await t.set("board", "shared", "completedSeen", completedSeen); } catch (e) {}
      try { await t.set("board", "shared", "overtimeSeen", overtimeSeen); } catch (e) {}
    }
    return { completedSeen, overtimeSeen };
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

    const nowDate = new Date();
    const P = periodBounds(mode, nowDate);
    const inP = (ts) => typeof ts === "number" && ts >= P.start && ts < P.end;
    const { completedSeen, overtimeSeen } = await updateSeenMaps(t, mapped, cardMap);

    let hoursSecPeriod = 0;
    const periodSessions = [];          // sessions inside the current period
    const perCardPeriodSec = {};        // cardId -> seconds tracked this period
    const activeIds = new Set();        // cards with activity this period
    const debug = [];

    mapped.forEach((id) => {
      const entry = cardMap[id];
      if (!entry) return;
      const s = entry.state;
      let cardPeriodSec = 0;
      let sessionsInPeriod = 0;
      if (s && Array.isArray(s.history)) {
        s.history.forEach((h) => {
          const ts = sessionTs(h);
          if (inP(ts)) {
            const sec = Number(h.seconds) || 0;
            cardPeriodSec += sec;
            sessionsInPeriod++;
            periodSessions.push({ ts, seconds: sec });
          }
        });
      }
      // live running timer counts toward the current period
      if (s && s.running && s.startTime) {
        const liveSec = Math.floor((Date.now() - s.startTime) / 1000);
        if (liveSec > 0) { cardPeriodSec += liveSec; periodSessions.push({ ts: Date.now(), seconds: liveSec }); }
      }
      if (cardPeriodSec > 0) perCardPeriodSec[id] = cardPeriodSec;
      hoursSecPeriod += cardPeriodSec;

      const workedThisPeriod = cardPeriodSec > 0 || (s && s.running);
      const completedThisPeriod = inP(completedSeen[id]);
      const overtimeThisPeriod = inP(overtimeSeen[id]);
      if (workedThisPeriod || completedThisPeriod || overtimeThisPeriod) activeIds.add(id);

      debug.push({
        card: (entry.meta.name || id).slice(0, 30),
        hasState: !!s,
        periodSec: cardPeriodSec,
        sessionsInPeriod,
        running: !!(s && s.running),
        completedThisPeriod, overtimeThisPeriod,
      });
    });

    /* period-scoped metrics + breakdowns */
    const breakdown = { active: [], achieved: [], hours: [], overtime: [] };
    let completed = 0, overtime = 0;
    mapped.forEach((id) => {
      const entry = cardMap[id];
      if (!entry) return;
      const s = entry.state;
      const name = entry.meta.name || "(unnamed card)";
      const list = entry.list || "";
      const prog = computeProgress(s);
      const el = elapsedOf(s), est = estimatedOf(s);
      const elH = +(el / 3600).toFixed(1), estH = +(est / 3600).toFixed(1);

      if (activeIds.has(id)) breakdown.active.push({ name, list, value: prog + "%" });
      if (inP(completedSeen[id])) { completed++; breakdown.achieved.push({ name, list, value: "100%" }); }
      if (perCardPeriodSec[id]) {
        breakdown.hours.push({ name, list, value: +(perCardPeriodSec[id] / 3600).toFixed(1) + "h", sort: perCardPeriodSec[id] });
      }
      if (inP(overtimeSeen[id])) {
        overtime++;
        breakdown.overtime.push({ name, list, value: `${elH}h / ${estH}h`, badge: `+${(elH - estH).toFixed(1)}h over` });
      }
    });
    breakdown.hours.sort((a, b) => b.sort - a.sort);
    const active = activeIds.size;
    console.log("[ProgressReport]", mode, "period", new Date(P.start).toDateString(), "→", new Date(P.end).toDateString(), debug);

    /* line chart — every day of the current period so far, zero-filled */
    const dayMs = 86400000;
    const lastDay = Math.min(P.end, Date.now() + dayMs);
    const hoursTracked = [], hoursLabels = [];
    const byDayIdx = {};
    periodSessions.forEach((x) => {
      const idx = Math.floor((x.ts - P.start) / dayMs);
      byDayIdx[idx] = (byDayIdx[idx] || 0) + x.seconds;
    });
    const nDays = Math.ceil((lastDay - P.start) / dayMs);
    const labelEvery = mode === "monthly" ? Math.max(1, Math.round(nDays / 6)) : 1;
    for (let i = 0; i < nDays; i++) {
      hoursTracked.push(+((byDayIdx[i] || 0) / 3600).toFixed(1));
      const d = new Date(P.start + i * dayMs);
      hoursLabels.push(i % labelEvery === 0 ? fmtDay(d) : "");
    }

    /* most productive day — within the current period only */
    const byWd = [0, 0, 0, 0, 0, 0, 0];
    periodSessions.forEach((x) => { byWd[new Date(x.ts).getDay()] += x.seconds; });
    let best = 0;
    byWd.forEach((v, i) => { if (v > byWd[best]) best = i; });
    const productivityDay = periodSessions.length ? WD[best] : "—";

    /* snapshot + history table & bar chart (now truly per-period numbers) */
    const hist = await snapshot(t, mode, { total: active, completed, overtime });
    const history = hist.slice().reverse().map((h) => ({
      range: h.range, total: h.total, completed: h.completed,
      overtime: h.overtime, deadline: h.deadline, rating: h.rating,
    }));
    const deadlineTrend = hist.map((h) => h.deadline);
    const trendLabels = hist.map((h) => {
      const r = String(h.range || "");
      return r.split("–")[0].replace(/,.*$/, "").trim().slice(0, 8);
    });

    return {
      metrics: { active, achieved: completed, hours: +(hoursSecPeriod / 3600).toFixed(1), overtime },
      deadlineTrend: deadlineTrend.length ? deadlineTrend : [],
      trendLabels,
      hoursTracked: hoursTracked.some((v) => v > 0) ? hoursTracked : [],
      hoursLabels,
      productivityDay,
      history,
      breakdown,
    };
  }

  return { build };
})();