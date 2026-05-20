(function () {
  const titleEl = document.getElementById("genreTitle");
  const copyEl = document.getElementById("genreCopy");
  const gridEl = document.getElementById("genreGrid");
  let noAccessTitleKeys = new Set();

  const DEFAULT_TYPE_ORDER = ["Film", "TV", "Music Video", "Video Game", "Misc"];

  function norm(value) {
    return window.FTS?.Utils?.norm ? window.FTS.Utils.norm(value) : (value || "").toString().trim();
  }

  function key(value) {
    return window.FTS?.Utils?.normalizeComparable ? window.FTS.Utils.normalizeComparable(value) : norm(value).toLowerCase();
  }

  function escapeHtml(value) {
    return window.FTS?.Utils?.escapeHtml ? window.FTS.Utils.escapeHtml(value) : norm(value);
  }

  function splitComma(value) {
    return window.FTS?.Utils?.splitComma ? window.FTS.Utils.splitComma(value) : norm(value).split(",").map(norm).filter(Boolean);
  }

  function normalizeType(value) {
    const raw = key(value);
    if (!raw) return "Misc";
    if (raw === "films" || raw === "film" || raw === "movies" || raw === "movie") return "Film";
    if (raw === "series" || raw === "tv" || raw === "tv show" || raw === "tv shows" || raw === "show") return "TV";
    if (raw === "games" || raw === "game" || raw === "video game" || raw === "video games") return "Video Game";
    if (raw === "music" || raw === "music videos" || raw === "music video" || raw === "mv") return "Music Video";
    if (raw === "misc" || raw === "other") return "Misc";
    return norm(value);
  }

  function typeLabel(type) {
    const normalized = normalizeType(type);
    if (normalized === "Film") return "Films";
    if (normalized === "TV") return "Series";
    if (normalized === "Music Video") return "Music Videos";
    if (normalized === "Video Game") return "Games";
    if (normalized === "Misc") return "Other";
    return normalized;
  }

  function featureEnabled(name) {
    return window.FTS?.Features?.isEnabled ? window.FTS.Features.isEnabled(name) : true;
  }

  function hidePosterTags() {
    return window.FTS?.AppSettings?.getSettings?.().hideHomepageTags === true;
  }

  function noAccessBadge(title) {
    if (!featureEnabled("homepagePosterOverlays")) return "";
    if (hidePosterTags()) return "";
    if (!noAccessTitleKeys.has(key(title))) return "";

    return `<div class="poster-badges"><span class="poster-badge poster-badge-no-access">No access</span></div>`;
  }

  function redirectTo404(reason, value = "") {
    const params = new URLSearchParams();
    params.set("genre-error", reason);
    if (value) params.set("value", value);
    window.location.replace(`../404.html?${params.toString()}`);
  }

  function getParam(name) {
    return norm(new URLSearchParams(window.location.search).get(name));
  }

  function wantedType() {
    const raw = getParam("type");
    return raw ? normalizeType(raw) : "";
  }

  function posterCard(item) {
    const title = norm(item.title);
    const poster = norm(item.poster);
    return `
      <a class="genre-card" href="../title/?fl=${encodeURIComponent(title)}" aria-label="${escapeHtml(title)}">
        <div class="poster-card">
          ${poster ? `<img src="${escapeHtml(poster)}" alt="${escapeHtml(title)}" loading="lazy">` : `<div class="poster-fallback">${escapeHtml(title)}</div>`}
          ${noAccessBadge(title)}
        </div>
      </a>
    `;
  }

  function metadataGenreList(row) {
    return splitComma(row.Genres || row.genres || row.genre || row.Genre);
  }

  async function getVisibleTitleKeys() {
    if (window.FTS?.DataStore?.getScenePacks) {
      const scenePacks = await window.FTS.DataStore.getScenePacks();
      const hideNoAccess = window.FTS?.Visibility?.hideNoAccessEnabled?.() === true;
      return hideNoAccess ? scenePacks.publicTitleKeys : scenePacks.allTitleKeys;
    }

    return null;
  }

  async function getNoAccessTitleKeys() {
    if (!window.FTS?.DataStore?.getScenePacks) return new Set();

    const scenePacks = await window.FTS.DataStore.getScenePacks();
    return scenePacks.onlyRestrictedTitleKeys || new Set();
  }

  function addGroupStyles() {
    if (document.getElementById("fts-genre-group-style")) return;

    const style = document.createElement("style");
    style.id = "fts-genre-group-style";
    style.textContent = `
      .genre-groups { display: grid; gap: 28px; }
      .genre-group { display: grid; gap: 14px; }
      .genre-group-title { margin: 0; font-size: clamp(24px, 4vw, 38px); line-height: 1; letter-spacing: -0.05em; font-weight: 850; }
      .genre-group-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(140px,1fr)); gap: 18px 16px; min-width: 0; }
      @media (max-width: 560px) { .genre-group-grid { grid-template-columns: repeat(auto-fill,minmax(118px,1fr)); gap: 14px; } }
    `;

    document.head.appendChild(style);
  }

  function typeOrder(preferredType) {
    const order = preferredType
      ? [preferredType, ...DEFAULT_TYPE_ORDER.filter((type) => type !== preferredType)]
      : [...DEFAULT_TYPE_ORDER];

    return order;
  }

  function groupMatches(matches, preferredType) {
    const groups = new Map();

    matches.forEach((item) => {
      const type = normalizeType(item.type);
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type).push(item);
    });

    const knownOrder = typeOrder(preferredType);
    const unknownTypes = Array.from(groups.keys())
      .filter((type) => !knownOrder.includes(type))
      .sort((a, b) => typeLabel(a).localeCompare(typeLabel(b), undefined, { sensitivity: "base" }));

    return [...knownOrder, ...unknownTypes]
      .filter((type) => groups.has(type))
      .map((type) => ({
        type,
        label: typeLabel(type),
        items: groups.get(type).sort((a, b) => norm(a.title).localeCompare(norm(b.title), undefined, { sensitivity: "base" }))
      }));
  }

  function renderGroups(groups) {
    const showGroupHeadings = groups.length > 1;

    gridEl.innerHTML = `
      <div class="genre-groups">
        ${groups.map((group) => `
          <section class="genre-group">
            ${showGroupHeadings ? `<h2 class="genre-group-title">${escapeHtml(group.label)}</h2>` : ""}
            <div class="genre-group-grid">
              ${group.items.map(posterCard).join("")}
            </div>
          </section>
        `).join("")}
      </div>
    `;
  }

  async function init() {
    await window.FTS?.Boot?.ready?.({ scenePacks: true, titleDatasets: true });
    addGroupStyles();

    const genre = getParam("genre");
    const preferredType = wantedType();

    if (!genre) {
      redirectTo404("missing-genre-param");
      return;
    }

    titleEl.textContent = genre;
    document.title = `${genre} | Find That Scene`;

    try {
      const [metadataRows, visibleKeys, restrictedTitleKeys] = await Promise.all([
        window.FTS.DataStore.getTitleMetadata(),
        getVisibleTitleKeys(),
        getNoAccessTitleKeys()
      ]);

      noAccessTitleKeys = restrictedTitleKeys;

      const matches = metadataRows
        .filter((row) => metadataGenreList(row).some((item) => key(item) === key(genre)))
        .filter((row) => !visibleKeys || visibleKeys.has(key(row.title)));

      const groups = groupMatches(matches, preferredType);

      copyEl.textContent = `${matches.length} title${matches.length === 1 ? "" : "s"} found.`;
      gridEl.innerHTML = groups.length
        ? ""
        : `<div class="poster-fallback">No matches</div>`;

      if (groups.length) renderGroups(groups);
    } catch (err) {
      console.error(err);
      copyEl.textContent = "Could not load this genre.";
      gridEl.innerHTML = "";
    }
  }

  init();
})();
