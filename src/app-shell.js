(function () {
  const config = window.APP_CONFIG || {};

  function getRuntimeConfig() {
    return window.RUNTIME_CONFIG || {};
  }

  function getSharedScriptBase() {
    const path = window.location.pathname.replace(/\/+$/, "");
    const routeNames = ["browse", "explore", "title", "stats", "national-trust", "privacy", "metadata", "person", "genre"];
    const isNestedRoute = routeNames.some((route) => path.endsWith(`/${route}`));

    return isNestedRoute ? "../src/" : "./src/";
  }

  const sharedScriptBase = getSharedScriptBase();

  function getScriptTarget() {
    return document.head || document.documentElement;
  }

  function onDomReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  function loadSharedScript(name, attribute, options = {}) {
    if (document.querySelector(`script[${attribute}]`)) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = `${sharedScriptBase}${name}`;
      script.setAttribute(attribute, "true");
      script.async = false;

      if (options.defer !== false) {
        script.defer = true;
      }

      script.onload = resolve;
      script.onerror = resolve;

      getScriptTarget().appendChild(script);
    });
  }

  function dispatchReady(name) {
    window.dispatchEvent(new CustomEvent(`fts:${name}-ready`));
  }

  function hasPrivacyChoice() {
    try {
      const raw = localStorage.getItem("fts-privacy-settings");
      if (!raw) return false;

      const settings = JSON.parse(raw);
      return settings && typeof settings === "object";
    } catch (err) {
      return false;
    }
  }

  function loadPrivacySystem() {
    return loadSharedScript("privacy-consent.js", "data-fts-privacy-consent")
      .then(() => dispatchReady("privacy"));
  }

  function loadAppSettings() {
    return loadSharedScript("app-settings.js", "data-fts-app-settings")
      .then(() => dispatchReady("app-settings"));
  }

  function loadVisibility() {
    return loadSharedScript("visibility.js", "data-fts-visibility")
      .then(() => dispatchReady("visibility"));
  }

  function loadAnalytics() {
    return loadSharedScript("analytics.js", "data-fts-analytics")
      .then(() => dispatchReady("analytics"));
  }

  function loadHeader() {
    return loadSharedScript("header.js", "data-fts-header")
      .then(() => dispatchReady("header"));
  }

  function loadBottomNav() {
    return loadSharedScript("bottom-nav.js", "data-fts-bottom-nav")
      .then(() => dispatchReady("bottom-nav"));
  }

  function init() {
    loadHeader();
    loadBottomNav();
    loadPrivacySystem()
      .then(loadAppSettings)
      .then(loadVisibility)
      .then(loadAnalytics);
  }

  onDomReady(init);
})();