window.FTS = window.FTS || {};

FTS.DataStore = (function () {
  const store = new Map();
  const pending = new Map();
  const metadata = new Map();

  function runtimeConfig() {
    return window.RUNTIME_CONFIG || {};
  }

  function appConfig() {
    return window.APP_CONFIG || {};
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

  function norm(value) {
    return window.FTS?.Utils?.norm ? window.FTS.Utils.norm(value) : (value || "").toString().trim();
  }

  function key(value) {
    return window.FTS?.Utils?.normalizeComparable ? window.FTS.Utils.normalizeComparable(value) : norm(value).toLowerCase();
  }

  function coerceNumber(value) {
    if (window.FTS?.Utils?.coerceNumber) return window.FTS.Utils.coerceNumber(value);
    const number = Number((value ?? "").toString().trim());
    return Number.isFinite(number) ? number : null;
  }

  function normalizeType(value) {
    if (window.FTS?.Utils?.normalizeType) return window.FTS.Utils.normalizeType(value);
    return norm(value) || "Misc";
  }

  function parseVisitedDate(value) {
    if (window.FTS?.Utils?.parseVisitedDate) return window.FTS.Utils.parseVisitedDate(value);
    const timestamp = Date.parse(norm(value));
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  function visibilityMode() {
    return window.FTS?.Visibility?.mode?.() || "public-only";
  }

  function modeKey(baseKey) {
    return `${baseKey}:${visibilityMode()}`;
  }

  function getAccessValue(row) {
    return norm(
      row?.access ||
      row?.Access ||
      row?.ACCESS ||
      row?.["access "] ||
      row?.["Access "] ||
      row?.["No Access"] ||
      row?.noaccess ||
      row?.NOACCESS
    ).toUpperCase();
  }

  function has(keyName) {
    return store.has(keyName);
  }

  function get(keyName) {
    return store.get(keyName);
  }

  function set(keyName, value, info = {}) {
    store.set(keyName, value);
    metadata.set(keyName, {
      updatedAt: new Date().toISOString(),
      ...info
    });

    log("stored dataset", {
      key: keyName,
      rows: Array.isArray(value) ? value.length : undefined,
      info
    });

    return value;
  }

  function info(keyName) {
    return metadata.get(keyName) || null;
  }

  function clear(keyName) {
    if (typeof keyName === "string") {
      store.delete(keyName);
      metadata.delete(keyName);
      pending.delete(keyName);

      log("cleared dataset", { key: keyName });
      return;
    }

    store.clear();
    metadata.clear();
    pending.clear();

    log("cleared all datasets");
  }

  async function remember(keyName, loader, options = {}) {
    if (has(keyName) && options.force !== true) {
      log("memory hit", { key: keyName });
      return get(keyName);
    }

    if (pending.has(keyName) && options.force !== true) {
      log("awaiting existing loader", { key: keyName });
      return pending.get(keyName);
    }

    const startedAt = performance.now();

    const promise = (async () => {
      try {
        log("building dataset", { key: keyName, mode: visibilityMode() });

        const value = await loader();

        set(keyName, value, {
          buildMs: Math.round(performance.now() - startedAt),
          mode: visibilityMode()
        });

        return value;
      } finally {
        pending.delete(keyName);
      }
    })();

    pending.set(keyName, promise);

    return promise;
  }

  async function csvRows(keyName, url, options = {}) {
    return remember(keyName, async () => {
      if (window.FTS?.CSV?.fetchObjects) {
        return window.FTS.CSV.fetchObjects(url, options);
      }

      if (!window.FTS?.DataCache?.fetchCSV) {
        throw new Error("FTS.CSV.fetchObjects or FTS.DataCache.fetchCSV is required before DataStore.csvRows can be used.");
      }

      const result = await window.FTS.DataCache.fetchCSV(url, options);
      return result.rows;
    }, options);
  }

  function normalizeSceneRow(row, fallbackType) {
    const lat = coerceNumber(row.lat);
    const lng = coerceNumber(row.lng);
    const title = norm(row.title);

    if (!title || typeof lat !== "number" || typeof lng !== "number") return null;

    return {
      ...row,
      title,
      type: normalizeType(row.type || fallbackType),
      series: norm(row.series),
      place: norm(row.place),
      city: norm(row.city || row.place),
      country: norm(row.country),
      lat,
      lng,
      description: norm(row.description),
      thumbnail: norm(row.thumbnail),
      access: getAccessValue(row),
      railOrder: coerceNumber(row["set-rail-order"]),
      visitedTs: parseVisitedDate(row["date-formatted"] || row["raw-date"] || row.visited || row["visit-date"]),
      _raw: row
    };
  }

  async function getSceneRows(options = {}) {
    return remember("scene-rows", async () => {
      const config = appConfig();
      const sheets = config.SHEETS || {};
      const sources = [
        ["Film", sheets.movies, "scene-rows-films"],
        ["TV", sheets.tv, "scene-rows-tv"],
        ["Music Video", sheets.music_videos, "scene-rows-music-videos"],
        ["Video Game", sheets.games, "scene-rows-games"],
        ["Misc", sheets.misc, "scene-rows-misc"]
      ].filter(([, url]) => Boolean(url));

      const groups = await Promise.all(sources.map(async ([fallbackType, url, cacheKey]) => {
        const rows = await csvRows(cacheKey, url, options);
        return rows.map((row) => normalizeSceneRow(row, fallbackType)).filter(Boolean);
      }));

      return groups.flat();
    }, options);
  }

  async function getTitleMetadata(options = {}) {
    const config = appConfig();
    const url = config.TITLE_METADATA_CSV;

    if (!url) return [];

    return csvRows("title-metadata", url, options);
  }

  async function getTitleMetadataMap(options = {}) {
    return remember("title-metadata-map", async () => {
      const rows = await getTitleMetadata(options);

      const map = new Map();

      rows.forEach((row) => {
        const title = norm(row.title);
        if (!title) return;

        map.set(key(title), row);
      });

      return map;
    }, options);
  }

  async function getTitleTypes(options = {}) {
    return remember("title-types", async () => {
      const rows = await getTitleMetadata(options);

      return Array.from(new Set(
        rows
          .map((row) => norm(row.type))
          .filter(Boolean)
      )).sort((a, b) => a.localeCompare(b));
    }, options);
  }

  async function getExploreSearchIndexes(builder, options = {}) {
    return remember(modeKey("explore-search-indexes"), async () => {
      if (typeof builder !== "function") {
        throw new Error("FTS.DataStore.getExploreSearchIndexes requires a builder function.");
      }

      const result = await builder();

      return {
        fuseLocations: result.fuseLocations,
        fuseGroups: result.fuseGroups,
        groupsIndex: result.groupsIndex,
        searchLocations: result.searchLocations,
        groups: result.groups
      };
    }, options);
  }

  async function getHomepageDatasets(builder, options = {}) {
    return remember(modeKey("homepage-datasets"), async () => {
      if (typeof builder !== "function") {
        throw new Error("FTS.DataStore.getHomepageDatasets requires a builder function.");
      }

      const result = await builder();

      return {
        ...result,
        sceneRows: result.sceneRows || [],
        visibleRows: result.visibleRows || [],
        metadataRows: result.metadataRows || [],
        peopleRows: result.peopleRows || [],
        entries: result.entries || [],
        featuredTitles: result.featuredTitles || [],
        latestTitles: result.latestTitles || [],
        topTitles: result.topTitles || [],
        collectionRails: result.collectionRails || [],
        nationalTrustRails: result.nationalTrustRails || [],
        homepageCounts: result.homepageCounts || {},
        visibilityMode: visibilityMode()
      };
    }, options);
  }

  async function getVisibilityDatasets(sceneRowsOrBuilder, options = {}) {
    return remember(modeKey("visibility-datasets"), async () => {
      const sceneRows = typeof sceneRowsOrBuilder === "function"
        ? await sceneRowsOrBuilder()
        : (sceneRowsOrBuilder || []);

      const visibleScenes = window.FTS?.Visibility?.getVisibleScenes?.(sceneRows) || sceneRows;
      const visibleTitleKeys = new Set(visibleScenes.map((row) => key(row.title)).filter(Boolean));
      const hiddenScenes = sceneRows.filter((row) => !visibleScenes.includes(row));
      const inaccessibleScenes = sceneRows.filter((row) => getAccessValue(row) === "NOACCESS");
      const demolishedScenes = sceneRows.filter((row) => getAccessValue(row) === "DEMOLISHED");
      const inaccessibleTitleKeys = new Set(inaccessibleScenes.map((row) => key(row.title)).filter(Boolean));
      const demolishedTitleKeys = new Set(demolishedScenes.map((row) => key(row.title)).filter(Boolean));

      return {
        mode: visibilityMode(),
        sceneRows,
        visibleScenes,
        hiddenScenes,
        inaccessibleScenes,
        demolishedScenes,
        visibleTitleKeys,
        inaccessibleTitleKeys,
        demolishedTitleKeys,
        counts: {
          scenes: sceneRows.length,
          visibleScenes: visibleScenes.length,
          hiddenScenes: hiddenScenes.length,
          inaccessibleScenes: inaccessibleScenes.length,
          demolishedScenes: demolishedScenes.length,
          visibleTitles: visibleTitleKeys.size,
          inaccessibleTitles: inaccessibleTitleKeys.size,
          demolishedTitles: demolishedTitleKeys.size
        }
      };
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
    getSceneRows,
    getTitleMetadata,
    getTitleMetadataMap,
    getTitleTypes,
    getExploreSearchIndexes,
    getHomepageDatasets,
    getVisibilityDatasets,
    visibilityMode,
    modeKey,
    snapshot
  };
})();
