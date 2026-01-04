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
        if (row.length > 1) rows.push(row);
        row = [];
        continue;
      }

      cur += c;
    }

    row.push(cur);
    if (row.length > 1) rows.push(row);
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
    if (x === "tv" || x === "tv show" || x === "tv shows") return "TV";
    if (x === "music video" || x === "music videos" || x === "mv") return "Music Video";
    return "Misc";
  }

  function addToMapList(mapObj, key, val) {
    const k = norm(key);
    if (!k) return;
    if (!mapObj.has(k)) mapObj.set(k, []);
    mapObj.get(k).push(val);
  }

  // ----------------------
  // ICONS (50px target size)
  // ----------------------

  function getBadgeText(type) {
    if (type === "Film") return "F";
    if (type === "TV") return "TV";
    if (type === "Music Video") return "MV";
    return "?";
  }

  function badgeFontSize(badge) {
    return badge.length === 1 ? 4.6 : 3.6;
  }

  function svgPin(color, badge) {
    const fs = badgeFontSize(badge);

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg"
           width="50" height="50"
           viewBox="0 0 24 24">
        <path fill="${color}"
          d="M12 2c-3.314 0-6 2.686-6 6
             c0 4.5 6 14 6 14s6-9.5 6-14
             c0-3.314-2.686-6-6-6z"/>
        <circle cx="12" cy="8" r="4.2" fill="white"/>
        <text x="12" y="8.4"
              text-anchor="middle"
              dominant-baseline="middle"
              font-size="${fs}"
              font-weight="800"
              font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
              fill="#111827"
              stroke="white"
              stroke-width="0.7"
              paint-order="stroke">
          ${badge}
        </text>
      </svg>
    `;

    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
  }

  function iconForType(type) {
    const t = normalizeType(type);
    const colors = {
      Film: "#2563eb",
      TV: "#16a34a",
      "Music Video": "#db2777",
      Misc: "#6b7280"
    };

    const badge = getBadgeText(t);
    const color = colors[t] || colors.Misc;

    return L.icon({
      iconUrl: svgPin(color, badge),

      // 👇 THIS is the key part
      iconSize: [50, 50],
      iconAnchor: [25, 50],
      popupAnchor: [0, -40]
    });
  }

  async function fetchSheetCSV(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("Failed to fetch CSV");
    return r.text();
  }

  function coerceNumber(x) {
    const n = Number((x ?? "").toString().trim());
    return Number.isFinite(n) ? n : null;
  }

  function postProcessRow(row, fallbackType) {
    const loc = {
      title: norm(row.title),
      type: normalizeType(row.type || fallbackType),
      place: norm(row.place),
      country: norm(row.country),
      lat: coerceNumber(row.lat),
      lng: coerceNumber(row.lng),
      description: norm(row.description),
      collections: splitPipe(row.collections),
      keywords: splitPipe(row.keywords),
      aliases: splitPipe(row.aliases),
      images: splitPipe(row.images)
    };

    if (!loc.title || !loc.place) return null;
    if (typeof loc.lat !== "number" || typeof loc.lng !== "number") return null;
    return loc;
  }

  async function init() {
    const cfg = window.APP_CONFIG || {};
    const sheets = cfg.SHEETS || {};

    const sources = [
      ["Film", sheets.movies],
      ["TV", sheets.tv],
      ["Music Video", sheets.music_videos],
      ["Misc", sheets.misc]
    ].filter(([, url]) => !!url);

    try {
      let locs = [];

      const texts = await Promise.all(
        sources.map(([, url]) => fetchSheetCSV(url))
      );

      for (let i = 0; i < sources.length; i++) {
        const [fallbackType] = sources[i];
        const rows = rowsToObjects(parseCSV(texts[i]));
        rows.forEach(r => {
          const loc = postProcessRow(r, fallbackType);
          if (loc) locs.push(loc);
        });
      }

      ALL = locs;
      allMarkers = [];
      groupsIndex.clear();

      const markersByTitle = new Map();
      const markersByCollection = new Map();
      const markersByType = new Map();

      ALL.forEach(loc => {
        const mk = L.marker([loc.lat, loc.lng], {
          icon: iconForType(loc.type)
        });
        mk.__loc = loc;
        mk.on("click", () => App.Modal.open(loc));
        loc.__marker = mk;

        allMarkers.push(mk);
        addToMapList(markersByTitle, loc.title, mk);
        loc.collections.forEach(c => addToMapList(markersByCollection, c, mk));
        addToMapList(markersByType, loc.type, mk);
      });

      App.Map.rebuildCluster(allMarkers);
      App.State.clearFilter();

      const fuseLocations = new Fuse(ALL, {
        threshold: 0.35,
        keys: [
          { name: "title", weight: 3 },
          { name: "collections", weight: 2.3 },
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
      alert("Failed to load data");
    }
  }

  return { init };
})();
