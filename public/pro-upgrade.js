/* public/pro-upgrade.js
 *
 * Shared Pro upgrade popup for Billing, Reports,
 * and any other Pro-gated area.
 *
 * Plan: $4.99/month
 *
 * Usage:
 *   window.ProgressProUpgrade.open(t);
 *
 * Checkout:
 *   window.ProgressSubscription.startCheckout(token)
 */

(function () {
  "use strict";

  let trelloIframe = null;
  let overlay = null;

  const FEATURES = [
    "Unlimited Hourly Task Rates & Billing",
    "Full Weekly & Monthly Reports",
    "CSV & PDF Export Capability",
    "Overtime Warnings & Deadline Score",
  ];

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getIframe() {
    return trelloIframe || window.__ProgressTrelloIframe || null;
  }

  function handleEscape(event) {
    if (event.key === "Escape" && overlay) {
      close();
    }
  }

  function close() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }

    document.removeEventListener("keydown", handleEscape);
    if (typeof window.__progressFit === "function") {
    window.__progressFit();
  }
  }

  async function startCheckout(button) {
    try {
      if (
        !window.ProgressSubscription ||
        typeof window.ProgressSubscription.startCheckout !== "function"
      ) {
        throw new Error("Subscription checkout is not available.");
      }

      const t = getIframe();

      if (!t || typeof t.getRestApi !== "function") {
        throw new Error("Trello connection is not available.");
      }

      button.disabled = true;
      button.textContent = "Opening checkout…";

      const token = await t.getRestApi().getToken();

      const checkout =
        await window.ProgressSubscription.startCheckout(token);

      if (!checkout || !checkout.url) {
        throw new Error("Checkout URL was not returned.");
      }

      window.location.href = checkout.url;
    } catch (error) {
      console.error("[Pro Upgrade] Checkout failed:", error);

      button.disabled = false;
      button.textContent = "Buy Pro Now";

      alert(
        error?.message ||
          "Unable to start checkout. Please try again."
      );
    }
  }

  function render() {
    close();

    overlay = document.createElement("div");
    overlay.id = "progressProUpgradeOverlay";

    overlay.innerHTML = `
      <style>
        #progressProUpgradeOverlay {
          position: fixed;
          inset: 0;
          z-index: 999999;

          display: flex;
          align-items: center;
          justify-content: center;

          width: 100%;
          height: 100%;

          padding: 24px;

          background: rgba(0, 0, 0, 0.70);

          font-family:
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            Roboto,
            Helvetica,
            Arial,
            sans-serif;

          animation: progressProFadeIn 0.16s ease-out;
        }

        #progressProUpgradeOverlay *,
        #progressProUpgradeOverlay *::before,
        #progressProUpgradeOverlay *::after {
          box-sizing: border-box;
        }

        @keyframes progressProFadeIn {
          from {
            opacity: 0;
          }

          to {
            opacity: 1;
          }
        }

        @keyframes progressProModalIn {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.98);
          }

          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        /* Main popup */

        .progress-pro-card {
          position: relative;

          width: min(680px, calc(100% - 32px));
          height: auto;
          max-height: calc(100vh - 24px);

          overflow: hidden;

          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 18px;

          background: #1f252c;
          color: #ffffff;

          box-shadow:
            0 25px 80px rgba(0, 0, 0, 0.55),
            0 8px 30px rgba(0, 0, 0, 0.25);

          animation: progressProModalIn 0.18s ease-out;
        }

        /* Close button */

        .progress-pro-modal-close {
          position: absolute;
          top: 13px;
          right: 14px;
          z-index: 2;

          display: flex;
          align-items: center;
          justify-content: center;

          width: 34px;
          height: 34px;

          padding: 0;

          border: 0;
          border-radius: 8px;

          background: transparent;
          color: #8d98a8;

          font-size: 27px;
          font-weight: 300;
          line-height: 1;

          cursor: pointer;

          transition:
            background 0.15s ease,
            color 0.15s ease;
        }

        .progress-pro-modal-close:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
        }

        /* Header */

        .progress-pro-header {
          position: relative;

          padding: 30px 56px 28px;

          text-align: center;

          background:
            linear-gradient(
              110deg,
              #203d79 0%,
              #20184f 100%
            );
        }

        .progress-pro-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;

          gap: 7px;

          padding: 6px 12px;

          border: 1px solid rgba(76, 151, 255, 0.38);
          border-radius: 999px;

          background: rgba(18, 89, 190, 0.38);

          color: #8fc0ff;

          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.1px;
        }

        .progress-pro-badge-icon {
          font-size: 13px;
        }

        .progress-pro-title {
          margin: 15px 0 9px;

          color: #ffffff;

          font-size: 25px;
          line-height: 1.16;
          font-weight: 800;
          letter-spacing: -0.7px;
        }

        .progress-pro-description {
          max-width: 480px;

          margin: 0 auto;

          color: #b8c3d5;

          font-size: 12px;
          line-height: 1.65;
        }

        /* Body */

        .progress-pro-body {
          padding: 26px 28px 25px;
        }

        /* Price */

        .progress-pro-price {
          margin-bottom: 20px;

          text-align: center;
        }

        .progress-pro-price-main {
          display: flex;
          align-items: baseline;
          justify-content: center;
        }

        .progress-pro-amount {
          color: #ffffff;

          font-size: 34px;
          line-height: 1;
          font-weight: 800;
          letter-spacing: -1px;
        }

        .progress-pro-per {
          margin-left: 5px;

          color: #8d9aac;

          font-size: 13px;
        }

        .progress-pro-monthly {
          margin-top: 6px;

          color: #8996a8;

          font-size: 11px;
        }

        /* Features */

        .progress-pro-features {
          display: grid;

          grid-template-columns: 1fr 1fr;

          gap: 1px;

          padding: 13px 16px;

          border: 1px solid rgba(255, 255, 255, 0.045);
          border-radius: 12px;

          background: #151a1f;
        }

        .progress-pro-feature {
          display: flex;
          align-items: flex-start;

          gap: 9px;

          min-width: 0;

          padding: 8px 5px;

          color: #c8d0db;

          font-size: 11px;
          line-height: 1.45;
        }

        .progress-pro-check {
          flex: 0 0 auto;

          color: #1ed9a0;

          font-size: 15px;
          line-height: 1;
          font-weight: 700;
        }

        /* Buy button */

        .progress-pro-buy {
          width: 100%;
          height: 46px;

          margin-top: 22px;

          border: 0;
          border-radius: 12px;

          background: #2161f5;
          color: #ffffff;

          font-size: 16px;
          font-weight: 600;

          cursor: pointer;

          box-shadow:
            0 6px 18px rgba(33, 97, 245, 0.22);

          transition:
            filter 0.15s ease,
            transform 0.05s ease,
            opacity 0.15s ease;
        }

        .progress-pro-buy:hover {
          filter: brightness(1.08);
        }

        .progress-pro-buy:active {
          transform: translateY(1px);
        }

        .progress-pro-buy:disabled {
          cursor: wait;
          opacity: 0.65;
        }

        /* Secure checkout */

        .progress-pro-secure {
          display: flex;
          align-items: center;
          justify-content: center;

          gap: 6px;

          margin-top: 12px;

          color: #778497;

          font-size: 10px;
        }

        .progress-pro-secure-icon {
          font-size: 11px;
        }

        /*
         * IMPORTANT:
         * Do NOT aggressively shrink the popup for short
         * Trello iframes. The popup should remain a proper
         * centered modal.
         */

        /* Mobile */

        @media (max-width: 560px) {
          #progressProUpgradeOverlay {
            padding: 12px;
          }

          .progress-pro-card {
            width: 100%;
            max-height: calc(100vh - 24px);

            border-radius: 15px;
          }

          .progress-pro-header {
            padding: 27px 43px 25px;
          }

          .progress-pro-title {
            font-size: 22px;
          }

          .progress-pro-body {
            padding: 22px 17px 22px;
          }

          .progress-pro-features {
            grid-template-columns: 1fr;
          }
        }
      </style>

      <div
        class="progress-pro-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="progressProUpgradeTitle"
      >

        <button
          type="button"
          class="progress-pro-modal-close"
          id="progressProModalClose"
          aria-label="Close"
        >
          ×
        </button>

        <div class="progress-pro-header">

          <div class="progress-pro-badge">
            <span class="progress-pro-badge-icon">✣</span>
            <span>Progress Power-Up Pro</span>
          </div>

          <h1
            class="progress-pro-title"
            id="progressProUpgradeTitle"
          >
            Unlock Workspace Billing &amp; Analytics
          </h1>

          <p class="progress-pro-description">
            Your 7-day trial experience has expired.
            Upgrade to keep tracking hourly rates,
            generating client reports, and viewing
            overtime analytics.
          </p>

        </div>

        <div class="progress-pro-body">

          <div class="progress-pro-price">

            <div class="progress-pro-price-main">
              <span class="progress-pro-amount">
                $4.99
              </span>

              <span class="progress-pro-per">
                /mo
              </span>
            </div>

            <div class="progress-pro-monthly">
              $4.99 / month
            </div>

          </div>

          <div class="progress-pro-features">

            ${FEATURES.map(
              (feature) => `
                <div class="progress-pro-feature">
                  <span class="progress-pro-check">✓</span>
                  <span>${escapeHtml(feature)}</span>
                </div>
              `
            ).join("")}

          </div>

          <button
            type="button"
            class="progress-pro-buy"
            id="progressProBuyBtn"
          >
            Buy Pro Now
          </button>

          <div class="progress-pro-secure">
            <span class="progress-pro-secure-icon">🔒</span>
            <span>Secure checkout</span>
          </div>

        </div>

      </div>
    `;

    document.body.appendChild(overlay);

    const card =
      overlay.querySelector(".progress-pro-card");

    const closeButton =
      document.getElementById("progressProModalClose");

    const buyButton =
      document.getElementById("progressProBuyBtn");

    closeButton.onclick = close;

    buyButton.onclick = function () {
      startCheckout(this);
    };

    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) {
        close();
      }
    });

    card.addEventListener("click", function (event) {
      event.stopPropagation();
    });

    document.addEventListener("keydown", handleEscape);
  }

  function open(t) {
    if (t) {
      trelloIframe = t;
    }

    render();
  }

  function init(t) {
    trelloIframe = t;
  }

  window.ProgressProUpgrade = {
    init,
    open,
    close,
  };
})();