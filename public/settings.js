/* global TrelloPowerUp */
const t = TrelloPowerUp.iframe();

const DEFAULTS = {
  hideBadges: false,
  hideTimerBadges: false,
  hideDetailBadges: false,
  hideProgressBars: false,
  autoFocus: false,
  autoTrackMode: "off",
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

  setTimeout(() => t.sizeTo(document.body).done(), 40);
}

// ⬇️ NEW: Function to render the Authorize UI (styled)
function renderAuthorize() {
  document.body.innerHTML = `
    <div class="settings-header">
      <div class="icon">⚙️</div>
      <h1>Authorize Progress Power-Up</h1>
    </div>
    <div style="padding: 20px 0; text-align: center;">
      <p style="margin-bottom: 20px; opacity: 0.75; font-size: 14px;">
        Click below to enable Progress features on this board.
      </p>
      <button id="authBtn" class="remove-btn" style="
        border: none;
        background: #0079bf;
        color: white;
        margin-top: 0;
      ">Authorize</button>
      <div id="authMsg" style="margin-top: 12px; font-size: 12px; opacity: .75;"></div>
    </div>
  `;

  setTimeout(() => t.sizeTo(document.body).done(), 40);

  document.getElementById("authBtn").addEventListener("click", async () => {
    const msg = document.getElementById("authMsg");
    msg.textContent = "Enabling…";

    try {
      await t.set("board", "shared", "disabled", false);
      msg.textContent = "Enabled. Closing…";
      t.closePopup();
    } catch (e) {
      msg.textContent = "Failed to enable. Please try again.";
    }
  });
}

async function setBoard(key, value) {
  await t.set("board", "shared", key, value);
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

  qs("unauthBtn").addEventListener("click", async () => {
    const ok = confirm("Remove and clear all saved data?");
    if (!ok) return;

    const all = await t.getAll(); // [web:45]

    const boardShared = all?.board?.shared || {};
    for (const key of Object.keys(boardShared))
      await t.remove("board", "shared", key);

    const cardShared = all?.card?.shared || {};
    for (const key of Object.keys(cardShared))
      await t.remove("card", "shared", key);

    const memPrivate = all?.member?.private || {};
    for (const key of Object.keys(memPrivate))
      await t.remove("member", "private", key);

    await t.set("board", "shared", "disabled", true);
    alert("Power-Up data cleared.");
    t.closePopup();
  });
}

(async function init() {
  // ⬇️ NEW: Check if disabled before binding
  const board = await getBoardShared();
  if (board.disabled === true) {
    renderAuthorize();
    return;
  }

  bind();
  await loadUI();
})();
