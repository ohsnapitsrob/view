window.FTS = window.FTS || {};

FTS.DataStore = (function () {
  const store = new Map();
  const pending = new Map();
  const metadata = new Map();

  function runtimeConfig() {
    return window.RUNTIME_CONFIG || {};
  }

  function environment() {
    return runtimeConfig().environment || "live";
  }

  function isStaging() {
    return environment() === "staging";
  }

  function shouldDebug(options = {}) {
    return isStaging() || options.debug === true;
  }

  function log(event, details, options = {}) {
    if (!shouldDebug(options)) return;
    if (!window.console) return;
    console.info(`[FTS DataStore] ${event}`, details || "");
  }

  function has(key) {
    return store.has(key);
  }

  function get(key) {
    return store.get(key);
  }

  function set(key, value, info = {}) {
    store.set(key, value);
    metadata.set(key, {
      updatedAt: new Date().toISOString(),
      ...info
    });

    log("stored dataset", {
      key,
      rows: Array.isArray(value) ? value.length : undefined,
      info
    });

    return value;
  }

  function info(key) {
    return metadata.get(key) || null;
  }

  function clear(key) {
    if (typeof key === "string") {
      store.delete(key);
      metadata.delete(key);
      pending.delete(key);

      log("cleared dataset", { key });
      return;
    }

    store.clear();
    metadata.clear();
    pending.clear();

    log("cleared all datasets");
  }

  async function remember(key, loader, options = {}) {
    if (has(key) && options.force !== true) {
      log("memory hit", { key });
      return get(key);
    }

    if (pending.has(key) && options.force !== true) {
      log("awaiting existing loader", { key });
      return pending.get(key);
    }

    const startedAt = performance.now();

    const promise = (async () => {
      try {
        log("building dataset", { key });

        const value = await loader();

        set(key, value, {
          buildMs: Math.round(performance.now() - startedAt)
        });

        return value;
      } finally {
        pending.delete(key);
      }
    })();

    pending.set(key, promise);

    return promise;
  }

  async function csvRows(key, url, options = {}) {
    return remember(key, async () => {
      if (!window.FTS?.DataCache?.fetchCSV) {
        throw new Error("FTS.DataCache.fetchCSV is required before DataStore.csvRows can be used.");
      }

      const result = await window.FTS.DataCache.fetchCSV(url, options);
      return result.rows;
    }, options);
  }

  function snapshot() {
    return {
      keys: Array.from(store.keys()),
      metadata: Object.fromEntries(metadata.entries())
    };
  }

  window.FTS_DEBUG_DATASTORE = snapshot;

  return {
    has,
    get,
    set,
    info,
    clear,
    remember,
    csvRows,
    snapshot
  };
})();
