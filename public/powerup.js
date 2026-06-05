/* global TrelloPowerUp */

var ICON = "https://cdn-icons-png.flaticon.com/512/992/992651.png";
var Promise = TrelloPowerUp.Promise;

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */

function makeBar(pct) {
  if (!pct || isNaN(pct)) pct = 0;
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
  if (cardData.progressSource === "manual") return Math.min(100, cardData.manualProgress || 0);
  if (cardData.progressSource === "tasks") {
    const tasks = cardData.tasks || [];
    if (!tasks.length) return 0;
    return Math.round((tasks.filter(t => t.done).length / tasks.length) * 100);
  }
  const elapsed   = computeElapsed(cardData);
  const estimated = computeEstimated(cardData);
  if (!estimated) return 0;
  return Math.min(100, Math.round((elapsed / estimated) * 100));
}

function formatETA(etaDate, etaTime) {
  if (!etaDate) return null;
  try {
    const dt = new Date(`${etaDate}T${etaTime || "00:00"}`);
    return dt.toLocaleDateString("en-US", { day: "numeric", month: "short" })
      + (etaTime ? ", " + dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "");
  } catch (e) { return null; }
}

/* ─────────────────────────────────────────
   getCardData — falls back to board defaults
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

  // Card was mapped but no defaults exist yet — initialize fresh data
  const mappedCards = await t.get("board", "shared", "mappedCards");
  if (mappedCards && mappedCards.includes(card.id)) {
    const fresh = {
      progress: 0, elapsed: 0, estimated: 8 * 3600,
      running: false, startTime: null, focusMode: false,
      disabledProgress: false, trackingUnit: "hours",
      progressSource: "tasks", manualProgress: 0, tasks: [],
      data: {
        hours:  { elapsed: 0, estimated: 8 * 3600 },
        days:   { elapsed: 0, estimated: 86400     },
        weeks:  { elapsed: 0, estimated: 604800    },
        months: { elapsed: 0, estimated: 2592000   },
      },
    };
    await t.set("card", "shared", fresh);
    return fresh;
  }

  return null;
}

/* ─────────────────────────────────────────
   isMappedCard — only show badges/cover on
   cards the user explicitly mapped
───────────────────────────────────────── */
async function isMappedCard(t) {
  const [card, mappedCards] = await Promise.all([
    t.card("id"),
    t.get("board", "shared", "mappedCards"),
  ]);
  if (!mappedCards || !mappedCards.length) return false;
  return mappedCards.includes(card.id);
}

/* ─────────────────────────────────────────
   generateCoverHTML
   [Tag pill]              [timer]
   Card Name
   [ETA pill] [SubTask pill]   ← only if set
   [progress bar flush bottom]
───────────────────────────────────────── */
function generateCoverHTML(cardName, labelName, labelColor, elapsed, unit, pct, etaStr, firstTaskName) {
  const labelColors = {
    blue:   { bg: "#0052cc", text: "#e9f2ff" },
    sky:    { bg: "#0065ff", text: "#e9f2ff" },
    lime:   { bg: "#1f845a", text: "#dcfff1" },
    green:  { bg: "#1f845a", text: "#dcfff1" },
    yellow: { bg: "#946f00", text: "#fff7d6" },
    orange: { bg: "#a54800", text: "#fff3eb" },
    red:    { bg: "#c9372c", text: "#ffd5d2" },
    pink:   { bg: "#943d73", text: "#ffecf8" },
    purple: { bg: "#6e5dc6", text: "#f3f0ff" },
    black:  { bg: "#2c333a", text: "#b6c2cf" },
  };
  const lc       = labelColors[labelColor] || { bg: "#00bcd4", text: "#002830" };
  const timerStr = formatUnit(elapsed, unit);
  const barPct   = Math.min(100, pct);
  const barColor = barPct >= 100 ? "#22a06b" : barPct >= 60 ? "#e2812d" : "#00bcd4";

  const tagHTML = labelName
    ? `<span style="background:${lc.bg};color:${lc.text};font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;letter-spacing:0.02em;white-space:nowrap;max-width:110px;overflow:hidden;text-overflow:ellipsis;">${labelName}</span>`
    : `<span></span>`;

  const etaHTML = etaStr
    ? `<span style="background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.8);font-size:11px;font-weight:600;padding:3px 9px;border-radius:6px;white-space:nowrap;border:1px solid rgba(255,255,255,0.12);max-width:140px;overflow:hidden;text-overflow:ellipsis;">ETA: ${etaStr}</span>`
    : "";

  const taskHTML = firstTaskName
    ? `<span style="background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.8);font-size:11px;font-weight:600;padding:3px 9px;border-radius:6px;white-space:nowrap;border:1px solid rgba(255,255,255,0.12);max-width:140px;overflow:hidden;text-overflow:ellipsis;">Sub Task : ${firstTaskName}</span>`
    : "";

  const metaRow = (etaHTML || taskHTML)
    ? `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:7px;flex-shrink:0;">${etaHTML}${taskHTML}</div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  html,body{width:100%;height:100%;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}
  .cover{width:100%;height:100%;background:#1e2027;display:flex;flex-direction:column;padding:11px 13px 0;}
  .row1{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-shrink:0;}
  .timer{font-family:"SF Mono","Fira Code",monospace;font-size:13px;font-weight:700;color:#00bcd4;letter-spacing:0.05em;white-space:nowrap;}
  .card-name{font-size:16px;font-weight:800;color:#fff;letter-spacing:-0.02em;line-height:1.25;margin:7px 0 0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;flex-shrink:0;}
  .bar-wrap{margin-top:auto;height:4px;background:rgba(255,255,255,0.08);}
  .bar-fill{height:100%;transition:width 0.3s ease;}
</style>
</head>
<body>
<div class="cover">
  <div class="row1">
    ${tagHTML}
    <div class="timer">${timerStr}</div>
  </div>
  <div class="card-name">${cardName.replace(/</g,"&lt;")}</div>
  ${metaRow}
  <div class="bar-wrap">
    <div class="bar-fill" style="width:${barPct}%;background:${barColor};"></div>
  </div>
</div>
</body>
</html>`;
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

  "show-settings": function (t) {
    return t.popup({
      title: "Progress Settings",
      url: "./settings.html",
      height: 620,
    });
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

  /* ── Card cover ── */
  "card-cover": async function (t) {
    try {
      const disabled = await t.get("board", "shared", "disabled");
      if (disabled) return null;

      const mapped = await isMappedCard(t);
      if (!mapped) return null;

      const [data, card] = await Promise.all([
        getCardData(t),
        t.card("name", "labels"),
      ]);
      if (!data || data.disabledProgress) return null;

      const pct           = computeProgress(data);
      const elapsed       = computeElapsed(data);
      const unit          = data.trackingUnit || "hours";
      const labelName     = card.labels?.[0]?.name  || card.labels?.[0]?.color || "";
      const labelColor    = card.labels?.[0]?.color || "";
      const etaStr        = formatETA(data.etaDate, data.etaTime);
      const firstTask     = (data.tasks || []).find(tk => !tk.done) || data.tasks?.[0];
      const firstTaskName = firstTask?.name || "";

      const html = generateCoverHTML(
        card.name, labelName, labelColor, elapsed, unit, pct, etaStr, firstTaskName
      );

      return {
        type:    "html",
        html:    html,
        height:  160,
        refresh: 10,
      };
    } catch (e) { return null; }
  },

  /* ── Card back section ── */
  "card-back-section": async function (t) {
    const disabled = await t.get("board", "shared", "disabled");
    if (disabled) return null;

    const mapped = await isMappedCard(t);
    if (!mapped) return null;

    const cardData = await getCardData(t);
    if (cardData && cardData.disabledProgress === true) return null;

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

  /* ── Card badges — ONLY on mapped cards ── */
  "card-badges": async function (t) {
    try {
      const disabled = await t.get("board", "shared", "disabled");
      if (disabled) return [];

      const mapped = await isMappedCard(t);
      if (!mapped) return [];

      const [data, hideBadges, hideBars, hideTimer] = await Promise.all([
        getCardData(t),
        t.get("board", "shared", "hideBadges"),
        t.get("board", "shared", "hideProgressBars"),
        t.get("board", "shared", "hideTimerBadges"),
      ]);

      if (hideBadges || !data || data.disabledProgress) return [];

      const badges = [];

      if (data.focusMode) badges.push({ text: "🎯 Focus", color: "red" });

      const pct = computeProgress(data);
      badges.push({
        title: "Progress",
        text:  hideBars ? `${pct}%` : `${makeBar(pct)}  ${pct}%`,
        color: pct >= 100 ? "green" : "blue",
        dynamic: function (t) {
          return getCardData(t).then(function (d) {
            if (!d) return { text: "▱▱▱▱▱▱▱▱  0%", color: "blue" };
            const p = computeProgress(d);
            return { text: hideBars ? `${p}%` : `${makeBar(p)}  ${p}%`, color: p >= 100 ? "green" : "blue" };
          }).catch(() => ({ text: "0%", color: "blue" }));
        },
        refresh: 30,
      });

      if (!hideTimer) {
        const unit = data.trackingUnit || "hours";
        badges.push({
          title: "Time",
          text:  `⏱ ${formatUnit(computeElapsed(data), unit)}`,
          color: "blue",
          dynamic: function (t) {
            return getCardData(t).then(function (d) {
              if (!d) return { text: "⏱ 0:00", color: "blue" };
              return { text: `⏱ ${formatUnit(computeElapsed(d), d.trackingUnit || "hours")}`, color: "blue" };
            }).catch(() => ({ text: "⏱ 0:00", color: "blue" }));
          },
          refresh: 10,
        });
      }

      return badges;
    } catch (e) { return []; }
  },

  /* ── Card detail badges — ONLY on mapped cards ── */
  "card-detail-badges": async function (t) {
    try {
      const disabled = await t.get("board", "shared", "disabled");
      if (disabled) return [];

      const mapped = await isMappedCard(t);
      if (!mapped) return [];

      const [data, hideDetail, hideBars, hideTimer] = await Promise.all([
        getCardData(t),
        t.get("board", "shared", "hideDetailBadges"),
        t.get("board", "shared", "hideProgressBars"),
        t.get("board", "shared", "hideTimerBadges"),
      ]);

      if (hideDetail || !data || data.disabledProgress) return [];

      const badges = [];
      if (data.focusMode) badges.push({ title: "Focus", text: "🎯 Focus ON", color: "red" });

      badges.push({
        title: "Progress",
        dynamic: function (t) {
          return getCardData(t).then(function (d) {
            if (!d) return { text: "▱▱▱▱▱▱▱▱  0%", color: "blue" };
            const p = computeProgress(d);
            return { text: hideBars ? `${p}%` : `${makeBar(p)}  ${p}%`, color: p >= 100 ? "green" : "blue" };
          }).catch(() => ({ text: "0%", color: "blue" }));
        },
        refresh: 30,
      });

      if (!hideTimer) {
        badges.push({
          title: "Time",
          dynamic: function (t) {
            return getCardData(t).then(function (d) {
              if (!d) return { text: "⏱ 0:00", color: "blue" };
              return { text: `⏱ ${formatUnit(computeElapsed(d), d.trackingUnit || "hours")}`, color: "blue" };
            }).catch(() => ({ text: "⏱ 0:00", color: "blue" }));
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
              hours:  { elapsed: 0, estimated: 8 * 3600 },
              days:   { elapsed: 0, estimated: 86400     },
              weeks:  { elapsed: 0, estimated: 604800    },
              months: { elapsed: 0, estimated: 2592000   },
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