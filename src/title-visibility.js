window.FTS = window.FTS || {};

FTS.TitleVisibility = (function () {
  function norm(value) { return (value || "").toString().trim(); }
  function key(value) { return norm(value).toLowerCase(); }
  function coerceNumber(value) {
    const n = Number((value ?? "").toString().trim());
    return Number.isFinite(n) ? n : null;
  }
  function getValue(row, field) {
    const target = key(field);
    const matched = Object.keys(row).find((item) => key(item) === target);
    return matched ? row[matched] : "";
  }
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const character = text[i];
      const next = text[i + 1];
      if (character === '"' && inQuotes && next === '"') { current += '"'; i++; continue; }
      if (character === '"') { inQuotes = !inQuotes; continue; }
      if (character === "," && !inQuotes) { row.push(current); current = ""; continue; }
      if ((character === "\n" || character === "\r") && !inQuotes) {
        if (character === "\r" && next === "\n") i++;
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
      headers.forEach((header, index) => { obj[header] = row[index] || ""; });
      return obj;
    }).filter((row) => Object.values(row).some((value) => norm(value) !== ""));
  }
  async function fetchRows(cacheKey, url) {
    if (!url) return [];

    if (window.FTS?.DataStore?.csvRows) {
      return window.FTS.DataStore.csvRows(cacheKey, url);
    }

    if (window.FTS?.DataCache?.fetchCSV) {
      const result = await window.FTS.DataCache.fetchCSV(url);
      return result.rows;
    }

    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return [];
    return rowsToObjects(parseCSV(await response.text()));
  }
  function normalizeType(value) {
    const type = key(value);
    if (type === "film" || type === "movie" || type === "movies") return "Film";
    if (type === "tv" || type === "tv show" || type === "tv shows" || type === "series") return "TV";
    if (type === "music video" || type === "music videos" || type === "mv") return "Music Video";
    if (type === "game" || type === "games" || type === "video game" || type === "video games") return "Video Game";
    return norm(value) || "Misc";
  }
  async function loadSceneRows() {
    const cfg = window.APP_CONFIG || {};
    const sheets = cfg.SHEETS || {};
    const sources = [
      ["Film", sheets.movies, "scene-rows-films"],
      ["TV", sheets.tv, "scene-rows-tv"],
      ["Music Video", sheets.music_videos, "scene-rows-music-videos"],
      ["Video Game", sheets.games, "scene-rows-games"],
      ["Misc", sheets.misc, "scene-rows-misc"]
    ].filter(([, url]) => Boolean(url));
    const groups = await Promise.all(sources.map(async ([fallbackType, url, cacheKey]) => {
      const rows = await fetchRows(cacheKey, url);
      return rows.map((row) => {
        const title = norm(getValue(row, "title"));
        const lat = coerceNumber(getValue(row, "lat"));
        const lng = coerceNumber(getValue(row, "lng"));
        if (!title || typeof lat !== "number" || typeof lng !== "number") return null;
        return {
          title,
          type: normalizeType(getValue(row, "type") || fallbackType),
          access: norm(getValue(row, "Access") || getValue(row, "access") || getValue(row, "ACCESS"))
        };
      }).filter(Boolean);
    }));
    return groups.flat();
  }
  async function visibleTitleKeys() {
    if (window.FTS?.DataStore?.remember) {
      return window.FTS.DataStore.remember("visible-title-keys", async () => {
        const sceneRows = await loadSceneRows();
        const visibleRows = window.FTS?.Visibility?.getVisibleScenes?.(sceneRows) || sceneRows;
        return new Set(visibleRows.map((row) => key(row.title)).filter(Boolean));
      });
    }

    const sceneRows = await loadSceneRows();
    const visibleRows = window.FTS?.Visibility?.getVisibleScenes?.(sceneRows) || sceneRows;
    return new Set(visibleRows.map((row) => key(row.title)).filter(Boolean));
  }
  function filterTitles(rows, visibleKeys) {
    if (!visibleKeys || !visibleKeys.size) return [];
    return rows.filter((row) => visibleKeys.has(key(getValue(row, "title"))));
  }
  return { visibleTitleKeys, filterTitles };
})();