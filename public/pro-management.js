(function () {
  "use strict";

  const app = document.getElementById("app");

  const STYLES = `
    .pm { width: 100%; }
    .pm-row { display: flex; align-items: center; gap: 12px; padding: 16px 20px; }
    .pm-icon { flex: 0 0 auto; width: 32px; height: 32px; border-radius: 7px;
      background: rgba(87, 157, 255, 0.14); color: #7ab2ff;
      display: flex; align-items: center; justify-content: center; }
    .pm-title { margin: 0; font-size: 14px; font-weight: 600; color: #ffffff; }
    .pm-badge { margin-left: auto; flex: 0 0 auto; padding: 3px 9px; border-radius: 999px;
      background: rgba(87, 199, 133, 0.14); color: #6fd99a;
      font-size: 10.5px; font-weight: 600; letter-spacing: 0.02em; }
    .pm-price { margin: 2px 0 0; font-size: 12px; color: #9aa4b2; }
    .pm-divider { height: 1px; background: rgba(255, 255, 255, 0.08); margin: 0 20px; }
    .pm-list { padding: 6px 8px; }
    .pm-item { width: 100%; display: flex; align-items: center; gap: 12px; text-align: left;
      padding: 10px 12px; border: 0; border-radius: 7px; background: transparent;
      color: #ffffff; cursor: pointer; font-family: inherit; }
    .pm-item:hover { background: rgba(255, 255, 255, 0.05); }
    .pm-item:disabled { opacity: 0.55; cursor: wait; }
    .pm-item-icon { flex: 0 0 auto; color: #9aa4b2; display: flex; }
    .pm-item-text { flex: 1; min-width: 0; }
    .pm-item-label { display: block; font-size: 13px; font-weight: 500; color: #ffffff; }
    .pm-item-desc { display: block; margin-top: 1px; font-size: 11.5px; color: #838d9a;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pm-chevron { flex: 0 0 auto; color: #565f6c; display: flex; }
    .pm-item.danger .pm-item-icon { color: #f47b7b; }
    .pm-item.danger .pm-item-label { color: #f47b7b; }
  `;

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function fmtDate(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  const icon = (paths, size) =>
    `<svg width="${size || 18}" height="${size || 18}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

  const ICONS = {
    chart: '<path d="M4 20V10M12 20V4M20 20v-7"/>',
    receipt:
      '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
  };

  function render(status) {
    const renewsAt =
      (status &&
        (status.currentPeriodEnd ||
          status.renewsAt ||
          status.nextBillingDate)) ||
      null;

    const priceLine = renewsAt
      ? `$4 per month &middot; renews ${esc(fmtDate(renewsAt))}`
      : "$4 per month";

    app.innerHTML = `
      <style>${STYLES}</style>

      <div class="pm">
        <div class="pm-row">
          <div class="pm-icon">${icon(ICONS.chart, 16)}</div>
          <div>
            <p class="pm-title">Progress Pro</p>
            <p class="pm-price">${priceLine}</p>
          </div>
          <span class="pm-badge">Active</span>
        </div>

        <div class="pm-divider"></div>

        <div class="pm-list">
          <button type="button" class="pm-item" id="billingOverview">
            <span class="pm-item-icon">${icon(ICONS.receipt)}</span>
            <span class="pm-item-text">
              <span class="pm-item-label">Billing overview</span>
              <span class="pm-item-desc">Invoices and payment history</span>
            </span>
            <span class="pm-chevron">${icon(ICONS.chevron, 15)}</span>
          </button>

          <button type="button" class="pm-item" id="updatePayment">
            <span class="pm-item-icon">${icon(ICONS.card)}</span>
            <span class="pm-item-text">
              <span class="pm-item-label">Update payment method</span>
              <span class="pm-item-desc">Manage your card on file</span>
            </span>
            <span class="pm-chevron">${icon(ICONS.chevron, 15)}</span>
          </button>
        </div>

        <div class="pm-divider"></div>

        <div class="pm-list">
          <button type="button" class="pm-item danger" id="cancelSubscription">
            <span class="pm-item-icon">${icon(ICONS.x)}</span>
            <span class="pm-item-text">
              <span class="pm-item-label">Cancel subscription</span>
            </span>
          </button>
        </div>
      </div>
    `;

    document
      .getElementById("billingOverview")
      .addEventListener("click", (e) => onAction(e.currentTarget, "overview"));

    document
      .getElementById("updatePayment")
      .addEventListener("click", (e) =>
        onAction(e.currentTarget, "updatePaymentMethod")
      );

    document
      .getElementById("cancelSubscription")
      .addEventListener("click", (e) =>
        onAction(e.currentTarget, "cancelSubscription")
      );

    resizeToContent();
  }

  render(null);

  function resizeToContent() {
    if (trelloIframe && typeof trelloIframe.sizeTo === "function") {
      trelloIframe.sizeTo("#app").catch(function () {});
    }
  }

  let trelloIframe = null;

  async function getTrelloIframe() {
    if (trelloIframe) return trelloIframe;

    if (
      !window.TrelloPowerUp ||
      typeof window.TrelloPowerUp.iframe !== "function"
    ) {
      throw new Error("Trello Power-Up API is not available.");
    }

    trelloIframe = window.TrelloPowerUp.iframe({
      appKey: window.ProgressConfig.API_KEY,
      appName: window.ProgressConfig.APP_NAME,
    });

    return trelloIframe;
  }

  async function getBillingPortal() {
    try {
      const t = await getTrelloIframe();
      const token = await t.getRestApi().getToken();

      const portal = await window.ProgressSubscription.getBillingPortal(
        token
      );

      if (!portal) {
        alert("Billing management is not available.");
        return null;
      }

      return portal;
    } catch (error) {
      console.error(
        "[Pro Management] Failed to load billing portal:",
        error
      );

      alert("Unable to load billing management. Please try again.");

      return null;
    }
  }

  async function onAction(button, portalKey) {
    button.disabled = true;

    try {
      const portal = await getBillingPortal();

      if (portal && portal[portalKey]) {
        window.open(portal[portalKey], "_blank");
      }
    } finally {
      button.disabled = false;
    }
  }

  // Load real subscription status once the Trello iframe is ready, and
  // re-render the header with the renewal date if the backend provides one.
  (async function loadStatus() {
    try {
      const t = await getTrelloIframe();
      resizeToContent();

      const token = await t.getRestApi().getToken();
      const status = await window.ProgressSubscription.getSubscriptionStatus(
        token
      );
      render(status);
    } catch (error) {
      console.warn("[Pro Management] Could not load subscription status:", error);
    }
  })();
})();