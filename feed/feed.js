(function () {
  const contentEl = document.getElementById("feedContent");
  const PAGE_SIZE = 10;

  let scenes = [];
  let visibleCount = 0;
  let observer = null;
  let loading = false;

  function norm(value) {
    return window.FTS?.Utils?.norm ? window.FTS.Utils.norm(value) : (value || "").toString().trim();
  }

  function escapeHtml(value) {
    return window.FTS?.Utils?.escapeHtml ? window.FTS.Utils.escapeHtml(value) : norm(value);
  }

  function parseDate(scene) {
    const candidates = [
      scene.visitedTs,
      scene.rawDate,
      scene.dateFormatted,
      scene.visited,
      scene["visit-date"]
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
      const parsed = Date.parse(norm(candidate));
      if (Number.isFinite(parsed)) return parsed;
    }

    return 0;
  }

  function daysAgo(timestamp) {
    if (!timestamp) return "Date unknown";

    const now = Date.now();
    const diff = Math.max(0, now - timestamp);
    const days = Math.floor(diff / 86400000);

    if (days <= 0) return "Today";
    if (days === 1) return "1 day ago";
    return `${days.toLocaleString()} days ago`;
  }

  function locationText(scene) {
    return [scene.place, scene.city, scene.country]
      .map(norm)
      .filter(Boolean)
      .filter((value, index, arr) => arr.indexOf(value) === index)
      .join(", ");
  }

  function sceneImage(scene) {
    return Array.isArray(scene.images) && scene.images.length ? norm(scene.images[0]) : "";
  }

  function mapUrl(scene) {
    const params = new URLSearchParams();
    if (scene.id) params.set("loc", scene.id);
    if (Number.isFinite(scene.lat)) params.set("mlat", scene.lat.toFixed(5));
    if (Number.isFinite(scene.lng)) params.set("mlng", scene.lng.toFixed(5));
    params.set("mz", "15");
    return `../explore/?${params.toString()}`;
  }

  function card(scene) {
    const image = sceneImage(scene);
    const location = locationText(scene) || "Location unknown";
    const timestamp = parseDate(scene);

    return `
      <article class="feed-card">
        <a class="feed-thumb" href="${mapUrl(scene)}" aria-label="Open ${escapeHtml(scene.title)} on the map">
          ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(scene.title)} scene image" loading="lazy">` : `<span class="feed-thumb-fallback">No image</span>`}
        </a>
        <div class="feed-main">
          <div class="feed-row">
            <div>
              <h2 class="feed-title">${escapeHtml(scene.title)}</h2>
              <p class="feed-location">${escapeHtml(location)}</p>
            </div>
            <a class="feed-map-btn" href="${mapUrl(scene)}" aria-label="Open this scene on the map">⌖</a>
          </div>
          <div class="feed-age">${escapeHtml(daysAgo(timestamp))}</div>
        </div>
      </article>
    `;
  }

  function renderShell() {
    contentEl.innerHTML = `
      <div id="feedList" class="feed-list"></div>
      <div id="feedLoader" class="feed-loader" hidden><div class="fts-loader" aria-label="Loading more scenes"></div></div>
      <div id="feedSentinel" class="feed-sentinel" aria-hidden="true"></div>
    `;
  }

  function renderEmpty() {
    contentEl.innerHTML = `<div class="feed-empty">No scenes match your current settings.</div>`;
  }

  function appendNextBatch() {
    if (loading) return;
    if (visibleCount >= scenes.length) return;

    loading = true;
    const loader = document.getElementById("feedLoader");
    const list = document.getElementById("feedList");
    if (loader) loader.hidden = false;

    window.setTimeout(() => {
      const next = scenes.slice(visibleCount, visibleCount + PAGE_SIZE);
      visibleCount += next.length;

      if (list) {
        list.insertAdjacentHTML("beforeend", next.map(card).join(""));
      }

      if (loader) loader.hidden = true;
      loading = false;

      if (visibleCount >= scenes.length && observer) {
        observer.disconnect();
        observer = null;
      }
    }, 80);
  }

  function setupInfiniteLoad() {
    const sentinel = document.getElementById("feedSentinel");
    if (!sentinel) return;

    if (observer) observer.disconnect();

    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) appendNextBatch();
    }, {
      rootMargin: "500px 0px"
    });

    observer.observe(sentinel);
  }

  async function loadScenes() {
    await window.FTS?.Boot?.ready?.({ scenePacks: true });

    if (window.FTS?.DataStore?.getScenePacks) {
      const scenePacks = await window.FTS.DataStore.getScenePacks();
      const hideNoAccess = window.FTS?.Visibility?.hideNoAccessEnabled?.() === true;
      return hideNoAccess ? scenePacks.publicScenes : scenePacks.allScenes;
    }

    return [];
  }

  async function init() {
    try {
      const rows = await loadScenes();

      scenes = rows
        .map((scene) => ({ ...scene, _feedTs: parseDate(scene) }))
        .sort((a, b) => b._feedTs - a._feedTs || norm(a.title).localeCompare(norm(b.title), undefined, { sensitivity: "base" }));

      if (!scenes.length) {
        renderEmpty();
        return;
      }

      renderShell();
      appendNextBatch();
      setupInfiniteLoad();
    } catch (err) {
      console.error(err);
      contentEl.innerHTML = `<div class="feed-empty">Could not load the scene feed.</div>`;
    }
  }

  init();
})();
