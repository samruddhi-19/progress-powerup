/* global TrelloPowerUp */

var ICON = "https://cdn-icons-png.flaticon.com/512/992/992651.png";
var Promise = TrelloPowerUp.Promise;

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */

function makeBar(pct) {
  if (!pct || isNaN(pct)) pct = 0;
  const clamped = Math.min(pct, 100);
  const filled = Math.round((clamped / 100) * 10);
  const empty = 10 - filled;
  return "▰".repeat(filled) + "▱".repeat(empty);
}

function formatUnit(sec, unit) {
  if (!sec || isNaN(sec)) return unit === "hours" ? "0:00" : "0";
  if (!unit || unit === "hours") {
    const h = Math.floor(sec / 3600);
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    return `${h}:${m}`;
  }
  const rates = { days: 86400, weeks: 604800, months: 2592000 };
  const symbols = { days: "d", weeks: "w", months: "mo" };
  return parseFloat((sec / rates[unit]).toFixed(1)) + symbols[unit];
}

function computeElapsed(d) {
  if (!d) return 0;
  const unit = d.trackingUnit || "hours";
  const bucket =
    d.data && d.data[unit] ? d.data[unit] : { elapsed: d.elapsed || 0 };
  let el = Number(bucket.elapsed) || 0;
  if (unit === "hours" && d.running && d.startTime)
    el += Math.floor((Date.now() - d.startTime) / 1000);
  return el;
}

function computeEstimated(d) {
  if (!d) return 8 * 3600;
  const unit = d.trackingUnit || "hours";
  const bucket = d.data && d.data[unit] ? d.data[unit] : {};
  return Number(bucket.estimated) || d.estimated || 8 * 3600;
}

function computeProgress(d) {
  if (!d) return 0;
  if (d.progressSource === "manual")
    return Math.min(100, d.manualProgress || 0);
  if (d.progressSource === "tasks") {
    const tasks = d.tasks || [];
    if (!tasks.length) return 0;
    return Math.round(
      (tasks.filter((t) => t.done).length / tasks.length) * 100,
    );
  }
  const el = computeElapsed(d);
  const est = computeEstimated(d);
  return est ? Math.min(100, Math.round((el / est) * 100)) : 0;
}

/* Format ETA date+time into a readable string like "4 Jun, 10:30 PM" */
function formatETA(etaDate, etaTime) {
  if (!etaDate) return null;
  try {
    let iso = etaDate;
    if (/^\d{2}-\d{2}-\d{4}$/.test(etaDate)) {
      const [d, m, y] = etaDate.split("-");
      iso = `${y}-${m}-${d}`;
    }
    const dt = new Date(`${iso}T${etaTime || "00:00"}`);
    if (isNaN(dt.getTime())) return null;
    const datePart = dt.toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
    });
    const timePart = etaTime
      ? dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : null;
    return timePart ? `${datePart}, ${timePart}` : datePart;
  } catch (e) {
    return null;
  }
}

/* ─────────────────────────────────────────
   getCardData
───────────────────────────────────────── */
async function getCardData(t) {
  const cardData = await t.get("card", "shared");
  if (cardData) return cardData;

  const card = await t.card("id");
  const cardDefaults = await t.get("board", "shared", "cardDefaults");
  if (cardDefaults && cardDefaults[card.id]) {
    const defaults = cardDefaults[card.id];
    await t.set("card", "shared", defaults);
    return defaults;
  }

  const mappedCards = await t.get("board", "shared", "mappedCards");
  if (mappedCards && mappedCards.includes(card.id)) {
    const fresh = {
      progress: 0,
      elapsed: 0,
      estimated: 8 * 3600,
      running: false,
      startTime: null,
      focusMode: false,
      disabledProgress: false,
      trackingUnit: "hours",
      progressSource: "tasks",
      manualProgress: 0,
      tasks: [],
      etaDate: "",
      etaTime: "",
      data: {
        hours: { elapsed: 0, estimated: 8 * 3600 },
        days: { elapsed: 0, estimated: 86400 },
        weeks: { elapsed: 0, estimated: 604800 },
        months: { elapsed: 0, estimated: 2592000 },
      },
    };
    await t.set("card", "shared", fresh);
    return fresh;
  }
  return null;
}

/* ─────────────────────────────────────────
   isMappedCard
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
   INITIALIZE
───────────────────────────────────────── */
TrelloPowerUp.initialize({
  "authorization-status": async function (t) {
    const authorized = await t.get("member", "private", "authorized");
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

  "show-settings": function (t) {
    return t.popup({
      title: "Progress Settings",
      url: "./settings.html",
      height: 620,
    });
  },

  /* ── Board button ── */
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
      icon: ICON,
      content: {
        type: "iframe",
        url: t.signUrl("./card-progress.html"),
        height: 500,
      },
    };
  },

  /* ══════════════════════════════════════════
     CARD BADGES
     Badge 1: progress bar + %
     Badge 2: ⏱ elapsed time
     Badge 3: 📅 ETA (if set and not hidden)
     Badge 4: ✦ first incomplete subtask (if any and not hidden)
  ══════════════════════════════════════════ */
  "card-badges": async function (t) {
    try {
      const disabled = await t.get("board", "shared", "disabled");
      if (disabled) return [];

      const mapped = await isMappedCard(t);
      if (!mapped) return [];

      const [
        data,
        hideBadges,
        hideBars,
        hideTimer,
        rawHideEta,
        rawHideSubtask,
      ] = await Promise.all([
        getCardData(t),
        t.get("board", "shared", "hideBadges"),
        t.get("board", "shared", "hideProgressBars"),
        t.get("board", "shared", "hideTimerBadges"),
        t.get("board", "shared", "hideEta"),
        t.get("board", "shared", "hideSubtask"),
      ]);

      const hideEta = rawHideEta ?? true;
      const hideSubtask = rawHideSubtask ?? true;

      if (hideBadges || !data || data.disabledProgress) return [];

      const badges = [];

      /* Focus mode */
      if (data.focusMode) badges.push({ text: "🎯 Focus", color: "red" });

      /* ── Badge 1: Progress bar ── */
      const pct = computeProgress(data);
      badges.push({
        title: "Progress",
        text: hideBars ? `${pct}%` : `${makeBar(pct)}  ${pct}%`,
        color:
          pct >= 100
            ? "green"
            : pct >= 80
              ? "green"
              : pct >= 50
                ? "lime"
                : pct >= 25
                  ? "yellow"
                  : "red",
        dynamic: function (t) {
          return getCardData(t)
            .then(function (d) {
              if (!d) return { text: "▱▱▱▱▱▱▱▱  0%", color: "blue" };
              const p = computeProgress(d);
              return {
                text: hideBars ? `${p}%` : `${makeBar(p)}  ${p}%`,
                color:
                  p >= 100
                    ? "green"
                    : p >= 80
                      ? "green"
                      : p >= 50
                        ? "lime"
                        : p >= 25
                          ? "yellow"
                          : "red",
              };
            })
            .catch(() => ({ text: "0%", color: "blue" }));
        },
        refresh: 30,
      });

      /* ── Badge 2: Timer ── */
      if (!hideTimer) {
        const unit = data.trackingUnit || "hours";
        badges.push({
          title: "Time",
          text: `⏱ ${formatUnit(computeElapsed(data), unit)}`,
          color: "blue",
          dynamic: function (t) {
            return getCardData(t)
              .then(function (d) {
                if (!d) return { text: "⏱ 0:00", color: "blue" };
                return {
                  text: `⏱ ${formatUnit(computeElapsed(d), d.trackingUnit || "hours")}`,
                  color: "blue",
                };
              })
              .catch(() => ({ text: "⏱ 0:00", color: "blue" }));
          },
          refresh: 10,
        });
      }

      /* ── Badge 3: ETA ── */
      const etaStr = formatETA(data.etaDate, data.etaTime);
      if (!hideEta && etaStr) {
        badges.push({
          title: "ETA",
          text: `📅 ${etaStr}`,
          color: "yellow",
          dynamic: function (t) {
            return Promise.all([
              getCardData(t),
              t.get("board", "shared", "hideEta"),
            ])
              .then(function ([d, rawHideEtaFresh]) {
                if (!d) return { text: "" };
                const hideEtaFresh = rawHideEtaFresh ?? true;
                const s = formatETA(d.etaDate, d.etaTime);
                return !hideEtaFresh && s
                  ? { text: `📅 ${s}`, color: "yellow" }
                  : { text: "" };
              })
              .catch(() => ({ text: "" }));
          },
          refresh: 60,
        });
      }

      /* ── Badge 4: First incomplete subtask ── */
      const tasks = data.tasks || [];
      const firstPending = tasks.find((tk) => !tk.done);
      if (!hideSubtask && firstPending) {
        const taskText =
          firstPending.name.length > 24
            ? firstPending.name.slice(0, 24) + "…"
            : firstPending.name;
        badges.push({
          title: "Sub Task",
          text: `✦ ${taskText}`,
          color: "purple",
          dynamic: function (t) {
            return Promise.all([
              getCardData(t),
              t.get("board", "shared", "hideSubtask"),
            ])
              .then(function ([d, rawHideSubtaskFresh]) {
                if (!d) return { text: "" };
                const hideSubtaskFresh = rawHideSubtaskFresh ?? true;
                const pending = (d.tasks || []).find((tk) => !tk.done);
                if (!pending || hideSubtaskFresh) return { text: "" };
                const name =
                  pending.name.length > 24
                    ? pending.name.slice(0, 24) + "…"
                    : pending.name;
                return { text: `✦ ${name}`, color: "purple" };
              })
              .catch(() => ({ text: "" }));
          },
          refresh: 30,
        });
      }

      return badges;
    } catch (e) {
      return [];
    }
  },

  /* ── Card detail badges ── */
  "card-detail-badges": async function (t) {
    try {
      const disabled = await t.get("board", "shared", "disabled");
      if (disabled) return [];

      const mapped = await isMappedCard(t);
      if (!mapped) return [];

      const [
        data,
        hideDetail,
        hideBars,
        hideTimer,
        rawHideEta,
        rawHideSubtask,
      ] = await Promise.all([
        getCardData(t),
        t.get("board", "shared", "hideDetailBadges"),
        t.get("board", "shared", "hideProgressBars"),
        t.get("board", "shared", "hideTimerBadges"),
        t.get("board", "shared", "hideEta"),
        t.get("board", "shared", "hideSubtask"),
      ]);

      const hideEta = rawHideEta ?? true;
      const hideSubtask = rawHideSubtask ?? true;

      if (hideDetail || !data || data.disabledProgress) return [];

      const badges = [];

      if (data.focusMode)
        badges.push({ title: "Focus", text: "🎯 Focus ON", color: "red" });

      /* ── Progress ── */
      badges.push({
        title: "Progress",
        dynamic: function (t) {
          return getCardData(t)
            .then(function (d) {
              if (!d) return { text: "▱▱▱▱▱▱▱▱  0%", color: "blue" };
              const p = computeProgress(d);
              return {
                text: hideBars ? `${p}%` : `${makeBar(p)}  ${p}%`,
                color:
                  p >= 100
                    ? "green"
                    : p >= 80
                      ? "green"
                      : p >= 50
                        ? "lime"
                        : p >= 25
                          ? "yellow"
                          : "red",
              };
            })
            .catch(() => ({ text: "0%", color: "blue" }));
        },
        refresh: 30,
      });

      /* ── Timer ── */
      if (!hideTimer) {
        badges.push({
          title: "Time",
          dynamic: function (t) {
            return getCardData(t)
              .then(function (d) {
                if (!d) return { text: "⏱ 0:00", color: "blue" };
                return {
                  text: `⏱ ${formatUnit(computeElapsed(d), d.trackingUnit || "hours")}`,
                  color: "blue",
                };
              })
              .catch(() => ({ text: "⏱ 0:00", color: "blue" }));
          },
          refresh: 10,
        });
      }

      /* ── ETA ── */
      const etaStr = formatETA(data.etaDate, data.etaTime);
      if (!hideEta && etaStr) {
        badges.push({
          title: "ETA",
          dynamic: function (t) {
            return Promise.all([
              getCardData(t),
              t.get("board", "shared", "hideEta"),
            ])
              .then(function ([d, rawHideEtaFresh]) {
                if (!d) return { text: "" };
                const hideEtaFresh = rawHideEtaFresh ?? true;
                const s = formatETA(d.etaDate, d.etaTime);
                return !hideEtaFresh && s
                  ? { text: `📅 ${s}`, color: "yellow" }
                  : { text: "" };
              })
              .catch(() => ({ text: "" }));
          },
          refresh: 60,
        });
      }

      /* ── Sub Task ── */
      const tasks = data.tasks || [];
      const firstPending = tasks.find((tk) => !tk.done);
      if (!hideSubtask && firstPending) {
        badges.push({
          title: "Sub Task",
          dynamic: function (t) {
            return Promise.all([
              getCardData(t),
              t.get("board", "shared", "hideSubtask"),
            ])
              .then(function ([d, rawHideSubtaskFresh]) {
                if (!d) return { text: "" };
                const hideSubtaskFresh = rawHideSubtaskFresh ?? true;
                const pending = (d.tasks || []).find((tk) => !tk.done);
                if (!pending || hideSubtaskFresh) return { text: "" };
                const name =
                  pending.name.length > 24
                    ? pending.name.slice(0, 24) + "…"
                    : pending.name;
                return { text: `✦ ${name}`, color: "purple" };
              })
              .catch(() => ({ text: "" }));
          },
          refresh: 30,
        });
      }

      return badges;
    } catch (e) {
      return [];
    }
  },

  /* ── Card buttons ── */
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
              progressSource: "tasks",
              manualProgress: 0,
              tasks: [],
              etaDate: "",
              etaTime: "",
              data: {
                hours: { elapsed: 0, estimated: 8 * 3600 },
                days: { elapsed: 0, estimated: 86400 },
                weeks: { elapsed: 0, estimated: 604800 },
                months: { elapsed: 0, estimated: 2592000 },
              },
            });
          }
          return t.set("card", "shared", "disabledProgress", !isHidden);
        },
      },
    ];
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

  /* ── List actions ── */
  "list-actions": function (t, opts) {
  return [
    {
      text: "Progress",
      callback: function (t, opts) {
        return t.list("id", "name").then(function (list) {
          return t.popup({
            title: "Progress Cards",
            url: "./progress-cards.html",
            height: 560,
            mouseEvent: opts.mouseEvent,
            args: { listId: list.id, listName: list.name },
          });
        });
      },
    },
  ];
},
});
