var t = TrelloPowerUp.iframe();

document.getElementById("authBtn").onclick = async () => {
  await t.set("board", "shared", "disabled", false);
  t.closePopup();
  t.refresh();
};
