/* global TrelloPowerUp */

const t = TrelloPowerUp.iframe();

/* ── State ── */
let allCards = [];       // { id, name, listName, listId, labels, hasProgress }
let selectedIds = new Set();
let searchQuery = "";

/* ── Helpers ── */
function qs(id) { return document.getElementById(id); }

/** Map a label color/name to a display tag */
function labelToTag(labels) {
  if (!labels || labels.length === 0) return null;
  const label = labels[0];
  const name = (label.name || label.color || "").toLowerCase();
  if (name.includes("design") || name.includes("blue"))  return { text: "Design", cls: "tag-design" };
  if (name.includes("story") || name.includes("purple")) return { text: "Story",  cls: "tag-story"  };
  if (name.includes("dev")   || name.includes("green"))  return { text: "Dev",    cls: "tag-dev"    };
  // Fallback: first word of label name
  const word = (label.name || label.color || "").split(" ")[0];
  return word ? { text: word, cls: "tag-design" } : null;
}

/* ── Render ── */
function renderCards() {
  const list = qs("cardList");
  const q = searchQuery.trim().toLowerCase();

  const filtered = q
    ? allCards.filter(c => c.name.toLowerCase().includes(q) || c.listName.toLowerCase().includes(q))
    : allCards;

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state">${q ? "No cards match your search." : "No cards found on this board."}</div>`;
    return;
  }

  // Group by list
  const grouped = {};
  filtered.forEach(c => {
    if (!grouped[c.listName]) grouped[c.listName] = [];
    grouped[c.listName].push(c);
  });

  // Separate lists into two buckets: TO DO / in-progress vs Done
  const doneKeywords = ["done", "complete", "finished", "closed", "shipped"];
  const inProgressKeys = Object.keys(grouped).filter(k => !doneKeywords.some(d => k.toLowerCase().includes(d)));
  const doneKeys       = Object.keys(grouped).filter(k =>  doneKeywords.some(d => k.toLowerCase().includes(d)));

  let html = "";

  const renderGroup = (listName, cards) => {
    html += `<div class="section-group">`;
    html += `<div class="section-label">${escapeHtml(listName)}</div>`;
    cards.forEach(card => {
      const isSelected = selectedIds.has(card.id);
      const tag = labelToTag(card.labels);
      html += `
        <div class="card-item${isSelected ? " selected" : ""}" data-id="${card.id}">
          <div class="cb-wrap"><span class="cb-check">✓</span></div>
          <span class="card-name">${escapeHtml(card.name)}</span>
          ${tag ? `<span class="card-tag ${tag.cls}">${escapeHtml(tag.text)}</span>` : ""}
        </div>`;
    });
    html += `</div>`;
  };

  inProgressKeys.forEach(k => renderGroup(k, grouped[k]));
  doneKeys.forEach(k => renderGroup(k, grouped[k]));

  list.innerHTML = html;

  // Bind click events
  list.querySelectorAll(".card-item").forEach(el => {
    el.addEventListener("click", () => toggleCard(el.dataset.id));
  });
}

function updateFooter() {
  const count = selectedIds.size;
  const countEl = qs("selectedCount");
  const btn = qs("startMappingBtn");

  countEl.textContent = count === 0
    ? "0 cards selected"
    : `${count} card${count === 1 ? "" : "s"} selected`;

  countEl.classList.toggle("has-selection", count > 0);
  btn.disabled = count === 0;
}

function toggleCard(id) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
  } else {
    selectedIds.add(id);
  }
  renderCards();
  updateFooter();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ── Load cards from Trello ── */
async function loadCards() {
  try {
    // Get all cards on the board with their list info and existing data
    const [boardCards, lists] = await Promise.all([
      t.cards("all"),
      t.lists("all"),
    ]);

    const listMap = {};
    lists.forEach(l => { listMap[l.id] = l.name; });

    allCards = boardCards.map(card => ({
      id: card.id,
      name: card.name,
      listId: card.idList,
      listName: listMap[card.idList] || "Unknown List",
      labels: card.labels || [],
    }));

    renderCards();
    setTimeout(() => t.sizeTo(document.body), 40);
  } catch (err) {
    qs("cardList").innerHTML = `<div class="empty-state">Failed to load cards. Please try again.</div>`;
    console.error("[ProgressCards] loadCards error:", err);
  }
}

/* ── Start Mapping ── */
async function startMapping() {
  if (selectedIds.size === 0) return;

  const btn = qs("startMappingBtn");
  btn.disabled = true;
  btn.textContent = "Mapping…";

  try {
    // For each selected card, ensure it has progress data initialized
    const promises = Array.from(selectedIds).map(async (cardId) => {
      const existing = await t.get("card", "shared", undefined, { card: cardId }).catch(() => null);

      // Only initialize if no progress data yet
      if (!existing || existing.disabledProgress === true) {
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
            days:   { elapsed: 0, estimated: 8 * 3600 },
            weeks:  { elapsed: 0, estimated: 8 * 3600 },
            months: { elapsed: 0, estimated: 8 * 3600 },
          },
        }, { card: cardId });
      }
    });

    await Promise.allSettled(promises);
    t.closePopup();
  } catch (err) {
    console.error("[ProgressCards] startMapping error:", err);
    btn.disabled = false;
    btn.textContent = "Start Mapping";
  }
}

/* ── Search ── */
function bindSearch() {
  qs("searchInput").addEventListener("input", (e) => {
    searchQuery = e.target.value;
    renderCards();
  });
}

/* ── Gear / Settings button ── */
function bindGear() {
  qs("gearBtn").addEventListener("click", () => {
    t.popup({
      title: "Progress Settings",
      url: "./settings.html",
      height: 620,
    });
  });
}

/* ── Init ── */
(async function init() {
  bindSearch();
  bindGear();
  qs("startMappingBtn").addEventListener("click", startMapping);
  await loadCards();
  updateFooter();
})();
