/* global TrelloPowerUp */
      const t = TrelloPowerUp.iframe({
        appKey: window.ProgressConfig.API_KEY,
        appName: window.ProgressConfig.APP_NAME,
      });

      const ITEMS = [
        {
          key: "reports",
          cls: "green",
          title: "Reports & Analytics",
          sub: "View time metrics and board charts",
          icon: '<path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="7" rx="1"/><rect x="12" y="6" width="3" height="11" rx="1"/><rect x="17" y="13" width="3" height="4" rx="1"/>',
          modal: {
            title: "Reports & Analytics",
            url: "./reports.html",
            fullscreen: false,
            height: 820,
          },
        },
        {
          key: "mapping",
          cls: "blue",
          title: "Progress Cards (Mapping)",
          sub: "Configure lists and cards to track",
          icon: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6" stroke-width="2.2"/>',
          popup: {
            title: "Progress Cards",
            url: "./progress-cards.html",
            height: 560,
          },
        },
        {
          key: "billing",
          cls: "orange",
          title: "Workspace & Billing",
          sub: "Manage your plan and members",
          icon: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1.1-3 2.5S10.3 12 12 12s3 1.1 3 2.5S13.7 17 12 17s-3-1.1-3-2.5M12 5.5v13" stroke-width="1.8"/>',
          popup: {
  title: "Workspace & Billing",
  url: "./billing.html",
  height: 660,
},
        },
      ];

      const svg = (path) =>
        `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="1.6"
              stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

      const chevron = svg('<path d="m9 18 6-6-6-6"/>');

      function render() {
        const root = document.getElementById("menu");
        root.innerHTML = "";
        ITEMS.forEach((item) => {
          const btn = document.createElement("button");
          btn.className = `menu-item ${item.cls}`;
          btn.innerHTML = `
            <span class="chip">${svg(item.icon)}</span>
            <span class="text">
              <span class="title">${item.title}</span>
              <span class="sub">${item.sub}</span>
            </span>
            <span class="chevron">${chevron}</span>`;
          btn.addEventListener("click", () =>
            item.modal ? t.modal(item.modal) : t.popup(item.popup),
          );
          root.appendChild(btn);
        });
        t.sizeTo("body").catch(() => {});
      }

      /* ── one-time authorization gate ──
         Two legacy systems must both be satisfied:
         1) real Trello OAuth token  (getRestApi — used by reports + due-date sync)
         2) enable flags             (member/private authorized + board not disabled — gates mapping)
         This screen satisfies both with a single click, so no downstream page asks again. */
      async function authState() {
        try {
          const [all, restOk] = await Promise.all([
            t.getAll(),
            t.getRestApi().isAuthorized(),
          ]);
          const flagOk =
            all && all.member && all.member.private && all.member.private.authorized === true &&
            !(all.board && all.board.shared && all.board.shared.disabled === true);
          return { restOk: !!restOk, flagOk: !!flagOk };
        } catch (e) {
          return { restOk: false, flagOk: false };
        }
      }

      function renderAuth(errMsg) {
        const root = document.getElementById("menu");
        root.innerHTML = `
          <div class="auth">
            <div class="auth-chip">${svg('<rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>')}</div>
            <div class="auth-title">Connect Trello to get started</div>
            <div class="auth-sub">One-time authorization enables card tracking, mapping, and reports on this board.</div>
            ${errMsg ? `<div class="auth-err">${errMsg}</div>` : ""}
            <button class="auth-btn" id="authBtn">Connect Trello</button>
          </div>`;
        document.getElementById("authBtn").addEventListener("click", connect);
        t.sizeTo("body").catch(() => {});
      }

      async function connect() {
        const btn = document.getElementById("authBtn");
        btn.disabled = true;
        btn.textContent = "Connecting…";
        try {
          await t.getRestApi().authorize({ scope: "read,write", expiration: "never" });
          await t.set("member", "private", "authorized", true);
          await t.set("board", "shared", "disabled", false);
          render();
        } catch (e) {
          renderAuth("Authorization was cancelled or failed — please try again.");
        }
      }

      async function boot() {
        const s = await authState();
        if (s.restOk && s.flagOk) return render();
        // If OAuth already done but flags unset (or vice versa), silently repair what we can
        if (s.restOk && !s.flagOk) {
          try {
            await t.set("member", "private", "authorized", true);
            await t.set("board", "shared", "disabled", false);
            return render();
          } catch (e) {}
        }
        renderAuth();
      }

      /* Match Trello's theme; default dark like the rest of the Power-Up */
      function detectTheme(ctx) {
        const url = new URLSearchParams(location.search).get("theme");
        const th = (ctx && ctx.theme) || url;
        return th === "light" ? "light" : "dark";
      }
      Promise.resolve(t.getContext ? t.getContext() : null)
        .then((ctx) => {
          document.documentElement.dataset.theme = detectTheme(ctx);
        })
        .catch(() => {
          document.documentElement.dataset.theme = "dark";
        })
        .finally(boot);