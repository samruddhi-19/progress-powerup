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
})();