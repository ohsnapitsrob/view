(function () {
  function getRootPath() {
    if (window.FTS?.Routes?.getRootPath) return window.FTS.Routes.getRootPath();
    if (document.body.dataset.navRoot) return document.body.dataset.navRoot;

    const path = window.location.pathname.replace(/\/+$/, "");
    const nestedRoutes = ["/browse", "/explore", "/title", "/stats", "/national-trust", "/feed", "/privacy", "/metadata", "/person", "/genre", "/films", "/series", "/music-videos", "/games", "/other"];
    return nestedRoutes.some((route) => path.endsWith(route)) ? "../" : "./";
  }

  const rootPath = getRootPath();
  const items = [
    { key: "home", label: "Home", href: rootPath, icon: "⌂" },
    { key: "feed", label: "Feed", href: `${rootPath}feed/`, icon: "≡" },
    { key: "map", label: "Map", href: `${rootPath}explore/`, icon: "⌖" },
    { key: "browse", label: "Browse", href: `${rootPath}browse/`, icon: "▦" }
  ];

  function getActiveKey() {
    const path = window.location.pathname.replace(/\/+$/, "");
    if (path === "" || path === "/" || path.endsWith("/index.html")) return "home";
    if (path.endsWith("/feed")) return "feed";
    if (path.endsWith("/explore")) return "map";
    if (path.endsWith("/browse")) return "browse";
    return null;
  }

  function addStyle() {
    if (document.getElementById("fts-bottom-nav-style")) return;

    const style = document.createElement("style");
    style.id = "fts-bottom-nav-style";
    style.textContent = `
      body.fts-has-bottom-nav { padding-bottom: calc(88px + env(safe-area-inset-bottom)); }
      body.fts-has-bottom-nav:has(#map) { padding-bottom: 0; }
      .fts-bottom-nav {
        position: fixed !important;
        left: 50% !important;
        right: auto !important;
        top: auto !important;
        bottom: calc(14px + env(safe-area-inset-bottom)) !important;
        z-index: 3600;
        width: min(520px, calc(100vw - 20px));
        transform: translate3d(-50%, 0, 0);
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 6px;
        padding: 7px;
        border: 1px solid rgba(229, 231, 235, 0.9);
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.88);
        box-shadow: 0 18px 50px rgba(15, 23, 42, 0.18);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }
      .fts-bottom-nav a {
        min-width: 0;
        min-height: 54px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        border-radius: 18px;
        color: #6b7280;
        text-decoration: none;
        font-size: 11px;
        font-weight: 750;
        letter-spacing: 0.01em;
        -webkit-tap-highlight-color: transparent;
      }
      .fts-bottom-nav a[aria-current="page"] { background: #111827; color: #ffffff; }
      .fts-bottom-nav-icon { font-size: 22px; line-height: 1; font-weight: 850; }
      @media (min-width: 900px) {
        .fts-bottom-nav { width: 500px; bottom: 18px !important; }
      }
    `;

    document.head.appendChild(style);
  }

  function render() {
    if (document.querySelector(".fts-bottom-nav")) return;

    const activeKey = getActiveKey();
    const nav = document.createElement("nav");
    nav.className = "fts-bottom-nav";
    nav.setAttribute("aria-label", "Primary navigation");
    nav.innerHTML = items.map((item) => {
      const active = activeKey && item.key === activeKey;
      return `
        <a href="${item.href}"${active ? ' aria-current="page"' : ""}>
          <span class="fts-bottom-nav-icon" aria-hidden="true">${item.icon}</span>
          <span>${item.label}</span>
        </a>
      `;
    }).join("");

    document.body.classList.add("fts-has-bottom-nav");
    document.body.appendChild(nav);
  }

  addStyle();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
