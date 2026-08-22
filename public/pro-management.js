(function () {
  "use strict";

  const app = document.getElementById("app");
  let trelloIframe = null;

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

  const icon = (paths) =>
    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

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

    const renewLine = renewsAt
      ? `$4 per month &middot; renews ${esc(fmtDate(renewsAt))}`
      : "$4 per month";

    app.innerHTML = `
    <div class="pro-management">
      <div class="pm-header">
        <div class="pm-header-top">
          <div class="pm-icon">${icon(ICONS.chart)}</div>
          <div>
            <p class="pm-eyebrow">Power-up</p>
            <h1 class="pm-title">Progress Pro</h1>
          </div>
        </div>
        <p class="pm-sub">You're on Pro. ${renewLine}</p>
      </div>

      <div class="pm-actions">
        <button type="button" class="pm-action" id="billingOverview">
          <span class="pm-action-icon">${icon(ICONS.receipt)}</span>
          <span class="pm-action-text">
            <span class="pm-action-label">Billing overview</span>
            <span class="pm-action-desc">Invoices and payment history</span>
          </span>
          <span class="pm-action-chevron">${icon(ICONS.chevron)}</span>
        </button>

        <button type="button" class="pm-action" id="updatePayment">
          <span class="pm-action-icon">${icon(ICONS.card)}</span>
          <span class="pm-action-text">
            <span class="pm-action-label">Update payment method</span>
            <span class="pm-action-desc">Manage your card on file</span>
          </span>
          <span class="pm-action-chevron">${icon(ICONS.chevron)}</span>
        </button>
      </div>

      <div class="pm-footer">
        <button type="button" class="pm-cancel" id="cancelSubscription">
          ${icon(ICONS.x)}
          Cancel subscription
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

    // Ask Trello to shrink the popup down to the content we just rendered,
    // instead of leaving Trello's larger default popup size with empty space.
    resizeToContent();
  }

  render(null);

  function resizeToContent() {
    if (trelloIframe && typeof trelloIframe.sizeTo === "function") {
      trelloIframe.sizeTo("#app").catch(function () {});
    }
  }

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
    const originalHtml = button.innerHTML;
    button.disabled = true;

    try {
      const portal = await getBillingPortal();

      if (portal && portal[portalKey]) {
        window.open(portal[portalKey], "_blank");
      }
    } finally {
      button.disabled = false;
      button.innerHTML = originalHtml;
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