/* public/pro-upgrade.js
 *
 * Shared Pro upgrade screen for Billing, Reports,
 * and any other Pro-gated page.
 *
 * Plan:
 *   Monthly only — $4.99/month
 *
 * Requires:
 *   window.ProgressSubscription.startCheckout(token)
 *
 * Initialize once from the page:
 *   window.ProgressProUpgrade.init(t);
 *
 * Open from any button:
 *   window.ProgressProUpgrade.open();
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

  /* =========================================================
     Helpers
     ========================================================= */

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getIframe() {
    if (trelloIframe) {
      return trelloIframe;
    }

    return window.__ProgressTrelloIframe || null;
  }

  /* =========================================================
     Close screen
     ========================================================= */

  function close() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }

    document.removeEventListener("keydown", handleEscape);
  }

  /* =========================================================
     Checkout
     ========================================================= */

  async function startCheckout(button) {
    try {
      if (
        !window.ProgressSubscription ||
        typeof window.ProgressSubscription.startCheckout !== "function"
      ) {
        throw new Error("Subscription checkout is not available.");
      }

      const t = getIframe();

      if (!t || !t.getRestApi) {
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

      /*
       * Redirect to the hosted checkout page.
       *
       * We intentionally do not create monthly/annual logic here.
       * The backend checkout endpoint is responsible for returning
       * the configured $4.99/month checkout URL.
       */
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

  /* =========================================================
     Render Pro Upgrade Screen
     ========================================================= */

  function render() {
    close();

    overlay = document.createElement("div");

    overlay.id = "progressProUpgradeOverlay";

    overlay.innerHTML = `
      <style>

        /* =====================================================
           OVERLAY
           ===================================================== */

        #progressProUpgradeOverlay {
          position: fixed;
          inset: 0;
          z-index: 999999;

          display: flex;
          align-items: center;
          justify-content: center;

          padding: 24px;

          background: rgba(0, 0, 0, 0.72);

          font-family:
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            Roboto,
            Helvetica,
            Arial,
            sans-serif;
        }

        #progressProUpgradeOverlay *,
        #progressProUpgradeOverlay *::before,
        #progressProUpgradeOverlay *::after {
          box-sizing: border-box;
        }


        /* =====================================================
           MAIN CARD
           ===================================================== */

        .progress-pro-card {
          width: min(546px, 100%);

          overflow: hidden;

          border-radius: 0;

          background: #1f252c;

          color: #ffffff;

          box-shadow:
            0 24px 70px rgba(0, 0, 0, 0.55);
        }


        /* =====================================================
           HEADER
           ===================================================== */

        .progress-pro-header {
          padding: 26px 34px 28px;

          text-align: center;

          background:
            linear-gradient(
              110deg,
              #203d79 0%,
              #20184f 100%
            );
        }


        /* =====================================================
           PRO BADGE
           ===================================================== */

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


        /* =====================================================
           TITLE
           ===================================================== */

        .progress-pro-title {
          margin: 14px 0 8px;

          color: #ffffff;

          font-size: 25px;

          line-height: 1.12;

          font-weight: 800;

          letter-spacing: -0.7px;
        }


        /* =====================================================
           DESCRIPTION
           ===================================================== */

        .progress-pro-description {
          max-width: 470px;

          margin: 0 auto;

          color: #b8c3d5;

          font-size: 12px;

          line-height: 1.65;
        }


        /* =====================================================
           BODY
           ===================================================== */

        .progress-pro-body {
          padding: 26px 25px 28px;
        }


        /* =====================================================
           PRICE
           ===================================================== */

        .progress-pro-price {
          margin-bottom: 20px;

          text-align: center;
        }

        .progress-pro-amount {
          font-size: 32px;

          line-height: 1;

          font-weight: 800;

          letter-spacing: -0.8px;
        }

        .progress-pro-per {
          margin-left: 4px;

          color: #8492a7;

          font-size: 13px;
        }

        .progress-pro-monthly {
          margin-top: 6px;

          color: #8c9aae;

          font-size: 11px;
        }


        /* =====================================================
           FEATURES
           ===================================================== */

        .progress-pro-features {
          display: grid;

          grid-template-columns: 1fr 1fr;

          gap: 0;

          padding: 13px 14px;

          border-radius: 12px;

          background: #151a1f;
        }

        .progress-pro-feature {
          display: flex;

          align-items: flex-start;

          gap: 9px;

          min-width: 0;

          padding: 7px 0;

          color: #c8d0db;

          font-size: 11px;

          line-height: 1.4;
        }

        .progress-pro-check {
          flex: 0 0 auto;

          color: #1ed9a0;

          font-size: 15px;

          line-height: 1;

          font-weight: 700;
        }


        /* =====================================================
           BUY BUTTON
           ===================================================== */

        .progress-pro-buy {
          width: 100%;

          height: 45px;

          margin-top: 23px;

          border: 0;

          border-radius: 15px;

          background: #2161f5;

          color: #ffffff;

          font-size: 17px;

          font-weight: 500;

          cursor: pointer;

          transition:
            filter 0.15s ease,
            transform 0.05s ease;
        }

        .progress-pro-buy:hover {
          filter: brightness(1.08);
        }

        .progress-pro-buy:active {
          transform: translateY(1px);
        }

        .progress-pro-buy:disabled {
          cursor: wait;

          opacity: 0.7;
        }


        /* =====================================================
           CLOSE BUTTON
           ===================================================== */

        .progress-pro-close {
          display: block;

          margin: 12px auto 0;

          border: 0;

          background: transparent;

          color: #8794a6;

          font-size: 11px;

          cursor: pointer;
        }

        .progress-pro-close:hover {
          color: #c5ceda;
        }


        /* =====================================================
           MOBILE
           ===================================================== */

        @media (max-width: 560px) {

          #progressProUpgradeOverlay {
            padding: 12px;
          }

          .progress-pro-header {
            padding: 24px 20px;
          }

          .progress-pro-body {
            padding: 22px 16px 24px;
          }

          .progress-pro-title {
            font-size: 22px;
          }

          .progress-pro-features {
            grid-template-columns: 1fr;
          }
        }

      </style>


      <!-- ===================================================
           PRO CARD
           =================================================== -->

      <div
        class="progress-pro-card"
        role="dialog"
        aria-modal="true"
        aria-label="Upgrade to Progress Power-Up Pro"
      >

        <!-- HEADER -->

        <div class="progress-pro-header">

          <div class="progress-pro-badge">

            <span class="progress-pro-badge-icon">
              ✣
            </span>

            <span>
              Progress Power-Up Pro
            </span>

          </div>


          <h1 class="progress-pro-title">
            Unlock Workspace Billing &amp; Analytics
          </h1>


          <p class="progress-pro-description">
            Your 7-day trial experience has expired.
            Upgrade to keep tracking hourly rates,
            generating client reports, and viewing
            overtime analytics.
          </p>

        </div>


        <!-- BODY -->

        <div class="progress-pro-body">

          <!-- PRICE -->

          <div class="progress-pro-price">

            <span class="progress-pro-amount">
              $4.99
            </span>

            <span class="progress-pro-per">
              /mo
            </span>

            <div class="progress-pro-monthly">
              $4.99 / month
            </div>

          </div>


          <!-- FEATURES -->

          <div class="progress-pro-features">

            ${FEATURES.map(
              (feature) => `
                <div class="progress-pro-feature">

                  <span class="progress-pro-check">
                    ✓
                  </span>

                  <span>
                    ${escapeHtml(feature)}
                  </span>

                </div>
              `
            ).join("")}

          </div>


          <!-- BUY -->

          <button
            class="progress-pro-buy"
            id="progressProBuyBtn"
          >
            Buy Pro Now
          </button>


          <!-- CLOSE -->

          <button
            class="progress-pro-close"
            id="progressProCloseBtn"
          >
            Maybe later
          </button>

        </div>

      </div>
    `;


    document.body.appendChild(overlay);


    /* =======================================================
       CLOSE ON OUTSIDE CLICK
       ======================================================= */

    overlay.addEventListener("click", function (event) {

      if (event.target === overlay) {
        close();
      }

    });


    /* =======================================================
       MAYBE LATER
       ======================================================= */

    const closeButton =
      document.getElementById("progressProCloseBtn");

    if (closeButton) {
      closeButton.onclick = close;
    }


    /* =======================================================
       BUY PRO
       ======================================================= */

    const buyButton =
      document.getElementById("progressProBuyBtn");

    if (buyButton) {
      buyButton.onclick = function () {
        startCheckout(this);
      };
    }


    /* =======================================================
       ESCAPE KEY
       ======================================================= */

    document.addEventListener(
      "keydown",
      handleEscape
    );
  }


  /* =========================================================
     ESCAPE KEY
     ========================================================= */

  function handleEscape(event) {

    if (
      event.key === "Escape" &&
      overlay
    ) {
      close();
    }

  }


  /* =========================================================
     PUBLIC API
     ========================================================= */

  function open(t) {

    if (t) {
      trelloIframe = t;
    }

    render();
  }


  function init(t) {

    trelloIframe = t;

  }


  /* =========================================================
     GLOBAL
     ========================================================= */

  window.ProgressProUpgrade = {

    init: init,

    open: open,

    close: close,

  };

})();