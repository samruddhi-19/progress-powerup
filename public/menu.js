/* global TrelloPowerUp */
      const t = TrelloPowerUp.iframe();

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
            height: 720,
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
            height: 480,
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

      /* Match Trello's current light/dark theme */
      t.getContext &&
        Promise.resolve(t.getContext())
          .then((ctx) => {
            const theme =
              (ctx && ctx.theme) ||
              (window.matchMedia &&
              window.matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light");
            document.documentElement.dataset.theme = theme;
          })
          .catch(() => {})
          .finally(render);