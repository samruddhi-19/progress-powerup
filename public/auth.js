/* global TrelloPowerUp */
const t = TrelloPowerUp.iframe();

document.getElementById("authBtn").addEventListener("click", async () => {
  await t.set("member", "private", "authorized", true);
  await t.set("board", "shared", "disabled", false);
  return t.closePopup();
});
