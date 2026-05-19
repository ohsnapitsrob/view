window.FTS = window.FTS || {};

FTS.SceneCard = (function () {
  const {
    escapeHtml,
    safeUrl,
    normalizeRating,
    hasNoAccess,
    splitComma
  } = FTS.Utils;

  const NT_ICON_URL = (window.APP_CONFIG && window.APP_CONFIG.NT_ICON_URL)
    || "https://images.pixieset.com/063553411/79737b7a99cf1e6442ac14468460ebc1-xxlarge.png";

  function ratingValues(row) {
    if (Array.isArray(row.rating)) return row.rating;
    if (typeof row.rating === "string") {
      return splitComma ? splitComma(row.rating) : row.rating.split(",").map((value) => value.trim()).filter(Boolean);
    }
    return [];
  }

  function ratingDotsHtml(row) {
    const ratings = ratingValues(row)
      .map(normalizeRating)
      .filter(Boolean)
      .filter((rating, index, arr) => arr.indexOf(rating) === index);

    if (!ratings.length) return "";

    return ratings.map((rating) => {
      return `<span class="scene-status-dot scene-status-${rating}" aria-hidden="true"></span>`;
    }).join("");
  }

  function noAccessDotHtml(row) {
    if (!hasNoAccess(row)) return "";
    return `<span class="scene-noaccess-dot" aria-label="No public access"></span>`;
  }

  function ntBadgeHtml(row) {
    if (!row.NationalTrust) return "";
    if (!safeUrl(NT_ICON_URL)) return "";

    return `
      <img
        class="scene-nt-badge"
        src="${escapeHtml(NT_ICON_URL)}"
        alt="National Trust"
        loading="lazy"
      >
    `;
  }

  function ntButtonHtml(row) {
    const url = safeUrl(row.NTURL);

    if (!url) return "";
    if (!safeUrl(NT_ICON_URL)) return "";

    return `
      <a
        class="btn scene-nt-btn"
        href="${escapeHtml(url)}"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View National Trust page"
      >
        <img src="${escapeHtml(NT_ICON_URL)}" alt="">
      </a>
    `;
  }

  function render(row) {
    const image = FTS.Locations.sceneImage(row);
    const location = FTS.Locations.sceneLocation(row);
    const date = FTS.Locations.sceneDate(row);
    const noAccessClass = hasNoAccess(row) ? " scene-card-noaccess" : "";

    return `
      <article class="scene-card${noAccessClass}">
        <div class="scene-thumb">
          ${noAccessDotHtml(row)}
          ${ratingDotsHtml(row)}
          ${ntBadgeHtml(row)}
          ${
            image
              ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">`
              : `<div class="scene-thumb-fallback">No image</div>`
          }
        </div>

        <div class="scene-body">
          <h3 class="scene-title">${escapeHtml(row.title)}</h3>

          ${
            row.description
              ? `<p class="scene-desc">${escapeHtml(row.description)}</p>`
              : `<p class="scene-desc">No description yet.</p>`
          }

          <div class="scene-meta">
            ${
              location
                ? `<div class="scene-meta-row"><span class="scene-meta-icon">⌖</span><span>${escapeHtml(location)}</span></div>`
                : ""
            }

            ${
              date
                ? `<div class="scene-meta-row"><span class="scene-meta-icon">◷</span><span>${escapeHtml(date)}</span></div>`
                : ""
            }
          </div>

          <div class="scene-actions">
            <a class="btn btn-primary scene-view-btn" href="${FTS.Locations.buildSceneMapUrl(row)}">View</a>
            ${ntButtonHtml(row)}
          </div>
        </div>
      </article>
    `;
  }

  return {
    render
  };
})();
