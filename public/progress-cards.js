/* global TrelloPowerUp */

const t = TrelloPowerUp.iframe();

/* ── State ── */
let allCards        = [];
let allLists        = [];
let selectedIds     = new Set();
let searchQuery     = "";
let currentView     = "lists";
let currentListId   = null;
let currentListName = null;

/* ── Helpers ── */
function qs(id) { return document.getElementById(id); }

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function labelToTag(labels) {
  if (!labels || !labels.length) return null;
  const label = labels[0];
  const name  = (label.name  || "").toLowerCase();
  const color = (label.color || "").toLowerCase();

  if (name.includes("design"))                            return { text: label.name || "Design", cls: "tag-design" };
  if (name.includes("story"))                             return { text: label.name || "Story",  cls: "tag-story"  };
  if (name.includes("dev") || name.includes("engineer")) return { text: label.name || "Dev",    cls: "tag-dev"    };
  if (name.includes("bug") || name.includes("fix"))      return { text: label.name || "Bug",    cls: "tag-red"    };
  if (name.includes("review"))                           return { text: label.name || "Review", cls: "tag-orange" };

  switch (color) {
    case "blue":   case "sky":   return { text: label.name || "Design", cls: "tag-design" };
    case "purple": case "pink":  return { text: label.name || "Story",  cls: "tag-story"  };
    case "green":  case "lime":  return { text: label.name || "Dev",    cls: "tag-dev"    };
    case "orange": case "peach": return { text: label.name || "Review", cls: "tag-orange" };
    case "red":                  return { text: label.name || "Bug",    cls: "tag-red"    };
    case "yellow": case "cream": return { text: label.name || "Task",   cls: "tag-yellow" };
  }

  const word = (label.name || label.color || "").split(" ")[0];
  return word ? { text: word, cls: "tag-design" } : null;
}

/* ── Footer ── */
function updateFooter() {
  const count   = selectedIds.size;
  const countEl = qs("selectedCount");
  const btn     = qs("startMappingBtn");
  countEl.textContent = count === 0 ? "0 cards selected" : `${count} card${count === 1 ? "" : "s"} selected`;
  countEl.classList.toggle("has-selection", count > 0);
  btn.disabled = count === 0;
}

/* ── Toggle selection ── */
function toggleCard(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else                      selectedIds.add(id);
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
  const filtered = q ? allLists.filter(l => l.name.toLowerCase().includes(q)) : allLists;

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
    filtered.forEach(list => {
      const selectedInList = allCards.filter(c => c.listId === list.id && selectedIds.has(c.id)).length;
      const countText = list.cardCount === 0 ? "No cards" : list.cardCount === 1 ? "1 card" : `${list.cardCount} cards`;
      const selectedBadge = selectedInList > 0
        ? ` · <span class="selected-in-list">${selectedInList} selected</span>` : "";

      html += `
        <div class="list-item" data-listid="${list.id}" data-listname="${escapeHtml(list.name)}">
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
    input.addEventListener("input", (e) => { searchQuery = e.target.value; renderListView(); });
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  container.querySelectorAll(".list-item").forEach(el => {
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
  const listCards = allCards.filter(c => c.listId === currentListId);
  const filtered  = q ? listCards.filter(c => c.name.toLowerCase().includes(q)) : listCards;

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
    filtered.forEach(card => {
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

  qs("backBtn")?.addEventListener("click", () => { searchQuery = ""; renderListView(true); });

  const input = qs("searchInput");
  if (input) {
    input.addEventListener("input", (e) => { searchQuery = e.target.value; renderCardsView(); });
  }

  container.querySelectorAll(".card-item").forEach(el => {
    el.addEventListener("click", () => toggleCard(el.dataset.id));
  });

  setTimeout(() => t.sizeTo(document.body), 40);
}

function navigateToCards(listId, listName) {
  currentListId   = listId;
  currentListName = listName;
  renderCardsView();
}

function renderCurrentView() {
  currentView === "lists" ? renderListView() : renderCardsView();
}

/* ── Load ── */
async function loadCards() {
  try {
    const [boardCards, lists] = await Promise.all([t.cards("all"), t.lists("all")]);
    const listMap = {};
    lists.forEach(l => { listMap[l.id] = l.name; });

    allCards = boardCards.map(card => ({
      id:       card.id,
      name:     card.name,
      listId:   card.idList,
      listName: listMap[card.idList] || "Unknown List",
      labels:   card.labels || [],
    }));

    allLists = lists.map(l => ({
      id:        l.id,
      name:      l.name,
      cardCount: allCards.filter(c => c.listId === l.id).length,
    }));

    // Pre-check already-mapped cards so they show as selected on open
    const alreadyMapped = (await t.get("board", "shared", "mappedCards")) || [];
    alreadyMapped.forEach(id => selectedIds.add(id));

    renderListView();
    updateFooter();
  } catch (err) {
    qs("viewContainer").innerHTML = `<div class="empty-state">Failed to load. Please try again.</div>`;
    console.error("[ProgressCards] loadCards error:", err);
  }
}

/* ══════════════════════════════════════════
   START MAPPING  — MERGES, never overwrites
   ══════════════════════════════════════════
   - Reads existing mappedCards from board
   - Merges with current selection (union)
   - Writes default card data only for NEW cards
     (existing cards keep their progress/timer)
══════════════════════════════════════════ */
async function startMapping() {
  if (selectedIds.size === 0) return;
  const btn = qs("startMappingBtn");
  btn.disabled    = true;
  btn.textContent = "Mapping…";

  try {
    /* 1. Read what was already mapped */
    const existingMapped   = (await t.get("board", "shared", "mappedCards"))   || [];
    const existingDefaults = (await t.get("board", "shared", "cardDefaults"))  || {};

    /* 2. Merge: union of old + new */
    const mergedSet = new Set([...existingMapped, ...selectedIds]);
    const mergedIds = Array.from(mergedSet);

    /* 3. Default data template for brand-new cards */
    const defaultCardData = {
      progress: 0, elapsed: 0, estimated: 8 * 3600,
      running: false, startTime: null, focusMode: false,
      disabledProgress: false, trackingUnit: "hours",
      progressSource: "tasks", manualProgress: 0, tasks: [],
      data: {
        hours:  { elapsed: 0, estimated: 8 * 3600  },
        days:   { elapsed: 0, estimated: 86400      },
        weeks:  { elapsed: 0, estimated: 604800     },
        months: { elapsed: 0, estimated: 2592000    },
      },
    };

    /* 4. Write defaults only for cards that don't already have one */
    const cardDefaults = { ...existingDefaults };
    selectedIds.forEach(id => {
      if (!cardDefaults[id]) {
        cardDefaults[id] = defaultCardData;
      }
    });

    /* 5. Persist both */
    await t.set("board", "shared", "mappedCards",  mergedIds);
    await t.set("board", "shared", "cardDefaults", cardDefaults);

    await t.closePopup();
  } catch (err) {
    console.error("[ProgressCards] startMapping error:", err);
    btn.disabled    = false;
    btn.textContent = "Start Mapping";
  }
}

/* ── Init ── */
(async function init() {
  qs("gearBtn")?.addEventListener("click", () => {
    t.popup({ title: "Progress Settings", url: "./settings.html", height: 620 });
  });
  qs("startMappingBtn").addEventListener("click", startMapping);
  await loadCards();
})();