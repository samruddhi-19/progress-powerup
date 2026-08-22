(function () {
  "use strict";

  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="pro-management">
      <div class="pro-icon">🎉</div>

      <h1>You're on Pro!</h1>

      <p>Manage your Pro subscription</p>

      <div class="pro-actions">
        <button id="billingOverview">
          Billing Overview
        </button>

        <button id="updatePayment">
          Update Payment Method
        </button>

        <button id="cancelSubscription">
          Cancel Subscription
        </button>
      </div>
    </div>
  `;

  async function getBillingPortal() {
    try {
      if (
        !window.TrelloPowerUp ||
        typeof window.TrelloPowerUp.iframe !== "function"
      ) {
        throw new Error("Trello Power-Up API is not available.");
      }

      const t = window.TrelloPowerUp.iframe({
  appKey: window.ProgressConfig.API_KEY,
  appName: window.ProgressConfig.APP_NAME,
});

const token = await t.getRestApi().getToken();

      const portal =
        await window.ProgressSubscription.getBillingPortal(token);

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

      alert(
        "Unable to load billing management. Please try again."
      );

      return null;
    }
  }

  document
    .getElementById("billingOverview")
    .addEventListener("click", async () => {
      const portal = await getBillingPortal();

      if (portal && portal.overview) {
        window.open(portal.overview, "_blank");
      }
    });

  document
    .getElementById("updatePayment")
    .addEventListener("click", async () => {
      const portal = await getBillingPortal();

      if (portal && portal.updatePaymentMethod) {
        window.open(portal.updatePaymentMethod, "_blank");
      }
    });

  document
    .getElementById("cancelSubscription")
    .addEventListener("click", async () => {
      const portal = await getBillingPortal();

      if (portal && portal.cancelSubscription) {
        window.open(portal.cancelSubscription, "_blank");
      }
    });
})();