/* global TrelloPowerUp */

var ICON = "https://cdn-icons-png.flaticon.com/512/992/992651.png";
var Promise = TrelloPowerUp.Promise;

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */

/**
 * Clean progress bar using thin unicode blocks.
 * Looks like:  ▰▰▰▰▰▱▱▱▱▱  50%
 */
function makeBar(pct) {
  if (pct === undefined || pct === null || isNaN(pct)) pct = 0;
  const total  = 8;
  const filled = Math.round((Math.min(pct, 100) / 100) * total);
  return "▰".repeat(filled) + "▱".repeat(total - filled);
}

function formatUnit(sec, unit) {
  if (!sec || isNaN(sec)) return unit === "hours" ? "0:00" : "0";
  if (!unit || unit === "hours") {
    const h = Math.floor(sec / 3600);
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    return `${h}:${m}`;
  }
  const rates   = { days: 86400, weeks: 604800, months: 2592000 };
  const symbols = { days: "d",   weeks: "w",    months: "mo"    };
  return parseFloat((sec / rates[unit]).toFixed(1)) + symbols[unit];
}

function computeElapsed(cardData) {
  if (!cardData || !cardData.data) return cardData?.elapsed || 0;
  const unit     = cardData.trackingUnit || "hours";
  const unitData = cardData.data[unit]   || { elapsed: 0 };
  if (unit === "hours" && cardData.running && cardData.startTime) {
    return unitData.elapsed + Math.floor((Date.now() - cardData.startTime) / 1000);
  }
  return unitData.elapsed || 0;
}

function computeEstimated(cardData) {
  if (!cardData || !cardData.data) return cardData?.estimated || 8 * 3600;
  const unit     = cardData.trackingUnit || "hours";
  const unitData = cardData.data[unit]   || { estimated: 8 * 3600 };
  return unitData.estimated || 8 * 3600;
}

function computeProgress(cardData) {
  if (!cardData) return 0;

  // Manual or task-based progress
  if (cardData.progressSource === "manual") {
    return Math.min(100, cardData.manualProgress || 0);
  }
  if (cardData.progressSource === "tasks") {
    const tasks = cardData.tasks || [];
    if (!tasks.length) return 0;
    return Math.round((tasks.filter(t => t.done).length / tasks.length) * 100);
  }

  // Timer-based (default)
  const elapsed   = computeElapsed(cardData);
  const estimated = computeEstimated(cardData);
  if (!estimated) return 0;
  return Math.min(100, Math.round((elapsed / estimated) * 100));
}

/* ─────────────────────────────────────────
   getCardData — falls back to board defaults
   for newly mapped cards that haven't opened
   their card back yet.
───────────────────────────────────────── */
async function getCardData(t) {
  const cardData = await t.get("card", "shared");
  if (cardData) return cardData;

  const card         = await t.card("id");
  const cardDefaults = await t.get("board", "shared", "cardDefaults");

  if (cardDefaults && cardDefaults[card.id]) {
    const defaults = cardDefaults[card.id];
    await t.set("card", "shared", defaults);
    return defaults;
  }
  return null;
}

/* ─────────────────────────────────────────
   INITIALIZE
───────────────────────────────────────── */

TrelloPowerUp.initialize({

  "authorization-status": async function (t) {
    const authorized = await t.get("member", "private", "authorized");
    if (authorized === undefined) {
      await t.set("member", "private", "authorized", false);
      await t.set("board",  "shared",  "disabled",   true);
      return { authorized: false };
    }
    return { authorized: authorized === true };
  },

  "show-authorization": function (t) {
    return t.popup({ title: "Authorize Progress Power-Up", url: "./auth.html", height: 200 });
  },

  /* ── Board button → Progress Cards popup ── */
  "board-buttons": async function (t, opts) {
    const disabled = await t.get("board", "shared", "disabled");
    return [{
      icon: ICON,
      text: disabled ? "Authorize" : "Progress",
      callback: function (t) {
        return t.popup({
          title:      disabled ? "Authorize Progress" : "Progress Cards",
          url:        disabled ? "./settings.html"    : "./progress-cards.html",
          height:     disabled ? 260                  : 560,
          mouseEvent: opts.mouseEvent,
        });
      },
    }];
  },

  /* ── Card back section ── */
  "card-back-section": async function (t) {
    const disabled = await t.get("board", "shared", "disabled");
    if (disabled) return null;
    const cardData = await getCardData(t);
    if (!cardData || cardData.disabledProgress === true) return null;
    return {
      title: "Progress",
      icon:  ICON,
      content: {
        type:   "iframe",
        url:    t.signUrl("./card-progress.html"),
        height: 500,
      },
    };
  },

  /* ══════════════════════════════════════════
     CARD BADGES  — clean, professional look
     ══════════════════════════════════════════
     Format:
       Badge 1 (green):  ▰▰▰▰▱▱▱▱  50%
       Badge 2 (blue):   ⏱ 1:23
       Badge 3 (red):    🎯 Focus   (only in focus mode)
  ══════════════════════════════════════════ */
  "card-badges": async function (t) {
    try {
      const disabled = await t.get("board", "shared", "disabled");
      if (disabled) return [];

      const [data, hideBadges, hideBars, hideTimer] = await Promise.all([
        getCardData(t),
        t.get("board", "shared", "hideBadges"),
        t.get("board", "shared", "hideProgressBars"),
        t.get("board", "shared", "hideTimerBadges"),
      ]);

      if (hideBadges || !data || data.disabledProgress) return [];

      const badges = [];

      /* Focus mode pill */
      if (data.focusMode) {
        badges.push({ text: "🎯 Focus", color: "red" });
      }

      /* ── Progress badge ── */
      const pct = computeProgress(data);
      badges.push({
        title: "Progress",
        text:  hideBars ? `${pct}%` : `${makeBar(pct)}  ${pct}%`,
        color: pct >= 100 ? "green" : "blue",
        dynamic: function (t) {
          return getCardData(t).then(function (d) {
            if (!d) return { text: "▱▱▱▱▱▱▱▱  0%", color: "blue" };
            const p = computeProgress(d);
            return {
              text:  hideBars ? `${p}%` : `${makeBar(p)}  ${p}%`,
              color: p >= 100 ? "green" : "blue",
            };
          }).catch(function () { return { text: "0%", color: "blue" }; });
        },
        refresh: 30,
      });

      /* ── Timer badge (elapsed only, clean) ── */
      if (!hideTimer) {
        const unit = data.trackingUnit || "hours";
        const el   = computeElapsed(data);
        badges.push({
          title: "Time",
          text:  `⏱ ${formatUnit(el, unit)}`,
          color: "blue",
          dynamic: function (t) {
            return getCardData(t).then(function (d) {
              if (!d) return { text: "⏱ 0:00", color: "blue" };
              const elapsed = computeElapsed(d);
              const u       = d.trackingUnit || "hours";
              return { text: `⏱ ${formatUnit(elapsed, u)}`, color: "blue" };
            }).catch(function () { return { text: "⏱ 0:00", color: "blue" }; });
          },
          refresh: 10,
        });
      }

      return badges;
    } catch (e) { return []; }
  },

  /* ── Card detail badges (inside card view) ── */
  "card-detail-badges": async function (t) {
    try {
      const disabled = await t.get("board", "shared", "disabled");
      if (disabled) return [];

      const [data, hideDetail, hideBars, hideTimer] = await Promise.all([
        getCardData(t),
        t.get("board", "shared", "hideDetailBadges"),
        t.get("board", "shared", "hideProgressBars"),
        t.get("board", "shared", "hideTimerBadges"),
      ]);

      if (hideDetail || !data || data.disabledProgress) return [];

      const badges = [];

      if (data.focusMode) {
        badges.push({ title: "Focus", text: "🎯 Focus ON", color: "red" });
      }

      badges.push({
        title: "Progress",
        dynamic: function (t) {
          return getCardData(t).then(function (d) {
            if (!d) return { text: "▱▱▱▱▱▱▱▱  0%", color: "blue" };
            const p = computeProgress(d);
            return {
              text:  hideBars ? `${p}%` : `${makeBar(p)}  ${p}%`,
              color: p >= 100 ? "green" : "blue",
            };
          }).catch(function () { return { text: "0%", color: "blue" }; });
        },
        refresh: 30,
      });

      if (!hideTimer) {
        badges.push({
          title: "Time",
          dynamic: function (t) {
            return getCardData(t).then(function (d) {
              if (!d) return { text: "⏱ 0:00", color: "blue" };
              const elapsed = computeElapsed(d);
              const u       = d.trackingUnit || "hours";
              return { text: `⏱ ${formatUnit(elapsed, u)}`, color: "blue" };
            }).catch(function () { return { text: "⏱ 0:00", color: "blue" }; });
          },
          refresh: 10,
        });
      }

      return badges;
    } catch (e) { return []; }
  },

  /* ── Card buttons ── */
  "card-buttons": async function (t) {
    const data     = await t.get("card", "shared");
    const isHidden = data?.disabledProgress === true;
    return [{
      icon: ICON,
      text: isHidden ? "Add Progress" : "Hide Progress",
      callback: function (t) {
        if (!data) {
          return t.set("card", "shared", {
            progress: 0, elapsed: 0, estimated: 8 * 3600,
            running: false, startTime: null, focusMode: false,
            disabledProgress: false, trackingUnit: "hours",
            progressSource: "tasks", manualProgress: 0, tasks: [],
            data: {
              hours:  { elapsed: 0, estimated: 8 * 3600   },
              days:   { elapsed: 0, estimated: 86400       },
              weeks:  { elapsed: 0, estimated: 604800      },
              months: { elapsed: 0, estimated: 2592000     },
            },
          });
        }
        return t.set("card", "shared", "disabledProgress", !isHidden);
      },
    }];
  },

  /* ── Card moved (auto-track) ── */
  "card-moved": function (t, opts) {
    return Promise.all([
      t.get("card", "shared"),
      t.get("board", "shared", "autoTrackMode"),
      t.get("board", "shared", "autoTrackLists"),
    ]).then(([data, mode, lists]) => {
      if (!data) return;
      if (mode !== "list" && mode !== "both") return;
      if (!lists || !lists.length) return;
      if (!lists.includes(opts.to.list.id)) return;

      if (!data.running) {
        return t.set("card", "shared", { ...data, running: true, startTime: Date.now(), focusMode: true });
      }
      return t.popup({
        title: "Restart Timer?", url: "./confirm-restart.html", height: 150, args: { cardData: data },
      }).then((result) => {
        if (!result || result.restart !== true) return;
        return t.set("card", "shared", { ...data, elapsed: 0, running: true, startTime: Date.now(), focusMode: true });
      });
    });
  },

});