// public/subscription.js

(function () {
  "use strict";

  /**
   * Get the configured Progress backend URL.
   */
  function getApiBaseUrl() {
    if (
      !window.ProgressConfig ||
      !window.ProgressConfig.API_BASE
    ) {
      throw new Error("Progress API base URL is not configured.");
    }

    return window.ProgressConfig.API_BASE.replace(/\/$/, "");
  }

  /**
   * Get the current user's subscription/trial status.
   *
   * @param {string} token Trello REST API token
   * @returns {Promise<Object>}
   */
  async function getSubscriptionStatus(token) {
    if (!token) {
      throw new Error("Trello token is required.");
    }

    const response = await fetch(
      `${getApiBaseUrl()}/api/subscription/status`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        `Failed to get subscription status (${response.status}): ${errorText}`
      );
    }

    return await response.json();
  }

  /**
   * Start the Pro checkout.
   *
   * @param {string} token Trello REST API token
   * @returns {Promise<Object>}
   */
  async function startCheckout(token) {
    if (!token) {
      throw new Error("Trello token is required.");
    }

    const response = await fetch(
      `${getApiBaseUrl()}/api/checkout/init`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        `Failed to initialize checkout (${response.status}): ${errorText}`
      );
    }

    return await response.json();
  }

  /**
   * Calculate the number of full days remaining in the trial.
   *
   * @param {string|Date} trialEndsAt
   * @returns {number}
   */
  function getTrialDaysRemaining(trialEndsAt) {
    if (!trialEndsAt) {
      return 0;
    }

    const endTime = new Date(trialEndsAt).getTime();
    const now = Date.now();

    if (Number.isNaN(endTime) || endTime <= now) {
      return 0;
    }

    return Math.ceil((endTime - now) / (1000 * 60 * 60 * 24));
  }

  /**
   * Check whether the subscription currently gives Pro access.
   *
   * @param {Object} status
   * @returns {boolean}
   */
  function hasProAccess(status) {
    if (!status) {
      return false;
    }

    return Boolean(status.isPro || status.isTrialActive);
  }

  /**
   * Check whether the user is currently on the free trial.
   *
   * @param {Object} status
   * @returns {boolean}
   */
  function isTrialActive(status) {
    return Boolean(status && status.isTrialActive);
  }

  /**
   * Check whether the user is a paid Pro user.
   *
   * @param {Object} status
   * @returns {boolean}
   */
  function isPro(status) {
    return Boolean(status && status.isPro);
  }

  /**
 * Get billing portal links for a paid Pro subscriber.
 *
 * Returns:
 * {
 *   overview,
 *   cancelSubscription,
 *   updatePaymentMethod
 * }
 *
 * @param {string} token Trello REST API token
 * @returns {Promise<Object|null>}
 */
async function getBillingPortal(token) {
  if (!token) {
    throw new Error("Trello token is required.");
  }

  const response = await fetch(
    `${getApiBaseUrl()}/api/subscription/portal`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  // Free/trial users do not have a billing portal.
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Failed to get billing portal (${response.status}): ${errorText}`
    );
  }

  return await response.json();
}

  // Expose the subscription API globally.
  window.ProgressSubscription = {
  getSubscriptionStatus,
  startCheckout,
  getBillingPortal,
  getTrialDaysRemaining,
  hasProAccess,
  isTrialActive,
  isPro,
};
})();