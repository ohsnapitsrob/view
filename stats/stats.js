(function () {
  const loadingEl = document.getElementById("statsLoading");
  const rootEl = document.getElementById("statsRoot");

  const PROJECT_START = new Date(2025, 6, 1); // July 1 2025

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

  function displayType(type, count = 2) {
    if (type === "Film") return count === 1 ? "movie" : "movies";
    if (type === "TV") return count === 1 ? "TV title" : "TV titles";
    if (type === "Music Video") return count === 1 ? "music video" : "music videos";
    if (type === "Video Game") return count === 1 ? "video game" : "video games";
    return count === 1 ? "misc title" : "misc titles";
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

  function parseVisitedDate(value) {
    const raw = norm(value);
    if (!raw) return null;

    const cleaned = raw.replace(/(\d{1,2})(st|nd|rd|th)/gi, "$1");
    const ts = Date.parse(cleaned);
    if (!Number.isFinite(ts)) return null;

    const d = new Date(ts);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  function formatNumber(n) {
    return Number(n || 0).toLocaleString();
  }

  function plural(n, one, many) {
    return `${formatNumber(n)} ${n === 1 ? one : many}`;
  }

  function formatDate(d) {
    if (!(d instanceof Date)) return "—";
    return d.toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  function formatMonth(d) {
    if (!(d instanceof Date)) return "—";
    return d.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric"
    });
  }

  function formatMonthKey(key) {
    const [year, month] = key.split("-");
    return formatMonth(new Date(Number(year), Number(month) - 1, 1));
  }

  function monthKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  function yearKey(d) {
    return String(d.getFullYear());
  }

  function dayKey(d) {
    return d.toISOString().slice(0, 10);
  }

  function pctChange(current, previous) {
    if (!previous && !current) return 0;
    if (!previous) return 100;
    return ((current - previous) / previous) * 100;
  }

  function trendMeta(current, previous) {
    const change = pctChange(current, previous);
    if (!Number.isFinite(change)) return { text: "new", cls: "flat" };
    if (Math.abs(change) < 0.5) return { text: "flat", cls: "flat" };
    if (change > 0) return { text: `up ${change.toFixed(1)}%`, cls: "up" };
    return { text: `down ${Math.abs(change).toFixed(1)}%`, cls: "down" };
  }

  function median(nums) {
    if (!nums.length) return 0;
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2) return sorted[mid];
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function titleTypeKey(title, type) {
    return `${title}|||${type}`;
  }

  function escapeHtml(s) {
    return (s || "").toString()
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function panel({ kicker, value, sub = "", cls = "", delta = null, badges = [] }) {
    return `
      <div class="panel ${cls}">
        <div class="panel-kicker">${escapeHtml(kicker)}</div>
        <div class="panel-value">${value}</div>
        ${delta ? `<div class="delta ${delta.cls}">${escapeHtml(delta.text)}</div>` : ""}
        ${sub ? `<div class="panel-sub">${sub}</div>` : ""}
        ${badges.length ? `<div class="badge-row">${badges.map(x => `<div class="badge">${escapeHtml(x)}</div>`).join("")}</div>` : ""}
      </div>
    `;
  }

  function listPanel({ title, rows, cls = "" }) {
    return `
      <div class="panel ${cls}">
        <h3 class="section-title">${escapeHtml(title)}</h3>
        <div class="stat-list">
          ${rows.map((row) => `
            <div class="stat-list-row">
              <div class="stat-list-label">${escapeHtml(row.label)}</div>
              <div class="stat-list-value">${row.value}</div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function meterPanel({ title, subtitle = "", items, cls = "" }) {
    const max = Math.max(...items.map(x => x.value), 1);
    return `
      <div class="panel ${cls}">
        <h3 class="section-title">${escapeHtml(title)}</h3>
        ${subtitle ? `<div class="section-copy">${escapeHtml(subtitle)}</div>` : ""}
        <div class="meter-list">
          ${items.map((item) => `
            <div class="meter-row">
              <div class="meter-head">
                <div>${escapeHtml(item.label)}</div>
                <div><strong>${escapeHtml(item.display || formatNumber(item.value))}</strong></div>
              </div>
              <div class="meter-track">
                <div class="meter-fill" style="width:${Math.max(6, (item.value / max) * 100)}%"></div>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function barChartPanel({ title, subtitle = "", data, cls = "" }) {
    const max = Math.max(...data.map(x => x.value), 1);
    return `
      <div class="panel ${cls}">
        <h3 class="section-title">${escapeHtml(title)}</h3>
        ${subtitle ? `<div class="section-copy">${escapeHtml(subtitle)}</div>` : ""}
        <div class="spark-wrap">
          <div class="spark-chart">
            ${data.map((item) => `
              <div class="spark-col">
                <div class="spark-bar" style="height:${Math.max(8, (item.value / max) * 150)}px"></div>
                <div class="spark-label">${escapeHtml(item.label)}</div>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    `;
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

    if (!sources.length) throw new Error("No sheet URLs configured.");

    const texts = await Promise.all(
      sources.map(([, url]) => fetchSheetCSV(url))
    );

    const rows = [];
    for (let i = 0; i < sources.length; i++) {
      const [fallbackType] = sources[i];
      const parsed = rowsToObjects(parseCSV(texts[i]));
      parsed.forEach((r) => {
        const title = norm(r.title);
        const type = normalizeType(r.type || fallbackType);
        const lat = coerceNumber(r.lat);
        const lng = coerceNumber(r.lng);
        if (!title || typeof lat !== "number" || typeof lng !== "number") return;

        rows.push({
          id: norm(r.id),
          title,
          type,
          place: norm(r.place),
          country: norm(r.country),
          collections: splitPipe(r.collections),
          visited: parseVisitedDate(r["date-formatted"] || r["raw-date"] || r["visited"] || r["visit-date"])
        });
      });
    }

    return rows;
  }

  function buildStreak(monthKeys) {
    if (!monthKeys.length) return { current: 0, best: 0 };

    const ordered = [...monthKeys].sort();
    const monthNums = ordered.map((key) => {
      const [y, m] = key.split("-").map(Number);
      return y * 12 + (m - 1);
    });

    let best = 1;
    let current = 1;

    for (let i = 1; i < monthNums.length; i++) {
      if (monthNums[i] === monthNums[i - 1] + 1) {
        current += 1;
        best = Math.max(best, current);
      } else {
        current = 1;
      }
    }

    const now = new Date();
    const thisMonthNum = now.getFullYear() * 12 + now.getMonth();

    let currentLive = 0;
    for (let i = monthNums.length - 1; i >= 0; i--) {
      const expected = thisMonthNum - currentLive;
      if (monthNums[i] === expected) currentLive += 1;
      else if (monthNums[i] < expected) break;
    }

    return { current: currentLive, best };
  }

  function buildStats(rows) {
    const now = new Date();
    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth();

    const prevMonthDate = new Date(nowYear, nowMonth - 1, 1);
    const prevYear = nowYear - 1;

    const projectRows = rows.filter((row) => row.visited instanceof Date && row.visited >= PROJECT_START);

    const countriesAll = new Set();
    const countriesThisMonth = new Set();
    const countriesPrevMonth = new Set();
    const countriesThisYear = new Set();
    const countriesPrevYear = new Set();

    const titleTypeMap = new Map();
    const titleMap = new Map();
    const typeTitleSets = new Map();
    const collectionCounts = new Map();

    const scenesByDay = new Map();
    const scenesByMonth = new Map();
    const scenesByYear = new Map();
    const scenesByCountry = new Map();
    const scenesByWeekday = new Map();
    const scenesByType = new Map();
    const scenesByTitleType = new Map();

    let scenesThisMonth = 0;
    let scenesPrevMonth = 0;
    let scenesThisYear = 0;
    let scenesPrevYear = 0;

    let firstVisit = null;
    let latestVisit = null;

    projectRows.forEach((row) => {
      if (row.country) {
        countriesAll.add(row.country);
        scenesByCountry.set(row.country, (scenesByCountry.get(row.country) || 0) + 1);
      }

      scenesByType.set(row.type, (scenesByType.get(row.type) || 0) + 1);

      const sceneKey = titleTypeKey(row.title, row.type);
      scenesByTitleType.set(sceneKey, (scenesByTitleType.get(sceneKey) || 0) + 1);

      const ttKey = titleTypeKey(row.title, row.type);
      titleTypeMap.set(ttKey, { title: row.title, type: row.type });

      if (!titleMap.has(row.title)) {
        titleMap.set(row.title, {
          title: row.title,
          count: 0,
          types: new Set()
        });
      }
      const titleEntry = titleMap.get(row.title);
      titleEntry.count += 1;
      titleEntry.types.add(row.type);

      if (!typeTitleSets.has(row.type)) typeTitleSets.set(row.type, new Set());
      typeTitleSets.get(row.type).add(row.title);

      row.collections.forEach((c) => {
        collectionCounts.set(c, (collectionCounts.get(c) || 0) + 1);
      });

      const d = row.visited;

      if (!firstVisit || d < firstVisit) firstVisit = d;
      if (!latestVisit || d > latestVisit) latestVisit = d;

      const dKey = dayKey(d);
      const mKey = monthKey(d);
      const yKey = yearKey(d);
      const weekday = d.toLocaleDateString(undefined, { weekday: "long" });

      scenesByDay.set(dKey, (scenesByDay.get(dKey) || 0) + 1);
      scenesByMonth.set(mKey, (scenesByMonth.get(mKey) || 0) + 1);
      scenesByYear.set(yKey, (scenesByYear.get(yKey) || 0) + 1);
      scenesByWeekday.set(weekday, (scenesByWeekday.get(weekday) || 0) + 1);

      if (d.getFullYear() === nowYear) {
        scenesThisYear += 1;
        if (row.country) countriesThisYear.add(row.country);
      }

      if (d.getFullYear() === prevYear) {
        scenesPrevYear += 1;
        if (row.country) countriesPrevYear.add(row.country);
      }

      if (d.getFullYear() === nowYear && d.getMonth() === nowMonth) {
        scenesThisMonth += 1;
        if (row.country) countriesThisMonth.add(row.country);
      }

      if (
        d.getFullYear() === prevMonthDate.getFullYear() &&
        d.getMonth() === prevMonthDate.getMonth()
      ) {
        scenesPrevMonth += 1;
        if (row.country) countriesPrevMonth.add(row.country);
      }
    });

    const titleEntries = Array.from(titleMap.values());
    const titleSceneCounts = titleEntries.map(x => x.count);

    const mostScenesEntry = [...titleEntries]
      .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))[0] || null;

    const leastScenesEntry = [...titleEntries]
      .sort((a, b) => a.count - b.count || a.title.localeCompare(b.title))[0] || null;

    const repeatedTitles = titleEntries.filter(x => x.count > 1).length;
    const singleSceneTitles = titleEntries.filter(x => x.count === 1).length;

    const totalTitles = titleEntries.length;
    const totalScenes = projectRows.length;
    const totalCountries = countriesAll.size;

    const mostScenesDay = [...scenesByDay.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;

    const mostScenesMonth = [...scenesByMonth.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;

    const avgScenesPerMonth = scenesByMonth.size ? totalScenes / scenesByMonth.size : 0;
    const avgScenesPerYear = scenesByYear.size ? totalScenes / scenesByYear.size : 0;
    const avgScenesPerTitle = totalTitles ? totalScenes / totalTitles : 0;
    const medianScenesPerTitle = median(titleSceneCounts);

    const sortedVisitDates = projectRows
      .map(x => x.visited)
      .filter(Boolean)
      .sort((a, b) => a - b);

    let longestGapDays = 0;
    let longestGapFrom = null;
    let longestGapTo = null;
    for (let i = 1; i < sortedVisitDates.length; i++) {
      const prev = sortedVisitDates[i - 1];
      const curr = sortedVisitDates[i];
      const gapDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
      if (gapDays > longestGapDays) {
        longestGapDays = gapDays;
        longestGapFrom = prev;
        longestGapTo = curr;
      }
    }

    const topCountries = [...scenesByCountry.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map(([label, value]) => ({ label, value }));

    const topCollections = [...collectionCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map(([label, value]) => ({ label, value }));

    const weekdayChamp = [...scenesByWeekday.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;

    const recentMonths = [...scenesByMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-8)
      .map(([key, value]) => ({ label: formatMonthKey(key), value, short: key }));

    const yearlyBreakdown = [...scenesByYear.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, value]) => ({ label, value }));

    const bestYear = [...scenesByYear.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;

    const typeLeader = [...scenesByType.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;

    const multiCountryTitles = new Map();
    projectRows.forEach((row) => {
      if (!multiCountryTitles.has(row.title)) multiCountryTitles.set(row.title, new Set());
      if (row.country) multiCountryTitles.get(row.title).add(row.country);
    });
    const multiCountryCount = [...multiCountryTitles.values()].filter(set => set.size > 1).length;

    const titleRevisitLeader = [...scenesByTitleType.entries()]
      .map(([key, value]) => {
        const [title, type] = key.split("|||");
        return { title, type, value };
      })
      .sort((a, b) => b.value - a.value || a.title.localeCompare(b.title))[0] || null;

    const streaks = buildStreak([...scenesByMonth.keys()]);

    return {
      totalScenes,
      totalTitles,
      totalCountries,
      scenesThisMonth,
      scenesPrevMonth,
      scenesThisYear,
      scenesPrevYear,
      countriesThisMonth: countriesThisMonth.size,
      countriesPrevMonth: countriesPrevMonth.size,
      countriesThisYear: countriesThisYear.size,
      countriesPrevYear: countriesPrevYear.size,

      movieTitleCount: (typeTitleSets.get("Film") || new Set()).size,
      tvTitleCount: (typeTitleSets.get("TV") || new Set()).size,
      musicVideoTitleCount: (typeTitleSets.get("Music Video") || new Set()).size,
      videoGameTitleCount: (typeTitleSets.get("Video Game") || new Set()).size,
      miscTitleCount: (typeTitleSets.get("Misc") || new Set()).size,

      movieScenes: scenesByType.get("Film") || 0,
      tvScenes: scenesByType.get("TV") || 0,
      musicVideoScenes: scenesByType.get("Music Video") || 0,
      videoGameScenes: scenesByType.get("Video Game") || 0,
      miscScenes: scenesByType.get("Misc") || 0,

      mostScenesEntry,
      leastScenesEntry,
      mostScenesDay,
      mostScenesMonth,
      avgScenesPerMonth,
      avgScenesPerYear,
      avgScenesPerTitle,
      medianScenesPerTitle,
      repeatedTitles,
      singleSceneTitles,
      firstVisit,
      latestVisit,
      longestGapDays,
      longestGapFrom,
      longestGapTo,
      weekdayChamp,
      topCountries,
      topCollections,
      recentMonths,
      yearlyBreakdown,
      bestYear,
      typeLeader,
      multiCountryCount,
      titleRevisitLeader,
      streaks
    };
  }

  function render(stats) {
    const monthDelta = trendMeta(stats.scenesThisMonth, stats.scenesPrevMonth);
    const yearDelta = trendMeta(stats.scenesThisYear, stats.scenesPrevYear);
    const countryMonthDelta = trendMeta(stats.countriesThisMonth, stats.countriesPrevMonth);
    const countryYearDelta = trendMeta(stats.countriesThisYear, stats.countriesPrevYear);

    const hero = `
      <div class="hero-band">
        <div class="hero-card">
          <div class="hero-kicker">Project total since July 2025</div>
          <div class="hero-value">${formatNumber(stats.totalScenes)}</div>
          <div class="hero-sub">Scenes visited across ${plural(stats.totalTitles, "title", "titles")} and ${plural(stats.totalCountries, "country", "countries")}. Legacy photo archaeology doesn’t count toward the main flex.</div>
          <div class="hero-metrics">
            <div class="hero-pill">${plural(stats.movieTitleCount, "movie", "movies")}</div>
            <div class="hero-pill">${plural(stats.tvTitleCount, "TV title", "TV titles")}</div>
            <div class="hero-pill">${plural(stats.musicVideoTitleCount, "music video", "music videos")}</div>
            <div class="hero-pill">${plural(stats.videoGameTitleCount, "video game", "video games")}</div>
          </div>
        </div>

        <div class="spotlight-stack">
          <div class="spotlight-card">
            <div class="spotlight-label">Scenes visited this month</div>
            <div class="spotlight-main">
              <div class="spotlight-value">${formatNumber(stats.scenesThisMonth)}</div>
              <div class="delta ${monthDelta.cls}">${monthDelta.text}</div>
            </div>
          </div>

          <div class="spotlight-card">
            <div class="spotlight-label">Scenes visited this year</div>
            <div class="spotlight-main">
              <div class="spotlight-value">${formatNumber(stats.scenesThisYear)}</div>
              <div class="delta ${yearDelta.cls}">${yearDelta.text}</div>
            </div>
          </div>
        </div>
      </div>
    `;

    const topStats = `
      <div class="stats-grid">
        ${panel({
          kicker: "Countries visited this month",
          value: formatNumber(stats.countriesThisMonth),
          delta: countryMonthDelta,
          cls: "gradient blue"
        })}

        ${panel({
          kicker: "Countries visited this year",
          value: formatNumber(stats.countriesThisYear),
          delta: countryYearDelta,
          cls: "gradient purple"
        })}

        ${panel({
          kicker: "Current monthly streak",
          value: plural(stats.streaks.current, "month", "months"),
          sub: "Consecutive active months up to now"
        })}

        ${panel({
          kicker: "Best monthly streak",
          value: plural(stats.streaks.best, "month", "months"),
          sub: "Longest uninterrupted run"
        })}

        ${panel({
          kicker: "Most scenes",
          value: stats.mostScenesEntry ? escapeHtml(stats.mostScenesEntry.title) : "—",
          sub: stats.mostScenesEntry ? plural(stats.mostScenesEntry.count, "scene", "scenes") : "",
          cls: "wide gradient dark",
          badges: stats.mostScenesEntry ? ["Main character energy"] : []
        })}

        ${panel({
          kicker: "Least scenes",
          value: stats.leastScenesEntry ? escapeHtml(stats.leastScenesEntry.title) : "—",
          sub: stats.leastScenesEntry ? plural(stats.leastScenesEntry.count, "scene", "scenes") : "",
          cls: "wide"
        })}

        ${panel({
          kicker: "Most scenes found in a day",
          value: stats.mostScenesDay ? formatNumber(stats.mostScenesDay[1]) : "—",
          sub: stats.mostScenesDay ? formatDate(new Date(stats.mostScenesDay[0])) : ""
        })}

        ${panel({
          kicker: "Most scenes found in a month",
          value: stats.mostScenesMonth ? formatNumber(stats.mostScenesMonth[1]) : "—",
          sub: stats.mostScenesMonth ? formatMonthKey(stats.mostScenesMonth[0]) : ""
        })}

        ${panel({
          kicker: "Best year",
          value: stats.bestYear ? escapeHtml(stats.bestYear[0]) : "—",
          sub: stats.bestYear ? plural(stats.bestYear[1], "scene", "scenes") : ""
        })}

        ${panel({
          kicker: "Most active weekday",
          value: stats.weekdayChamp ? escapeHtml(stats.weekdayChamp[0]) : "—",
          sub: stats.weekdayChamp ? `${plural(stats.weekdayChamp[1], "scene", "scenes")} logged` : ""
        })}

        ${panel({
          kicker: "Average scenes per title",
          value: stats.avgScenesPerTitle.toFixed(1),
          sub: `Median ${stats.medianScenesPerTitle.toFixed(1)}`
        })}

        ${panel({
          kicker: "Repeatable titles",
          value: formatNumber(stats.repeatedTitles),
          sub: `${plural(stats.singleSceneTitles, "single-scene title", "single-scene titles")}`
        })}

        ${panel({
          kicker: "Latest visit",
          value: stats.latestVisit ? formatDate(stats.latestVisit) : "—",
          sub: stats.latestVisit ? "Most recent scene-hunting outing" : ""
        })}

        ${panel({
          kicker: "First project visit",
          value: stats.firstVisit ? formatDate(stats.firstVisit) : "—",
          sub: stats.firstVisit ? "Where the current era started" : ""
        })}

        ${panel({
          kicker: "Longest gap between visits",
          value: stats.longestGapDays ? `${formatNumber(stats.longestGapDays)} days` : "—",
          sub: stats.longestGapFrom && stats.longestGapTo ? `${formatDate(stats.longestGapFrom)} → ${formatDate(stats.longestGapTo)}` : ""
        })}

        ${panel({
          kicker: "Most scene-heavy format",
          value: stats.typeLeader ? escapeHtml(displayType(stats.typeLeader[0], stats.typeLeader[1])) : "—",
          sub: stats.typeLeader ? plural(stats.typeLeader[1], "scene", "scenes") : ""
        })}

        ${panel({
          kicker: "Cross-country titles",
          value: formatNumber(stats.multiCountryCount),
          sub: "Titles found in more than one country"
        })}

        ${panel({
          kicker: "Most revisited title/type",
          value: stats.titleRevisitLeader ? escapeHtml(stats.titleRevisitLeader.title) : "—",
          sub: stats.titleRevisitLeader ? `${plural(stats.titleRevisitLeader.value, "scene", "scenes")} • ${escapeHtml(displayType(stats.titleRevisitLeader.type, stats.titleRevisitLeader.value))}` : ""
        })}

        ${meterPanel({
          title: "Title count by type",
          subtitle: "How your library spreads across formats.",
          items: [
            { label: "Movies", value: stats.movieTitleCount, display: plural(stats.movieTitleCount, "movie", "movies") },
            { label: "TV", value: stats.tvTitleCount, display: plural(stats.tvTitleCount, "TV title", "TV titles") },
            { label: "Music Videos", value: stats.musicVideoTitleCount, display: plural(stats.musicVideoTitleCount, "music video", "music videos") },
            { label: "Video Games", value: stats.videoGameTitleCount, display: plural(stats.videoGameTitleCount, "video game", "video games") },
            { label: "Misc", value: stats.miscTitleCount, display: plural(stats.miscTitleCount, "misc title", "misc titles") }
          ],
          cls: "wide"
        })}

        ${meterPanel({
          title: "Scene count by type",
          subtitle: "Where most of the project volume lives.",
          items: [
            { label: "Movies", value: stats.movieScenes, display: plural(stats.movieScenes, "scene", "scenes") },
            { label: "TV", value: stats.tvScenes, display: plural(stats.tvScenes, "scene", "scenes") },
            { label: "Music Videos", value: stats.musicVideoScenes, display: plural(stats.musicVideoScenes, "scene", "scenes") },
            { label: "Video Games", value: stats.videoGameScenes, display: plural(stats.videoGameScenes, "scene", "scenes") },
            { label: "Misc", value: stats.miscScenes, display: plural(stats.miscScenes, "scene", "scenes") }
          ],
          cls: "wide"
        })}

        ${barChartPanel({
          title: "Recent month momentum",
          subtitle: "Last 8 active months. Because yes, we absolutely needed the chart.",
          data: stats.recentMonths.map(x => ({
            label: x.short.slice(5),
            value: x.value
          })),
          cls: "wide"
        })}

        ${listPanel({
          title: "Top countries",
          rows: stats.topCountries.length
            ? stats.topCountries.map(item => ({
                label: item.label,
                value: plural(item.value, "scene", "scenes")
              }))
            : [{ label: "No countries yet", value: "—" }],
          cls: "wide"
        })}

        ${listPanel({
          title: "Top collections",
          rows: stats.topCollections.length
            ? stats.topCollections.map(item => ({
                label: item.label,
                value: plural(item.value, "scene", "scenes")
              }))
            : [{ label: "No collections yet", value: "—" }],
          cls: "wide"
        })}

        ${listPanel({
          title: "Yearly breakdown",
          rows: stats.yearlyBreakdown.length
            ? stats.yearlyBreakdown.map(item => ({
                label: item.label,
                value: plural(item.value, "scene", "scenes")
              }))
            : [{ label: "No dated visits yet", value: "—" }],
          cls: "wide"
        })}

        ${panel({
          kicker: "Average scenes per month",
          value: stats.avgScenesPerMonth.toFixed(1),
          sub: "Across all active months since project start"
        })}

        ${panel({
          kicker: "Average scenes per year",
          value: stats.avgScenesPerYear.toFixed(1),
          sub: "Across all active years since project start"
        })}
      </div>
    `;

    rootEl.innerHTML = hero + topStats;
    loadingEl.style.display = "none";
    rootEl.style.display = "block";
  }

  async function init() {
    try {
      const rows = await loadAll();
      const stats = buildStats(rows);
      render(stats);
    } catch (err) {
      console.error(err);
      loadingEl.textContent = "Could not load stats.";
    }
  }

  init();
})();
