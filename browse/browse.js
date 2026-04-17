(function () {
  const listEl = document.getElementById("browseList");
  const searchEl = document.getElementById("browseSearch");
  const sortEl = document.getElementById("browseSort");
  const countEl = document.getElementById("browseCount");

  let ALL_ENTRIES = [];

  function norm(s) {
    return (s || "").toString().trim();
  }

  function splitPipe(s) {
    const t = norm(s);
    if (!t) return [];
    return t.split("|").map(x => norm(x)).filter(Boolean);
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

  function typeColor(type) {
    const colors = {
      Film: "#2563eb",
      TV: "#16a34a",
      "Music Video": "#db2777",
      Misc: "#6b7280",
      "Video Game": "#FFA500"
    };
    return colors[type] || colors.Misc;
  }

  function displayType(type) {
    if (type === "Film") return "Movie";
    if (type === "TV") return "TV Show";
    return type;
  }

  function coerceNumber(x) {
    const n = Number((x ?? "").toString().trim());
    return Number.isFinite(n) ? n : null;
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
      for (let j = 0; j < header.length; j++) {
        obj[header[j]] = (r[j] ?? "");
      }
      out.push(obj);
    }

    return out;
  }

  async function fetchSheetCSV(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch CSV: ${url}`);
    return res.text();
  }

  function escapeHtml(s) {
    return (s || "").toString()
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function sceneLabel(n) {
    return `${n} scene${n === 1 ? "" : "s"}`;
  }

  function summaryLabel(titleCount, sceneCount) {
    return `${titleCount.toLocaleString()} title${titleCount === 1 ? "" : "s"}, ${sceneCount.toLocaleString()} scene${sceneCount === 1 ? "" : "s"}`;
  }

  function buildMapUrl(title) {
    const params = new URLSearchParams();
    params.set("fk", "Title");
    params.set("fl", title);
    return `../?${params.toString()}`;
  }

  function postProcessRow(row, fallbackType) {
    const title = norm(row.title);
    const type = normalizeType(row.type || fallbackType);
    const lat = coerceNumber(row.lat);
    const lng = coerceNumber(row.lng);

    if (!title || typeof lat !== "number" || typeof lng !== "number") return null;

    return {
      id: norm(row.id),
      title,
      type,
      place: norm(row.place),
      country: norm(row.country),
      collections: splitPipe(row.collections)
    };
  }

  function compareTitleAsc(a, b) {
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  }

  function compareTypeAsc(a, b) {
    return a.type.localeCompare(b.type, undefined, { sensitivity: "base" });
  }

  function sortMost(a, b) {
    if (b.count !== a.count) return b.count - a.count;
    const titleCmp = compareTitleAsc(a, b);
    if (titleCmp !== 0) return titleCmp;
    return compareTypeAsc(a, b);
  }

  function sortAZ(a, b) {
    const titleCmp = compareTitleAsc(a, b);
    if (titleCmp !== 0) return titleCmp;
    return compareTypeAsc(a, b);
  }

  function sortZA(a, b) {
    const titleCmp = compareTitleAsc(b, a);
    if (titleCmp !== 0) return titleCmp;
    return compareTypeAsc(a, b);
  }

  function getSorted(entries, sortMode) {
    const copy = [...entries];

    if (sortMode === "az") return copy.sort(sortAZ);
    if (sortMode === "za") return copy.sort(sortZA);
    return copy.sort(sortMost);
  }

  function render(entries) {
    listEl.innerHTML = "";

    const titleCount = entries.length;
    const sceneCount = entries.reduce((sum, entry) => sum + entry.count, 0);
    countEl.textContent = summaryLabel(titleCount, sceneCount);

    if (!entries.length) {
      listEl.innerHTML = `<div class="browse-empty">No matches.</div>`;
      return;
    }

    entries.forEach((entry) => {
      const a = document.createElement("a");
      a.className = "browse-row";
      a.href = buildMapUrl(entry.title);

      a.innerHTML = `
        <div class="browse-marker" style="background:${escapeHtml(typeColor(entry.type))};"></div>
        <div class="browse-main">
          <div class="browse-title">${escapeHtml(entry.title)}</div>
        </div>
        <div class="browse-type">${escapeHtml(displayType(entry.type))}</div>
        <div class="browse-scenes">${sceneLabel(entry.count)}</div>
      `;

      listEl.appendChild(a);
    });
  }

  function applyControls() {
    const q = norm(searchEl.value).toLowerCase();
    const sortMode = sortEl.value || "most";

    let filtered = ALL_ENTRIES;

    if (q) {
      filtered = filtered.filter((entry) => {
        return (
          entry.title.toLowerCase().includes(q) ||
          displayType(entry.type).toLowerCase().includes(q)
        );
      });
    }

    render(getSorted(filtered, sortMode));
  }

  async function loadAll() {
    const cfg = window.APP_CONFIG || {};
    const sheets = cfg.SHEETS || {};

    const sources = [
      ["Film", sheets.movies],
      ["TV", sheets.tv],
      ["Music Video", sheets.music_videos],
      ["Video Game", sheets.games],
      ["Misc", sheets.misc]
    ].filter(([, url]) => !!url);

    if (!sources.length) {
      throw new Error("No sheet URLs configured.");
    }

    const texts = await Promise.all(
      sources.map(([, url]) => fetchSheetCSV(url))
    );

    const rows = [];
    for (let i = 0; i < sources.length; i++) {
      const [fallbackType] = sources[i];
      const parsed = rowsToObjects(parseCSV(texts[i]));
      parsed.forEach((r) => {
        const loc = postProcessRow(r, fallbackType);
        if (loc) rows.push(loc);
      });
    }

    const grouped = new Map();

    rows.forEach((loc) => {
      const key = `${loc.title}|||${loc.type}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          title: loc.title,
          type: loc.type,
          count: 0
        });
      }
      grouped.get(key).count += 1;
    });

    return Array.from(grouped.values());
  }

  async function init() {
    try {
      listEl.innerHTML = `<div class="browse-empty">Loading…</div>`;
      ALL_ENTRIES = await loadAll();

      searchEl.addEventListener("input", applyControls);
      sortEl.addEventListener("change", applyControls);

      applyControls();
    } catch (err) {
      console.error(err);
      listEl.innerHTML = `<div class="browse-empty">Could not load browse index.</div>`;
      countEl.textContent = "";
    }
  }

  init();
})();
