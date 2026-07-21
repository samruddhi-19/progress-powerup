/* global TrelloPowerUp */

const t = TrelloPowerUp.iframe();

/* ── State ── */
let allCards = [];
let allLists = [];
let selectedIds = new Set();
let searchQuery = "";
let currentView = "lists";
let currentListId = null;
let currentListName = null;

/* ── Helpers ── */
function qs(id) {
  return document.getElementById(id);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function labelToTag(labels) {
  if (!labels || !labels.length) return null;
  const label = labels[0];
  const color = (label.color || "").toLowerCase();

  const colorClassMap = {
    green: "tag-green",
    lime: "tag-green",
    blue: "tag-blue",
    sky: "tag-blue",
    purple: "tag-purple",
    pink: "tag-pink",
    red: "tag-red",
    orange: "tag-orange",
    peach: "tag-orange",
    yellow: "tag-yellow",
    cream: "tag-yellow",
    black: "tag-black",
  };

  const cls = colorClassMap[color] || "tag-default";
  const text = label.name || label.color || "Label";
  return { text, cls };
}

/* ── Footer ── */
function updateFooter() {
  const count = selectedIds.size;
  const countEl = qs("selectedCount");
  const btn = qs("startMappingBtn");
  countEl.textContent =
    count === 0
      ? "0 cards selected"
      : `${count} card${count === 1 ? "" : "s"} selected`;
  countEl.classList.toggle("has-selection", count > 0);
  if (btn) btn.disabled = false;
}

/* ── Toggle selection ── */
function toggleCard(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  renderCurrentView();
  updateFooter();
}

/* ══════════════════════════════════════════
   LIST VIEW
══════════════════════════════════════════ */
function renderListView(slideBack = false) {
  currentView = "lists";
  const container = qs("viewContainer");
  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? allLists.filter((l) => l.name.toLowerCase().includes(q))
    : allLists;

  let html = `<div class="view${slideBack ? " slide-back" : ""}" id="listsView">`;
  html += `<div class="sub-label">Select a list to view its cards</div>`;
  html += `
    <div class="search-wrap">
      <span class="search-icon">
        <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
      </span>
      <input type="text" id="searchInput" placeholder="Search lists…" autocomplete="off" value="${escapeHtml(searchQuery)}" />
    </div>`;

  html += `<div class="scroll-area">`;
  if (filtered.length === 0) {
    html += `<div class="empty-state">${q ? "No lists match your search." : "No lists found on this board."}</div>`;
  } else {
    filtered.forEach((list) => {
      const selectedInList = allCards.filter(
        (c) => c.listId === list.id && selectedIds.has(c.id),
      ).length;
      const countText =
        list.cardCount === 0
          ? "No cards"
          : list.cardCount === 1
            ? "1 card"
            : `${list.cardCount} cards`;
      const selectedBadge =
        selectedInList > 0
          ? ` · <span class="selected-in-list">${selectedInList} selected</span>`
          : "";

      const hasSelection = selectedInList > 0;
      const isEmpty = list.cardCount === 0;
      html += `
        <div class="list-item${hasSelection ? " has-selection" : ""}${isEmpty ? " no-cards" : ""}" data-listid="${list.id}" data-listname="${escapeHtml(list.name)}">
          <div class="list-item-left">
            <span class="list-item-name">${escapeHtml(list.name)}</span>
            <span class="list-item-count">${countText}${selectedBadge}</span>
          </div>
          <span class="list-item-arrow">
            <svg viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
          </span>
        </div>`;
    });
  }
  html += `</div></div>`;
  container.innerHTML = html;

  const input = qs("searchInput");
  if (input) {
    input.addEventListener("input", (e) => {
      searchQuery = e.target.value;
      renderListView();
    });
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  container.querySelectorAll(".list-item").forEach((el) => {
    el.addEventListener("click", () => {
      searchQuery = "";
      navigateToCards(el.dataset.listid, el.dataset.listname);
    });
  });

  setTimeout(() => t.sizeTo(document.body), 40);
}

/* ══════════════════════════════════════════
   CARDS VIEW
══════════════════════════════════════════ */
function renderCardsView() {
  currentView = "cards";
  const container = qs("viewContainer");
  const q = searchQuery.trim().toLowerCase();
  const listCards = allCards.filter((c) => c.listId === currentListId);
  const filtered = q
    ? listCards.filter((c) => c.name.toLowerCase().includes(q))
    : listCards;

  let html = `<div class="view" id="cardsView">`;
  html += `
    <div style="display:flex;align-items:center;gap:6px;padding:0 12px 4px 12px;flex-shrink:0;">
      <button class="back-btn" id="backBtn">
        <svg viewBox="0 0 24 24"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z"/></svg>
        Back
      </button>
      <span style="font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(currentListName)}</span>
    </div>`;

  html += `
    <div class="search-wrap">
      <span class="search-icon">
        <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
      </span>
      <input type="text" id="searchInput" placeholder="Search cards…" autocomplete="off" value="${escapeHtml(searchQuery)}" />
    </div>`;

  html += `<div class="scroll-area">`;
  if (filtered.length === 0) {
    html += `<div class="empty-state">${listCards.length === 0 ? "No cards in this list." : "No cards match your search."}</div>`;
  } else {
    filtered.forEach((card) => {
      const isSelected = selectedIds.has(card.id);
      const tag = labelToTag(card.labels);
      html += `
        <div class="card-item${isSelected ? " selected" : ""}" data-id="${card.id}">
          <div class="cb-wrap"><span class="cb-check">✓</span></div>
          <span class="card-name">${escapeHtml(card.name)}</span>
          ${tag ? `<span class="card-tag ${tag.cls}">${escapeHtml(tag.text)}</span>` : ""}
        </div>`;
    });
  }
  html += `</div></div>`;
  container.innerHTML = html;

  qs("backBtn")?.addEventListener("click", () => {
    searchQuery = "";
    renderListView(true);
  });

  const input = qs("searchInput");
  if (input) {
    input.addEventListener("input", (e) => {
      searchQuery = e.target.value;
      renderCardsView();
    });
  }

  container.querySelectorAll(".card-item").forEach((el) => {
    el.addEventListener("click", () => toggleCard(el.dataset.id));
  });

  setTimeout(() => t.sizeTo(document.body), 40);
}

function navigateToCards(listId, listName) {
  currentListId = listId;
  currentListName = listName;
  renderCardsView();
}

function renderCurrentView() {
  currentView === "lists" ? renderListView() : renderCardsView();
}

/* ── Load ── */
async function loadCards() {
  try {
    const [boardCards, lists] = await Promise.all([
      t.cards("all"),
      t.lists("all"),
    ]);
    const listMap = {};
    lists.forEach((l) => {
      listMap[l.id] = l.name;
    });

    allCards = boardCards.map((card) => ({
      id: card.id,
      name: card.name,
      listId: card.idList,
      listName: listMap[card.idList] || "Unknown List",
      labels: card.labels || [],
    }));

    allLists = lists.map((l) => ({
      id: l.id,
      name: l.name,
      cardCount: allCards.filter((c) => c.listId === l.id).length,
    }));

    // Pre-check already-mapped cards so they show as selected on open
    // Pre-check already-mapped cards so they show as selected on open
    const alreadyMapped = (await t.get("board", "shared", "mappedCards")) || [];
    alreadyMapped.forEach((id) => selectedIds.add(id));

    // If opened from a list context menu, skip straight to that list's cards
    const args = t.arg("listId") ? { listId: t.arg("listId"), listName: t.arg("listName") } : null;
    if (args && args.listId) {
      navigateToCards(args.listId, args.listName);
    } else {
      renderListView();
    }
    updateFooter();
  } catch (err) {
    qs("viewContainer").innerHTML =
      `<div class="empty-state">Failed to load. Please try again.</div>`;
    console.error("[ProgressCards] loadCards error:", err);
  }
}

/* ══════════════════════════════════════════
   SAVE MAPPING
   selectedIds is the single source of truth.
   Checked   → mapped   (cover + badges appear)
   Unchecked → removed  (cover + badges gone;
               progress data kept in cardDefaults)
══════════════════════════════════════════ */
async function startMapping() {
  const btn = qs("startMappingBtn");
  btn.disabled = true;
  btn.textContent = "Saving…";

  try {
    const newMappedIds = Array.from(selectedIds);

    const existingDefaults =
      (await t.get("board", "shared", "cardDefaults")) || {};
    const defaultCardData = {
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
      data: {
        hours: { elapsed: 0, estimated: 8 * 3600 },
        days: { elapsed: 0, estimated: 86400 },
        weeks: { elapsed: 0, estimated: 604800 },
        months: { elapsed: 0, estimated: 2592000 },
      },
    };

    const cardDefaults = { ...existingDefaults };
    selectedIds.forEach((id) => {
      if (!cardDefaults[id]) cardDefaults[id] = defaultCardData;
    });

    /* Write exact selection — unchecked cards are no longer in mappedCards */
    await t.set("board", "shared", "mappedCards", newMappedIds);
    await t.set("board", "shared", "cardDefaults", cardDefaults);

    await t.closePopup();
  } catch (err) {
    console.error("[ProgressCards] startMapping error:", err);
    btn.disabled = false;
    btn.textContent = "Save Mapping";
  }
}

function showAuthView() {
  const container = qs("viewContainer");
  container.innerHTML = `
    <div style="padding: 24px 16px; display:flex; flex-direction:column; gap:16px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:28px;">🔒</span>
        <div>
          <div style="font-size:15px;font-weight:800;color:var(--text);">Authorization Required</div>
          <div style="font-size:12px;color:var(--muted);margin-top:3px;">Enable Progress features on this board</div>
        </div>
      </div>
      <p style="font-size:13px;color:var(--muted);line-height:1.5;">
        Click Authorize below to start tracking progress on your cards.
      </p>
      <button id="inlineAuthBtn" style="
        padding: 12px;
        background: var(--accent);
        color: #000;
        border: none;
        border-radius: 999px;
        font-size: 14px;
        font-weight: 800;
        cursor: pointer;
        width: 100%;
        transition: opacity 0.15s;
      ">⚡ Authorize Progress</button>
      <div id="inlineAuthMsg" style="font-size:12px;color:var(--muted);text-align:center;"></div>
    </div>
  `;

  // Hide footer start mapping button — not needed on auth screen
  qs("startMappingBtn").style.display = "none";
  qs("selectedCount").style.display = "none";

  // Bind auth button — NO inline handlers, CSP safe
  document
    .getElementById("inlineAuthBtn")
    .addEventListener("click", async function () {
      const btn = document.getElementById("inlineAuthBtn");
      const msg = document.getElementById("inlineAuthMsg");
      btn.disabled = true;
      btn.textContent = "Authorizing…";
      msg.textContent = "";

      try {
        await t.set("member", "private", "authorized", true);
        await t.set("board", "shared", "disabled", false);
        msg.textContent = "✅ Authorized! Loading…";
        // Re-init after auth
        setTimeout(async () => {
          qs("startMappingBtn").style.display = "";
          qs("selectedCount").style.display = "";
          await loadCards();
          updateFooter();
        }, 600);
      } catch (e) {
        btn.disabled = false;
        btn.textContent = "⚡ Authorize Progress";
        msg.textContent = "❌ Failed. Please try again.";
      }
    });

  setTimeout(() => {
    try {
      t.sizeTo(document.body);
    } catch (e) {}
  }, 40);
}

/* Height for our full-screen-ish windows (Reports / Billing).
   Capped so the window always fits on screen — anything taller makes the
   browser scroll the whole Trello page instead of scrolling inside the window. */
function modalHeight() {
  const screenH = (window.screen && window.screen.availHeight) || 900;
  return Math.max(460, Math.min(900, screenH - 250));
}

/* ── Tabs: Mapping | Reports | Billing ── */
let activeTab = "mapping";

function showMappingTab() {
  qs("popupFooter").style.display = "";
  renderCurrentView();
}

function setActiveTab(tab) {
  if (tab === "billing") {
    // Billing is a launcher (wide modal), not an in-place tab —
    // same pattern as Reports. Whichever tab was active stays selected.
    t.modal({
      title: "Workspace & Billing",
      url: "./billing.html",
      fullscreen: false,
      height: modalHeight(),
    });
    return;
  }
  activeTab = tab;
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  if (tab === "mapping") showMappingTab();
}

function bindTabs() {
  qs("tabMapping").addEventListener("click", () => setActiveTab("mapping"));
  qs("tabBilling").addEventListener("click", () => setActiveTab("billing"));
  // Reports is also a launcher — opens the full dashboard modal.
  qs("tabReports").addEventListener("click", () => {
    t.modal({
      title: "Reports & Analytics",
      url: "./reports.html",
      fullscreen: true,
      // height: modalHeight(),
    });
  });
}

/* ── Init ── */
function bindGear() {
  const gearBtn = qs("gearBtn");
  if (!gearBtn) return;
  gearBtn.addEventListener("click", () => {
    t.popup({
      title: "Progress Settings",
      url: "./settings.html",
      height: 620,
    });
  });
}

/* ── Init ── */
(async function init() {
  bindGear();
  bindTabs();
  qs("startMappingBtn").addEventListener("click", startMapping);

  // Check auth first — show inline auth if not authorized
  const all = await t.getAll();
  const authorized = all?.member?.private?.authorized === true;
  const disabled = all?.board?.shared?.disabled === true;

  if (!authorized || disabled) {
    showAuthView();
    return;
  }

  await loadCards();
})();