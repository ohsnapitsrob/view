(function () {
  const titleEl = document.getElementById("personTitle");
  const copyEl = document.getElementById("personCopy");
  const contentEl = document.getElementById("personContent");

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

  function redirectTo404(reason, value = "") {
    const params = new URLSearchParams();
    params.set("person-error", reason);
    if (value) params.set("value", value);
    window.location.replace(`../404.html?${params.toString()}`);
  }

  function getParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      star: norm(params.get("star")),
      director: norm(params.get("director")),
      person: norm(params.get("person")),
      q: norm(params.get("q")),
      type: norm(params.get("type"))
    };
  }

  function requestedPerson() {
    const names = getParams();
    return names.star || names.director || names.person || names.q;
  }

  function requestedMode() {
    const names = getParams();
    if (names.director) return "director";
    if (names.star) return "star";
    return "person";
  }

  function requestedType() {
    const params = getParams();
    return params.type ? normalizeType(params.type) : "";
  }

  function titleMatchesPerson(meta, personName, mode) {
    const wanted = key(personName);

    if (mode === "director") {
      return splitComma(meta.Director || meta.director).some((name) => key(name) === wanted);
    }

    if (mode === "star") {
      return splitComma(meta.Stars || meta.stars).some((name) => key(name) === wanted);
    }

    return (
      splitComma(meta.Stars || meta.stars).some((name) => key(name) === wanted) ||
      splitComma(meta.Director || meta.director).some((name) => key(name) === wanted)
    );
  }

  function posterCard(meta) {
    const title = norm(meta.title);
    const poster = norm(meta.poster);

    return `
      <a class="person-card" href="../title/?fl=${encodeURIComponent(title)}" aria-label="${escapeHtml(title)}">
        <div class="poster-card">
          ${poster ? `<img src="${escapeHtml(poster)}" alt="${escapeHtml(title)}" loading="lazy">` : `<div class="poster-fallback">${escapeHtml(title)}</div>`}
        </div>
      </a>
    `;
  }

  async function visibleTitleKeys() {
    if (window.FTS?.DataStore?.getScenePacks) {
      const scenePacks = await window.FTS.DataStore.getScenePacks();
      const hideNoAccess = window.FTS?.Visibility?.hideNoAccessEnabled?.() === true;
      return hideNoAccess ? scenePacks.publicTitleKeys : scenePacks.allTitleKeys;
    }

    return null;
  }

  function typeOrder(preferredType) {
    return preferredType
      ? [preferredType, ...DEFAULT_TYPE_ORDER.filter((type) => type !== preferredType)]
      : [...DEFAULT_TYPE_ORDER];
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

  function addGroupStyles() {
    if (document.getElementById("fts-person-group-style")) return;

    const style = document.createElement("style");
    style.id = "fts-person-group-style";
    style.textContent = `
      .person-type-groups { display: grid; gap: 28px; width: 100%; }
      .person-type-group { display: grid; gap: 14px; }
      .person-type-group-title { margin: 0; font-size: clamp(24px, 4vw, 38px); line-height: 1; letter-spacing: -0.05em; font-weight: 850; }
      .person-type-group-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(140px,1fr)); gap: 18px 16px; min-width: 0; width: 100%; }
      @media (max-width: 560px) { .person-type-group-grid { grid-template-columns: repeat(auto-fill,minmax(118px,1fr)); gap: 14px; } }
    `;

    document.head.appendChild(style);
  }

  function renderGroups(groups) {
    const showGroupHeadings = groups.length > 1;

    contentEl.innerHTML = `
      <div class="person-type-groups">
        ${groups.map((group) => `
          <section class="person-type-group">
            ${showGroupHeadings ? `<h2 class="person-type-group-title">${escapeHtml(group.label)}</h2>` : ""}
            <div class="person-type-group-grid">
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

    const person = requestedPerson();
    const mode = requestedMode();
    const preferredType = requestedType();

    if (!person) {
      redirectTo404("missing-person-param");
      return;
    }

    titleEl.textContent = person;
    document.title = `${person} | Find That Scene`;

    try {
      const [metadataRows, titleKeys] = await Promise.all([
        window.FTS.DataStore.getTitleMetadata(),
        visibleTitleKeys()
      ]);

      const matches = metadataRows
        .filter((meta) => titleMatchesPerson(meta, person, mode))
        .filter((meta) => !titleKeys || titleKeys.has(key(meta.title)));

      const groups = groupMatches(matches, preferredType);

      copyEl.textContent = `${matches.length} connected title${matches.length === 1 ? "" : "s"} with scenes found.`;

      contentEl.innerHTML = groups.length
        ? ""
        : `<div class="poster-fallback">No matches</div>`;

      if (groups.length) renderGroups(groups);
    } catch (err) {
      console.error(err);
      copyEl.textContent = "Could not load this person.";
      contentEl.innerHTML = "";
    }
  }

  init();
})();
