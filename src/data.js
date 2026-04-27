window.App = window.App || {};

App.Data = (function () {
  let ALL = [];
  let allMarkers = [];
  const groupsIndex = new Map();

  function norm(s) { return (s || "").toString().trim(); }

  function splitPipe(s) {
    const t = norm(s);
    if (!t) return [];
    return t.split("|").map(x => norm(x)).filter(Boolean);
  }

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const next = text[i + 1];

      if (c === '"' && inQuotes && next === '"') {
        cur += '"';
        i++;
        continue;
      }

      if (c === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (c === "," && !inQuotes) {
        row.push(cur);
        cur = "";
        continue;
      }

      if ((c === "\n" || c === "\r") && !inQuotes) {
        if (c === "\r" && next === "\n") i++;
        row.push(cur);
        cur = "";
        if (row.length > 1 || (row.length === 1 && row[0] !== "")) rows.push(row);
        row = [];
        continue;
      }

      cur += c;
    }

    row.push(cur);
    if (row.length > 1 || (row.length === 1 && row[0] !== "")) rows.push(row);
    return rows;
  }

  function rowsToObjects(rows) {
    if (!rows.length) return [];
    const header = rows[0].map(h => norm(h));
    const out = [];

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.every(cell => norm(cell) === "")) continue;

      const obj = {};
      for (let j = 0; j < header.length; j++) obj[header[j]] = (r[j] ?? "");
      out.push(obj);
    }
    return out;
  }

  function normalizeType(t) {
    const x = norm(t).toLowerCase();
    if (!x) return "Misc";
    if (x === "film" || x === "movie" || x === "movies") return "Film";
    if (x === "tv" || x === "tv show" || x === "tv shows" || x === "series") return "TV";
    if (x === "music video" || x === "music videos" || x === "mv") return "Music Video";
    if (x === "game" || x === "games" || x === "video game" || x === "video games") return "Video Game";
    if (x === "misc" || x === "other") return "Misc";
    return norm(t);
  }

  function addToMapList(mapObj, key, val) {
    const k = norm(key);
    if (!k) return;
    if (!mapObj.has(k)) mapObj.set(k, []);
    mapObj.get(k).push(val);
  }

  async function fetchSheetCSV(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`Failed to fetch CSV: ${url}`);
    return r.text();
  }

  function coerceNumber(x) {
    const n = Number((x ?? "").toString().trim());
    return Number.isFinite(n) ? n : null;
  }

  function postProcessRow(row, fallbackType) {
    const loc = {
      id: norm(row.id),
      title: norm(row.title),
      type: normalizeType(row.type || fallbackType),
      series: norm(row.series),
      place: norm(row.place),
      country: norm(row.country),
      lat: coerceNumber(row.lat),
      lng: coerceNumber(row.lng),
      description: norm(row.description),
      collections: splitPipe(row.collections),
      keywords: splitPipe(row.keywords),
      aliases: splitPipe(row.aliases),
      images: splitPipe(row.images),

      exportFileName: norm(row["export-file-name"]),
      imdb: norm(row["imdb"]),
      rawDate: norm(row["raw-date"]),
      dateFormatted: norm(row["date-formatted"]),
      monthShort: norm(row["month-short"])
    };

    loc._raw = row;

    if (typeof loc.lat !== "number" || typeof loc.lng !== "number") return null;
    if (!loc.id || !loc.title || !loc.place) return null;

    if (!loc.series && loc.type === "TV") loc.series = loc.title;
    return loc;
  }

  async function init() {
    const cfg = window.APP_CONFIG || {};
    const sheets = cfg.SHEETS || {};

    const hasSheets =
      sheets.movies || sheets.tv || sheets.music_videos || sheets.games || sheets.misc;

    try {
      let locs = [];

      if (hasSheets) {
        const sources = [
          ["Film", sheets.movies],
          ["TV", sheets.tv],
          ["Music Video", sheets.music_videos],
          ["Video Game", sheets.games],
          ["Misc", sheets.misc]
        ].filter(([, url]) => !!url);

        const texts = await Promise.all(sources.map(([, url]) => fetchSheetCSV(url)));

        for (let i = 0; i < sources.length; i++) {
          const [fallbackType] = sources[i];
          const rows = rowsToObjects(parseCSV(texts[i]));
          rows.forEach((r) => {
            const loc = postProcessRow(r, fallbackType);
            if (loc) locs.push(loc);
          });
        }
      } else {
        const r = await fetch("./data/locations.json");
        const data = await r.json();
        locs = data.map((r) => postProcessRow(r, r.type)).filter(Boolean);
      }

      ALL = locs;

      App.Router.setLocationsIndex(ALL);

      const markersByTitle = new Map();
      const markersBySeries = new Map();
      const markersByCollection = new Map();
      const markersByType = new Map();

      allMarkers = [];
      groupsIndex.clear();

      ALL.forEach((loc) => {
        const marker = { __loc: loc };
        loc.__marker = marker;

        allMarkers.push(marker);

        addToMapList(markersByTitle, loc.title, marker);
        addToMapList(markersBySeries, loc.series, marker);
        (loc.collections || []).forEach((c) => addToMapList(markersByCollection, c, marker));
        addToMapList(markersByType, loc.type, marker);
      });

      App.Map.rebuildCluster(allMarkers);
      App.State.clearFilter();

      const fuseLocations = new Fuse(ALL, {
        threshold: 0.35,
        keys: [
          { name: "title", weight: 3 },
          { name: "collections", weight: 2.3 },
          { name: "series", weight: 1.8 },
          { name: "aliases", weight: 1.8 },
          { name: "place", weight: 1.7 },
          { name: "country", weight: 1.2 },
          { name: "type", weight: 1.1 },
          { name: "keywords", weight: 1.4 },
          { name: "description", weight: 0.8 }
        ]
      });

      const groups = [];

      markersByTitle.forEach((arr, title) => {
        groups.push({ kind: "Title", label: title, count: arr.length });
        groupsIndex.set(`Title::${title}`, arr);
      });

      markersBySeries.forEach((arr, series) => {
        groups.push({ kind: "Series", label: series, count: arr.length });
        groupsIndex.set(`Series::${series}`, arr);
      });

      markersByCollection.forEach((arr, col) => {
        groups.push({ kind: "Collection", label: col, count: arr.length });
        groupsIndex.set(`Collection::${col}`, arr);
      });

      markersByType.forEach((arr, type) => {
        groups.push({ kind: "Type", label: type, count: arr.length });
        groupsIndex.set(`Type::${type}`, arr);
      });

      const fuseGroups = new Fuse(groups, {
        threshold: 0.35,
        keys: ["label", "kind"]
      });

      App.Search.setData({
        fuseLoc: fuseLocations,
        fuseGrp: fuseGroups,
        groupsIdx: groupsIndex,
        allMk: allMarkers
      });
    } catch (err) {
      console.error(err);
      alert("Failed to load data. Check console for details.");
    }
  }

  return { init };
})();
