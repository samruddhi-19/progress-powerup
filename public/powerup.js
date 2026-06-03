/* global TrelloPowerUp */

var ICON = "https://cdn-icons-png.flaticon.com/512/992/992651.png";
var Promise = TrelloPowerUp.Promise;

/* ----------------------------------------
   HELPERS
---------------------------------------- */

function makeBar(pct) {
  if (pct === undefined || pct === null || isNaN(pct)) pct = 0;
  const total = 10;
  const filled = Math.round((pct / 100) * total);
  return "█".repeat(filled) + "▒".repeat(total - filled);
}

function formatUnit(sec, unit) {
  if (sec === undefined || sec === null || isNaN(sec) || sec === 0) {
    return unit === "hours" ? "00:00" : "0";
  }

  if (!unit || unit === "hours") {
    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    return `${h}:${m}`;
  }

  const rates = { days: 86400, weeks: 604800, months: 2592000 };
  const symbols = { days: "d", weeks: "w", months: "mo" };
  const value = parseFloat((sec / rates[unit]).toFixed(1));
  return value + symbols[unit];
}

function computeElapsed(cardData) {
  if (!cardData || !cardData.data) return cardData?.elapsed || 0;

  const unit = cardData.trackingUnit || "hours";
  const unitData = cardData.data[unit] || { elapsed: 0 };

  if (unit === "hours" && cardData.running && cardData.startTime) {
    const now = Date.now();
    return unitData.elapsed + Math.floor((now - cardData.startTime) / 1000);
  }
  return unitData.elapsed || 0;
}

function computeEstimated(cardData) {
  if (!cardData || !cardData.data) return cardData?.estimated || 8 * 3600;
  const unit = cardData.trackingUnit || "hours";
  const unitData = cardData.data[unit] || { estimated: 8 * 3600 };
  return unitData.estimated || 8 * 3600;
}

function computeTimerProgress(cardData) {
  const elapsed = computeElapsed(cardData);
  const estimated = computeEstimated(cardData);
  if (estimated === 0) return 0;
  const progress = Math.min(100, Math.round((elapsed / estimated) * 100));
  return isNaN(progress) ? 0 : progress;
}

/* ----------------------------------------
   KEY FIX: getCardData
   Falls back to board-level defaults written
   by startMapping() in progress-cards.js.
   On first hit it writes the defaults onto
   the card so every subsequent read is fast.
---------------------------------------- */
async function getCardData(t) {
  const cardData = await t.get("card", "shared");
  if (cardData) return cardData;

  // No card data yet — check board defaults set during mapping
  const card = await t.card("id");
  const cardDefaults = await t.get("board", "shared", "cardDefaults");

  if (cardDefaults && cardDefaults[card.id]) {
    const defaults = cardDefaults[card.id];
    // Write defaults to card storage so future reads skip this fallback
    await t.set("card", "shared", defaults);
    return defaults;
  }

  return null;
}

function injectBadgeStyles() {
  try {
    const css = `
      .trello-card .badge[data-badge-text*="⏱"] {
        background: rgba(52, 211, 153, 0.2) !important;
        color: #10b981 !important;
        border: 1px solid rgba(16, 185, 129, 0.4) !important;
      }
      .trello-card .badge[data-badge-text*="█"],
      .trello-card .badge[data-badge-text*="▒"] {
        background: rgba(34, 197, 94, 0.2) !important;
        color: #22c55e !important;
        border: 1px solid rgba(34, 197, 94, 0.4) !important;
      }
      .trello-card .badge[data-badge-text*="🎯"] {
        background: rgba(239, 68, 68, 0.2) !important;
        color: #ef4444 !important;
        border: 1px solid rgba(239, 68, 68, 0.4) !important;
      }
    `;

    let style = document.getElementById("trello-progress-badge-styles");
    if (!style) {
      style = document.createElement("style");
      style.id = "trello-progress-badge-styles";
      document.head.appendChild(style);
    }
    style.innerHTML = css;
  } catch (e) {}
}

if (document.head) injectBadgeStyles();
else document.addEventListener("DOMContentLoaded", injectBadgeStyles);

/* ----------------------------------------
   INITIALIZE POWER-UP
---------------------------------------- */

TrelloPowerUp.initialize({
  "authorization-status": async function (t) {
    const authorized = await t.get("member", "private", "authorized");
    const disabled = await t.get("board", "shared", "disabled");
    if (authorized === undefined) {
      await t.set("member", "private", "authorized", false);
      await t.set("board", "shared", "disabled", true);
      return { authorized: false };
    }
    return { authorized: authorized === true };
  },

  "show-authorization": function (t) {
    return t.popup({
      title: "Authorize Progress Power-Up",
      url: "./auth.html",
      height: 200,
    });
  },

  "board-buttons": async function (t, opts) {
    const disabled = await t.get("board", "shared", "disabled");
    return [
      {
        icon: ICON,
        text: disabled ? "Authorize" : "Progress",
        callback: function (t) {
          return t.popup({
            title: disabled ? "Authorize Progress" : "Progress Cards",
            url: disabled ? "./settings.html" : "./progress-cards.html",
            height: disabled ? 260 : 560,
            mouseEvent: opts.mouseEvent,
          });
        },
      },
    ];
  },

  // ── Uses getCardData so newly mapped cards show the section ──
  "card-back-section": async function (t) {
    injectBadgeStyles();
    const disabled = await t.get("board", "shared", "disabled");
    if (disabled) return null;

    const cardData = await getCardData(t); // ← was t.get("card", "shared")
    if (!cardData || cardData.disabledProgress === true) return null;

    return {
      title: "Progress",
      icon: ICON,
      content: {
        type: "iframe",
        url: t.signUrl("./card-progress.html"),
        height: 500,
      },
    };
  },

  // ── Uses getCardData so badges appear on newly mapped cards ──
  "card-badges": async function (t) {
    try {
      injectBadgeStyles();

      const mapped = (await t.get("board", "shared", "mappedCards")) || [];
      const card = await t.card("id");

      if (!mapped.includes(card.id)) return [];

      const disabled = await t.get("board", "shared", "disabled");
      if (disabled) return [];

      const [data, hideBadges, hideBars, hideTimer] = await Promise.all([
        getCardData(t), // ← was t.get("card", "shared")
        t.get("board", "shared", "hideBadges"),
        t.get("board", "shared", "hideProgressBars"),
        t.get("board", "shared", "hideTimerBadges"),
      ]);

      if (hideBadges || !data) return [];
      if (data.disabledProgress) return [];

      const badges = [];

      if (data.focusMode) {
        badges.push({ text: "🎯 Focus", color: "red" });
      }

      const pct = computeTimerProgress(data) || 0;
      badges.push({
        title: "Progress",
        text: hideBars ? `${pct}%` : `${makeBar(pct)} ${pct}%`,
        color: "green",
        dynamic: function (t) {
          return t
            .get("card", "shared")
            .then((cardData) => {
              if (!cardData) return { text: "0%", color: "green" };
              const pct = computeTimerProgress(cardData) || 0;
              return {
                text: hideBars ? `${pct}%` : `${makeBar(pct)} ${pct}%`,
                color: "green",
              };
            })
            .catch(() => ({ text: "0%", color: "green" }));
        },
        refresh: 250,
      });

      if (!hideTimer) {
        const el = computeElapsed(data) || 0;
        const est = computeEstimated(data) || 8 * 3600;
        const unit = data.trackingUnit || "hours";

        badges.push({
          title: "Timer",
          text: `⏱ ${formatUnit(el, unit)} | Est ${formatUnit(est, unit)}`,
          color: "blue",
          dynamic: function (t) {
            return t
              .get("card", "shared")
              .then((d) => {
                if (!d) return { text: "" };
                const el = computeElapsed(d) || 0;
                const est = computeEstimated(d) || computeEstimated(data);
                const u = d.trackingUnit || "hours";
                return {
                  text: `⏱ ${formatUnit(el, u)} | Est ${formatUnit(est, u)}`,
                  color: "blue",
                };
              })
              .catch(() => ({ text: "" }));
          },
          refresh: 100,
        });
      }

      return badges;
    } catch (error) {
      return [];
    }
  },

  // ── Uses getCardData so detail badges appear on newly mapped cards ──
  "card-detail-badges": async function (t) {
    try {
      injectBadgeStyles();
      const disabled = await t.get("board", "shared", "disabled");
      if (disabled) return [];

      const [data, hideDetail, hideBars, hideTimer] = await Promise.all([
        getCardData(t), // ← was t.get("card", "shared")
        t.get("board", "shared", "hideDetailBadges"),
        t.get("board", "shared", "hideProgressBars"),
        t.get("board", "shared", "hideTimerBadges"),
      ]);

      if (hideDetail || !data) return [];

      const badges = [];

      if (data.focusMode) {
        badges.push({ title: "Focus", text: "🎯 Focus ON", color: "red" });
      }

      badges.push({
        title: "Progress",
        dynamic: function (t) {
          return t
            .get("card", "shared")
            .then((cardData) => {
              if (!cardData) return { text: "0%", color: "green" };
              const pct = computeTimerProgress(cardData) || 0;
              return {
                text: hideBars ? `${pct}%` : `${makeBar(pct)} ${pct}%`,
                color: "green",
              };
            })
            .catch(() => ({ text: "0%", color: "green" }));
        },
        refresh: 100,
      });

      if (!hideTimer) {
        badges.push({
          title: "Timer",
          dynamic: function (t) {
            return t
              .get("card", "shared")
              .then((d) => {
                if (!d) return { text: "" };
                const el = computeElapsed(d) || 0;
                const est = computeEstimated(d) || computeEstimated(data);
                const u = d.trackingUnit || "hours";
                return {
                  text: `⏱ ${formatUnit(el, u)} | Est ${formatUnit(est, u)}`,
                  color: "blue",
                };
              })
              .catch(() => ({ text: "" }));
          },
          refresh: 100,
        });
      }

      return badges;
    } catch (error) {
      return [];
    }
  },

  "card-buttons": async function (t) {
    const data = await t.get("card", "shared");
    const isHidden = data?.disabledProgress === true;
    return [
      {
        icon: ICON,
        text: isHidden ? "Add Progress" : "Hide Progress",
        callback: function (t) {
          if (!data) {
            return t.set("card", "shared", {
              progress: 0,
              elapsed: 0,
              estimated: 8 * 3600,
              running: false,
              startTime: null,
              focusMode: false,
              disabledProgress: false,
              trackingUnit: "hours",
              data: {
                hours:  { elapsed: 0, estimated: 8 * 3600 },
                days:   { elapsed: 0, estimated: 1 * 86400 },
                weeks:  { elapsed: 0, estimated: 1 * 604800 },
                months: { elapsed: 0, estimated: 1 * 2592000 },
              },
            });
          }
          return t.set("card", "shared", "disabledProgress", !isHidden);
        },
      },
    ];
  },

  "card-moved": function (t, opts) {
    return Promise.all([
      t.get("card", "shared"),
      t.get("board", "shared", "autoTrackMode"),
      t.get("board", "shared", "autoTrackLists"),
    ]).then(([data, mode, lists]) => {
      if (!data) return;
      if (mode !== "list" && mode !== "both") return;
      if (!lists || lists.length === 0) return;

      const destListId = opts.to.list.id;
      if (!lists.includes(destListId)) return;

      if (!data.running) {
        return t.set("card", "shared", {
          ...data,
          running: true,
          startTime: Date.now(),
          focusMode: true,
        });
      }

      return t
        .popup({
          title: "Restart Timer?",
          url: "./confirm-restart.html",
          height: 150,
          args: { cardData: data },
        })
        .then((result) => {
          if (!result || result.restart !== true) return;
          return t.set("card", "shared", {
            ...data,
            elapsed: 0,
            running: true,
            startTime: Date.now(),
            focusMode: true,
          });
        });
    });
  },
});