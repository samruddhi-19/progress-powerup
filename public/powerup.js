/* global TrelloPowerUp */

var ICON = "https://cdn-icons-png.flaticon.com/512/992/992651.png";
var Promise = TrelloPowerUp.Promise;

/* ----------------------------------------
   HELPERS
---------------------------------------- */

function makeBar(pct) {
  const total = 10;
  const filled = Math.round((pct / 100) * total);
  return "█".repeat(filled) + "▒".repeat(total - filled);
}

function formatHM(sec) {
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  return `${h}:${m}`;
}

function computeElapsed(data) {
  if (!data || !data.running || !data.startTime) return data?.elapsed || 0;
  const now = Date.now();
  return data.elapsed + Math.floor((now - data.startTime) / 1000);
}

function computeTimerProgress(data) {
  if (!data) return 0;
  const elapsed = computeElapsed(data);
  const estimated = data.estimated || 8 * 3600;
  const progress = Math.min(100, Math.round((elapsed / estimated) * 100));
  return progress;
}

// Inject CSS into main Trello document
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
  } catch (e) {
    console.log("CSS injection note:", e);
  }
}

// Call injection when available
if (document.head) {
  injectBadgeStyles();
} else {
  document.addEventListener("DOMContentLoaded", injectBadgeStyles);
}

/* ----------------------------------------
   INITIALIZE POWER-UP
---------------------------------------- */

TrelloPowerUp.initialize({

   "authorization-status": function (t) {
    return t.get("member", "private", "authorized")
      .then((v) => ({ authorized: v === true }));
  },

  "show-authorization": function (t) {
    return t.popup({
      title: "Authorize Progress Power-Up",
      url: "./auth.html",
      height: 200,
    });
  },
  
  "board-buttons": async function (t) {
    const disabled = await t.get("board", "shared", "disabled");

    if (disabled)
      return [
        {
          icon: ICON,
          text: "Progress",
          callback: function (t, opts) {
            return t.popup({
              title: "Authorize power up",
              url: "./auth.html",
              height: 200,
              mouseEvent: opts.mouseEvent,
            });
          },
        },
      ];

    return [
      {
        icon: ICON,
        text: "Progress",
        callback: function (t, opts) {
          return t.popup({
            title: "Progress Settings",
            url: "./settings.html",
            height: 620,
            mouseEvent: opts.mouseEvent,
          });
        },
      },
    ];
  },

  "card-back-section": async function (t) {
    injectBadgeStyles();

    const disabled = await t.get("board", "shared", "disabled");
    if (disabled) return null;

    const cardData = await t.get("card", "shared");
    if (!cardData || cardData.disabledProgress === true) return null;

    return {
      title: "Progress",
      icon: ICON,
      content: {
        type: "iframe",
        url: t.signUrl("./card-progress.html"),
        height: 180,
      },
    };
  },

  "card-badges": async function (t) {
    injectBadgeStyles();

    const disabled = await t.get("board", "shared", "disabled");
    if (disabled) return [];

    const [data, hideBadges, hideBars, hideTimer] = await Promise.all([
      t.get("card", "shared"),
      t.get("board", "shared", "hideBadges"),
      t.get("board", "shared", "hideProgressBars"),
      t.get("board", "shared", "hideTimerBadges"),
    ]);

    if (hideBadges || !data) return [];
    if (data.disabledProgress) return [];

    const badges = [];

    if (data.focusMode) {
      badges.push({
        text: "🎯 Focus",
        color: "red",
      });
    }

    badges.push({
      title: "Progress",
      text: (() => {
        const pct = computeTimerProgress(data);
        return hideBars ? pct + "%" : `${makeBar(pct)} ${pct}%`;
      })(),
      color: "green",
      dynamic: function (t) {
        return t.get("card", "shared").then((cardData) => {
          if (!cardData) return { text: "0%", color: "green" };
          const pct = computeTimerProgress(cardData);
          return {
            text: hideBars ? pct + "%" : `${makeBar(pct)} ${pct}%`,
            color: "green",
          };
        });
      },
      refresh: 250,
    });

    if (!hideTimer) {
      badges.push({
        text: "",
        dynamic: function (t) {
          return t.get("card", "shared").then((d) => {
            if (!d) return { text: "" };
            const el = computeElapsed(d);
            const est = d.estimated || 8 * 3600;
            return {
              text: `⏱ ${formatHM(el)} | Est ${formatHM(est)}`,
              color: "blue",
            };
          });
        },
        refresh: 100,
      });
    }

    return badges;
  },

  "card-detail-badges": async function (t) {
    injectBadgeStyles();

    const disabled = await t.get("board", "shared", "disabled");
    if (disabled) return [];

    return Promise.all([
      t.get("card", "shared"),
      t.get("board", "shared", "hideDetailBadges"),
      t.get("board", "shared", "hideProgressBars"),
      t.get("board", "shared", "hideTimerBadges"),
    ]).then(([data, hideDetail, hideBars, hideTimer]) => {
      if (hideDetail || !data) return [];

      const badges = [];

      if (data.focusMode) {
        badges.push({
          title: "Focus",
          text: "🎯 Focus ON",
          color: "red",
        });
      }

      badges.push({
        title: "Progress",
        dynamic: function (t) {
          return t.get("card", "shared").then((cardData) => {
            if (!cardData) return { text: "0%", color: "green" };
            const pct = computeTimerProgress(cardData);
            return {
              text: hideBars ? pct + "%" : `${makeBar(pct)} ${pct}%`,
              color: "green",
            };
          });
        },
        refresh: 100,
      });

      if (!hideTimer) {
        badges.push({
          title: "Timer",
          dynamic: function (t) {
            return t.get("card", "shared").then((d) => {
              if (!d) return { text: "" };
              const el = computeElapsed(d);
              const est = d.estimated || 8 * 3600;
              return {
                text: `⏱ ${formatHM(el)} | Est ${formatHM(est)}`,
                color: "blue",
              };
            });
          },
          refresh: 100,
        });
      }

      return badges;
    });
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