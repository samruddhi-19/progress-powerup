/* global TrelloPowerUp */
/*
  Billing data layer.
  window.ProgressBilling.build(t) -> {
    metrics: { billableCards, billableHours, totalAmount, noRateCount },
    billable: [ { name, list, rate, hours, amount, due, dueStatus } ],  // has hourlyRate set
    unrated:  [ { name, list } ],                                       // tracked, no rate yet
  } or { needsAuth: true } / { error: "..." }
*/
window.ProgressBilling = (function () {
  const API_KEY = window.ProgressConfig.API_KEY;

  function cleanListName(name) {
    return String(name || "")
      .replace(/\(\s*\d+\s*\/\s*\d+\s*\)/g, "")
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

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

  function dueStatus(due, dueComplete) {
    if (!due) return null;
    if (dueComplete) return { label: "Completed", key: "done" };
    const d = new Date(due);
    if (isNaN(d)) return null;
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return { label: "Due Today", key: "today", date: d };
    if (d.getTime() < now.getTime()) return { label: "Overdue", key: "overdue", date: d };
    return { label: "Upcoming", key: "upcoming", date: d };
  }

  async function fetchCards(t, token) {
    const ctx = t.getContext();
    const boardId = ctx.board;
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
      // Identify our data by shape, not idPlugin (context.plugin doesn't reliably
      // match REST's pluginData[].idPlugin across all iframe contexts).
      (c.pluginData || []).forEach((pd) => {
        try {
          const v = JSON.parse(pd.value);
          if (v && (v.data || v.tasks || v.progressSource !== undefined)) state = v;
        } catch (e) {}
      });
      map[c.id] = { meta: c, state, list: listName[c.idList] || "" };
    });
    return map;
  }

  async function build(t) {
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

    const billable = [];
    const unrated = [];
    const cardDetails = [];
    let billableHours = 0, totalAmount = 0;

    mapped.forEach((id) => {
      const entry = cardMap[id];
      if (!entry) return;
      const s = entry.state;
      const name = entry.meta.name || "(unnamed card)";
      const list = entry.list || "";
      const rate = s && typeof s.hourlyRate === "number" ? s.hourlyRate : null;
      const ds = dueStatus(entry.meta.due, entry.meta.dueComplete);
      const elH = +(elapsedOf(s) / 3600).toFixed(2);
      const progress = computeProgress(s);

      // Card Details — every tracked card, regardless of billing rate
      cardDetails.push({ name, list, progress, hours: elH, due: ds, rate });

      if (rate) {
        const amount = +(elH * rate).toFixed(2);
        billableHours += elH;
        totalAmount += amount;
        billable.push({ name, list, rate, hours: elH, amount, progress, due: ds });
      } else {
        unrated.push({ name, list, due: ds });
      }
    });

    billable.sort((a, b) => b.amount - a.amount);
    cardDetails.sort((a, b) => (a.due && a.due.date ? a.due.date : Infinity) - (b.due && b.due.date ? b.due.date : Infinity));

    return {
      metrics: {
        billableCards: billable.length,
        billableHours: +billableHours.toFixed(1),
        totalAmount: +totalAmount.toFixed(2),
        noRateCount: unrated.length,
      },
      cardDetails,
      billable,
      unrated,
    };
  }

  return { build };
})();