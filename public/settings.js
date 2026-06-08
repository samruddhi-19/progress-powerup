/* global TrelloPowerUp */
const t = TrelloPowerUp.iframe();

const DEFAULTS = {
  hideBadges: false,
  hideTimerBadges: false,
  hideDetailBadges: false,
  hideProgressBars: false,
  autoFocus: false,
  autoTrackMode: "off",
  hideEta: true,
  hideSubtask: true,
};

function qs(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

async function getBoardShared() {
  const all = await t.getAll(); // recommended bulk read [web:45]
  return all?.board?.shared || {};
}

async function loadUI() {
  const board = await getBoardShared();

  qs("hideBadges").checked = board.hideBadges ?? DEFAULTS.hideBadges;
  qs("hideTimer").checked = board.hideTimerBadges ?? DEFAULTS.hideTimerBadges;
  qs("hideDetail").checked =
    board.hideDetailBadges ?? DEFAULTS.hideDetailBadges;
  qs("hideBars").checked = board.hideProgressBars ?? DEFAULTS.hideProgressBars;
  qs("focusMode").checked = board.autoFocus ?? DEFAULTS.autoFocus;
  qs("autoTrackMode").value = board.autoTrackMode ?? DEFAULTS.autoTrackMode;

  qs("hideEta").checked = board.hideEta ?? DEFAULTS.hideEta;
  qs("hideSubtask").checked = board.hideSubtask ?? DEFAULTS.hideSubtask;

  // REPLACE BOTH WITH
  setTimeout(() => {
    try {
      t.sizeTo(document.body);
    } catch (e) {}
  }, 40);
}

async function setBoard(key, value) {
  await t.set("board", "shared", key, value);

  // 🔥 Force UI awareness (temporary fix)
  t.alert({ message: "Setting updated" });
}

function bind() {
  qs("hideBadges").addEventListener("change", (e) =>
    setBoard("hideBadges", e.target.checked),
  );

  qs("hideTimer").addEventListener("change", (e) =>
    setBoard("hideTimerBadges", e.target.checked),
  );

  qs("hideDetail").addEventListener("change", (e) =>
    setBoard("hideDetailBadges", e.target.checked),
  );

  qs("hideBars").addEventListener("change", (e) =>
    setBoard("hideProgressBars", e.target.checked),
  );

  qs("focusMode").addEventListener("change", (e) =>
    setBoard("autoFocus", e.target.checked),
  );

  qs("autoTrackMode").addEventListener("change", (e) =>
    setBoard("autoTrackMode", e.target.value),
  );

  qs("hideEta").addEventListener("change", (e) =>
    setBoard("hideEta", e.target.checked),
  );

  qs("hideSubtask").addEventListener("change", (e) =>
    setBoard("hideSubtask", e.target.checked),
  );
}

function showPanel(which) {
  const settingsPanel = document.getElementById("settingsPanel");
  const authPanel = document.getElementById("authPanel");

  if (which === "auth") {
    if (settingsPanel) settingsPanel.style.display = "none";
    if (authPanel) authPanel.style.display = "block";
  } else {
    if (authPanel) authPanel.style.display = "none";
    if (settingsPanel) settingsPanel.style.display = "block";
  }

  // REPLACE BOTH WITH
  setTimeout(() => {
    try {
      t.sizeTo(document.body);
    } catch (e) {}
  }, 40);
}

async function bindAuthButton() {
  const btn = document.getElementById("authBtn");
  const msg = document.getElementById("authMsg");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    if (msg) msg.textContent = "Authorizing…";

    try {
      await t.set("member", "private", "authorized", true);
      await t.set("board", "shared", "disabled", false);

      if (msg) msg.textContent = "Authorized. Reloading…";
      window.location.reload();
    } catch (e) {
      btn.disabled = false;
      if (msg) msg.textContent = "Failed. Please try again.";
    }
  });
}

async function bindDisableButton() {
  qs("unauthBtn").addEventListener("click", async () => {
    const ok = confirm(
      "Disable Progress on this board and clear board settings?",
    );
    if (!ok) return;

    // Only clear board-scoped settings (don’t touch member/private here)
    const keys = [
      "hideBadges",
      "hideTimerBadges",
      "hideDetailBadges",
      "hideProgressBars",
      "autoFocus",
      "autoTrackMode",
      "autoTrackLists",
      "hideEta",
      "hideSubtask",
    ];

    for (const k of keys) {
      await t.remove("board", "shared", k);
    }

    await t.set("board", "shared", "disabled", true);

    // Do NOT call t.closePopup() here (avoids “No popover in context”)
    window.location.reload();
  });
}

(async function init() {
  const all = await t.getAll();
  const board = all?.board?.shared || {};
  const authorized = all?.member?.private?.authorized === true;
  const disabled = board.disabled === true;

  // If not authorized OR disabled => show auth panel
  if (!authorized || disabled) {
    showPanel("auth");
    await bindAuthButton();
    return;
  }

  // Normal settings
  showPanel("settings");
  bind();
  await loadUI();
  await bindDisableButton();
})();
