window.FTS = window.FTS || {};

FTS.DataCache = (function () {
  const CACHE_VERSION = "v2";
  const CACHE_PREFIX = "fts:csv";
  const DATA_VERSION_STORAGE_KEY = "fts:data-version";
  const DATA_VERSION_URL = "data-version.json";
  const STAGING_CACHE_SETTING_KEY = "fts:staging-cache-enabled";

  let dataVersionPromise = null;
  let activeDataVersion = null;

  function getRuntimeConfig() {
    return window.RUNTIME_CONFIG || {};
  }

  function getEnvironment() {
    return getRuntimeConfig().environment || "live";
  }

  function isStaging() {
    return getEnvironment() === "staging";
  }

  function params() {
    return new URLSearchParams(window.location.search || "");
  }

  function hasCacheBuster() {
    const p = params();
    return p.has("cacheBust") || p.has("cacheBuster") || p.has("ftsRefresh") || p.has("refreshData");
  }

  function getRootPath() {
    if (window.FTS?.AppHeader?.getRootPath) return window.FTS.AppHeader.getRootPath();

    const path = window.location.pathname.replace(/\/+$/, "");
    const routeNames = ["browse", "explore", "title", "stats", "national-trust", "feed", "privacy", "metadata", "person", "genre", "films", "series", "music-videos", "games", "other"];
    const isNestedRoute = routeNames.some((route) => path.endsWith(`/${route}`));
    return isNestedRoute ? "../" : "./";
  }

  function stagingCacheEnabled() {
    if (!isStaging()) return false;

    try {
      return localStorage.getItem(STAGING_CACHE_SETTING_KEY) === "true";
    } catch (err) {
      return false;
    }
  }

  function setStagingCacheEnabled(enabled) {
    try {
      localStorage.setItem(STAGING_CACHE_SETTING_KEY, enabled ? "true" : "false");
    } catch (err) {
      // Ignore storage failures.
    }
  }

  function cacheEnabled(options = {}) {
    if (options.cache === false) return false;
    if (hasCacheBuster()) return false;

    if (isStaging()) {
      return stagingCacheEnabled();
    }

    return true;
  }

  function fallbackDataVersion(date = new Date()) {
    return `fallback:${date.toISOString().slice(0, 13)}`;
  }

  function cacheKey(url, version = activeDataVersion || fallbackDataVersion()) {
    return `${CACHE_PREFIX}:${CACHE_VERSION}:${version}:${url}`;
  }

  function localStorageAvailable() {
    try {
      const testKey = `${CACHE_PREFIX}:test`;
      localStorage.setItem(testKey, "1");
      localStorage.removeItem(testKey);
      return true;
    } catch (err) {
      return false;
    }
  }

  function sessionStorageAvailable() {
    try {
      const testKey = `${CACHE_PREFIX}:session-test`;
      sessionStorage.setItem(testKey, "1");
      sessionStorage.removeItem(testKey);
      return true;
    } catch (err) {
      return false;
    }
  }

  function readCache(key) {
    if (!localStorageAvailable()) return null;
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function writeCache(key, value) {
    if (!localStorageAvailable()) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      // Storage may be full or blocked. Cache failure should never block the app.
    }
  }

  function clearCsvCache() {
    if (!localStorageAvailable()) return;

    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith(CACHE_PREFIX)) localStorage.removeItem(key);
      });
    } catch (err) {
      // Cache clearing should never block the app.
    }
  }

  function clearSessionProjectCaches() {
    if (!sessionStorageAvailable()) return;

    try {
      Object.keys(sessionStorage).forEach((key) => {
        if (key.startsWith("fts:")) sessionStorage.removeItem(key);
      });
    } catch (err) {
      // Cache clearing should never block the app.
    }
  }

  function clearCache() {
    clearCsvCache();
    clearSessionProjectCaches();
    activeDataVersion = null;
    dataVersionPromise = null;
    log("cleared project data cache");
  }

  function shouldDebug(options = {}) {
    return isStaging() || options.debug === true;
  }

  function log(event, details, options = {}) {
    if (!shouldDebug(options)) return;
    if (!window.console) return;
    console.info(`[FTS Cache] ${event}`, details || "");
  }

  function norm(value) {
    return (value || "").toString().trim();
  }

  async function fetchDataVersion(options = {}) {
    const url = `${getRootPath()}${DATA_VERSION_URL}`;

    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not load ${DATA_VERSION_URL}`);

      const data = await response.json();
      const version = norm(data.version || data.updatedAt || data.timestamp);

      if (!version) throw new Error(`${DATA_VERSION_URL} has no version value`);

      return version;
    } catch (err) {
      const fallback = fallbackDataVersion();
      log("data version fallback", { reason: err?.message || "unknown", version: fallback }, options);
      return fallback;
    }
  }

  function storedDataVersion() {
    try {
      return localStorage.getItem(DATA_VERSION_STORAGE_KEY) || "";
    } catch (err) {
      return "";
    }
  }

  function saveDataVersion(version) {
    try {
      localStorage.setItem(DATA_VERSION_STORAGE_KEY, version);
    } catch (err) {}
  }

  async function ensureDataVersion(options = {}) {
    if (hasCacheBuster()) {
      clearCache();
    }

    if (dataVersionPromise) return dataVersionPromise;

    dataVersionPromise = (async () => {
      const version = await fetchDataVersion(options);
      const previous = storedDataVersion();

      if (previous && previous !== version) {
        clearCsvCache();
        clearSessionProjectCaches();
        log("data version changed, cleared caches", { previous, version }, options);
      }

      if (!previous) {
        log("data version stored", { version }, options);
      }

      saveDataVersion(version);
      activeDataVersion = version;

      window.dispatchEvent(new CustomEvent("fts:data-version-ready", {
        detail: { version, previous }
      }));

      return version;
    })();

    return dataVersionPromise;
  }

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const character = text[i];
      const next = text[i + 1];

      if (character === '"' && inQuotes && next === '"') {
        current += '"';
        i += 1;
        continue;
      }

      if (character === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (character === "," && !inQuotes) {
        row.push(current);
        current = "";
        continue;
      }

      if ((character === "\n" || character === "\r") && !inQuotes) {
        if (character === "\r" && next === "\n") i += 1;
        row.push(current);
        current = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
        continue;
      }

      current += character;
    }

    row.push(current);
    if (row.length > 1 || row[0] !== "") rows.push(row);
    return rows;
  }

  function rowsToObjects(rows) {
    if (!rows.length) return [];
    const headers = rows[0].map(norm);
    return rows.slice(1).map((row) => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] || "";
      });
      return obj;
    }).filter((row) => Object.values(row).some((value) => norm(value) !== ""));
  }

  function renderStagingToggle() {
    if (!isStaging()) return;
    if (document.getElementById("fts-staging-cache-toggle")) return;

    const toggle = document.createElement("button");
    toggle.id = "fts-staging-cache-toggle";

    function updateLabel() {
      const enabled = stagingCacheEnabled();
      toggle.textContent = `Cache ${enabled ? "ON" : "OFF"}`;
      toggle.style.background = enabled ? "#14532d" : "#3f3f46";
    }

    toggle.setAttribute("type", "button");
    toggle.style.position = "fixed";
    toggle.style.left = "16px";
    toggle.style.bottom = "calc(env(safe-area-inset-bottom, 0px) + 104px)";
    toggle.style.zIndex = "99999";
    toggle.style.border = "0";
    toggle.style.borderRadius = "999px";
    toggle.style.padding = "10px 14px";
    toggle.style.color = "#fff";
    toggle.style.font = "600 12px Poppins, sans-serif";
    toggle.style.boxShadow = "0 8px 24px rgba(0,0,0,.22)";
    toggle.style.cursor = "pointer";

    updateLabel();

    toggle.addEventListener("click", () => {
      const next = !stagingCacheEnabled();
      setStagingCacheEnabled(next);
      updateLabel();

      console.info(`[FTS Cache] staging cache ${next ? "enabled" : "disabled"}`);
    });

    document.body.appendChild(toggle);
  }

  async function fetchText(url, options = {}) {
    const enabled = cacheEnabled(options);
    const version = await ensureDataVersion(options);
    const key = cacheKey(url, version);

    if (enabled) {
      const cached = readCache(key);
      if (cached && typeof cached.text === "string") {
        log("cache hit", { url, version, key }, options);
        return { text: cached.text, fromCache: true, version, key, fetchedAt: cached.fetchedAt };
      }
    }

    const startedAt = performance.now();
    const response = await fetch(url, { cache: enabled ? "force-cache" : "no-store" });
    if (!response.ok) throw new Error(`Could not load CSV: ${url}`);
    const text = await response.text();
    const fetchedAt = new Date().toISOString();

    if (enabled) {
      writeCache(key, { text, fetchedAt, url, version });
    }

    log(enabled ? "cache miss, fetched fresh" : "cache bypass, fetched fresh", {
      url,
      version,
      key,
      ms: Math.round(performance.now() - startedAt)
    }, options);

    return { text, fromCache: false, version, key, fetchedAt };
  }

  async function fetchCSV(url, options = {}) {
    const startedAt = performance.now();
    const result = await fetchText(url, options);
    const rows = rowsToObjects(parseCSV(result.text));

    log("parsed csv", {
      url,
      rows: rows.length,
      fromCache: result.fromCache,
      version: result.version,
      ms: Math.round(performance.now() - startedAt)
    }, options);

    return { ...result, rows };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderStagingToggle, { once: true });
  } else {
    renderStagingToggle();
  }

  return {
    fetchText,
    fetchCSV,
    ensureDataVersion,
    cacheKey,
    cacheEnabled,
    clearCache,
    hasCacheBuster,
    isStaging,
    stagingCacheEnabled,
    setStagingCacheEnabled,
    getDataVersion: () => activeDataVersion
  };
})();
