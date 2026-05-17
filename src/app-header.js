(function () {
  const CONFIG = window.APP_CONFIG || {};
  const LOGO_URL = CONFIG.SITE_LOGO_URL || "";
  const SITE_NAME = CONFIG.SITE_NAME || "Find That Scene";

  window.FTS = window.FTS || {};

  function getPath() {
    return window.location.pathname.replace(/\/+$/, "");
  }

  function getRootPath() {
    if (document.body.dataset.navRoot) return document.body.dataset.navRoot;

    const path = getPath();

    const nestedRoutes = [
      "/browse",
      "/explore",
      "/title",
      "/stats",
      "/national-trust",
      "/privacy",
      "/metadata",
      "/person"
    ];

    if (nestedRoutes.some((route) => path.endsWith(route))) {
      return "../";
    }

    return "./";
  }

  function render() {
    if (document.querySelector('.fts-app-header')) return;

    const header = document.createElement('header');
    header.className = 'fts-app-header';

    const style = document.createElement('style');
    style.textContent = `
      body { padding-top: 72px; }
      .fts-app-header {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 3200;
        height: 72px;
        padding: 12px 16px;
        background: rgba(255,255,255,0.92);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        border-bottom: 1px solid rgba(229,231,235,0.9);
        display:flex;
        align-items:center;
        justify-content:center;
      }
      .fts-app-header-link {
        display:inline-flex;
        align-items:center;
        justify-content:center;
      }
      .fts-app-header-logo {
        max-height:48px;
        width:auto;
        display:block;
      }
    `;

    document.head.appendChild(style);

    header.innerHTML = `
      <a class="fts-app-header-link" href="${getRootPath()}" aria-label="${SITE_NAME} home">
        <img class="fts-app-header-logo" src="${LOGO_URL}" alt="${SITE_NAME}">
      </a>
    `;

    document.body.prepend(header);
  }

  FTS.AppHeader = {
    getRootPath
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();