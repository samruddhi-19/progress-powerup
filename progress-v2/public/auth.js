/* global TrelloPowerUp */
const t = TrelloPowerUp.iframe();

document.getElementById("authBtn").addEventListener("click", async () => {
  const btn = document.getElementById("authBtn");
  const msg = document.getElementById("authMsg");
  
  btn.disabled = true;
  if (msg) msg.textContent = "Authorizing...";

  try {
    await t.set("member", "private", "authorized", true);
    await t.set("board", "shared", "disabled", false);
    
    if (msg) msg.textContent = "Success! Reloading...";
    
    // Don't use t.closePopup() - just reload
    setTimeout(() => window.location.reload(), 500);
  } catch (e) {
    btn.disabled = false;
    if (msg) msg.textContent = "Failed. Please try again.";
  }
});
