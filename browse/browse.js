(function () {
  const listEl = document.getElementById("browseList");
  const searchEl = document.getElementById("browseSearch");
  const countEl = document.getElementById("browseCount");

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
    if (x === "film" || x === "movie" || x === "movies") return "Movie";
    if (x === "tv" || x === "tv show" || x === "tv shows" || x === "series") return "TV Show";
    if (x === "music video" || x === "music videos" || x === "mv") return "Music Video";
    if (x === "game" || x === "games") return "Game";
    if (x === "misc" || x === "other") return "Misc";
    return norm(t);
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
    return `${n} location${n === 1 ? "" : "s"}`;
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

  function sortEntries(a, b) {
    const titleCmp = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    if (titleCmp !== 0) return titleCmp;
    return a.type.localeCompare(b.type, undefined, { sensitivity: "base" });
  }

  function render(entries) {
    listEl.innerHTML = "";

    countEl.textContent = `${entries.length.toLocaleString()} title${entries.length === 1 ? "" : "s"}`;

    if (!entries.length) {
      listEl.innerHTML = `<div class="browse-empty">No matches.</div>`;
      return;
    }

    entries.forEach((entry) => {
      const a = document.createElement("a");
      a.className = "browse-row";
      a.href = buildMapUrl(entry.title);

      a.innerHTML = `
        <div class="browse-title">${escapeHtml(entry.title)}</div>
        <div class="browse-type">${escapeHtml(entry.type)}</div>
        <div class="browse-scenes">${sceneLabel(entry.count)}</div>
      `;

      listEl.appendChild(a);
    });
  }

  async function loadAll() {
    const cfg = window.APP_CONFIG || {};
    const sheets = cfg.SHEETS || {};

    const sources = [
      ["Movie", sheets.movies],
      ["TV Show", sheets.tv],
      ["Music Video", sheets.music_videos],
      ["Game", sheets.games],
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

    // Group by TITLE + TYPE for browse rows
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

    return Array.from(grouped.values()).sort(sortEntries);
  }

  function initFilter(allEntries) {
    function applyFilter() {
      const q = norm(searchEl.value).toLowerCase();

      if (!q) {
        render(allEntries);
        return;
      }

      const filtered = allEntries.filter((entry) => {
        return (
          entry.title.toLowerCase().includes(q) ||
          entry.type.toLowerCase().includes(q)
        );
      });

      render(filtered);
    }

    searchEl.addEventListener("input", applyFilter);
    applyFilter();
  }

  async function init() {
    try {
      listEl.innerHTML = `<div class="browse-empty">Loading…</div>`;
      const entries = await loadAll();
      initFilter(entries);
    } catch (err) {
      console.error(err);
      listEl.innerHTML = `<div class="browse-empty">Could not load browse index.</div>`;
      countEl.textContent = "";
    }
  }

  init();
})();
