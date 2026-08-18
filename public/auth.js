/* global TrelloPowerUp */

const t = TrelloPowerUp.iframe();

document.getElementById("authBtn").addEventListener("click", async () => {
  const btn = document.getElementById("authBtn");
  const msg = document.getElementById("authMsg");

  btn.disabled = true;

  if (msg) {
    msg.textContent = "Authorizing...";
  }

  try {
    // Get the Trello REST API token.
    // This is the same token your backend uses to identify the user.
    const token = await t.getRestApi().getToken();

    if (!token) {
      throw new Error("Unable to get Trello authorization token.");
    }

    // IMPORTANT:
    // The first call to subscription/status lets the existing backend
    // create the user and start the 7-day trial.
    const status =
      await window.ProgressSubscription.getSubscriptionStatus(token);

    console.log("[Progress] Subscription status after authorization:", status);

    // Store authorization state in Trello.
    await t.set("member", "private", "authorized", true);
    await t.set("board", "shared", "disabled", false);

    if (msg) {
      msg.textContent = "Success! Reloading...";
    }

    setTimeout(() => {
      window.location.reload();
    }, 500);

  } catch (e) {
    console.error("[Progress] Authorization failed:", e);

    btn.disabled = false;

    if (msg) {
      msg.textContent =
        e?.message || "Failed. Please try again.";
    }
  }
});