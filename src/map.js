window.App = window.App || {};

App.Map = (function () {
  let map;
  let sourceReady = false;
  let pendingMarkers = [];
  let currentMarkers = [];
  let currentRawMarkers = [];
  let locById = new Map();

  let chooserEl = null;
  let lastChooserSceneIds = [];

  const SOURCE_ID = "scene-points";
  const CLUSTERS_ID = "scene-clusters";
  const CLUSTER_COUNT_ID = "scene-cluster-count";
  const POINT_CIRCLES_ID = "scene-point-circles";
  const POINT_LABELS_ID = "scene-point-labels";

  function isStaging() {
    return (window.RUNTIME_CONFIG || {}).environment === "staging";
  }

  function logStagingMapView(reason) {
    if (!isStaging() || !map || !window.console) return;

    const center = map.getCenter();
    console.log("[FTS Map Debug]", {
      reason,
      zoom: Number(map.getZoom().toFixed(3)),
      center: {
        lng: Number(center.lng.toFixed(6)),
        lat: Number(center.lat.toFixed(6))
      }
    });
  }

  function styleFromConfig(styleName) {
    const s = (styleName || "streets").toString().toLowerCase();

    const styles = {
      streets: maptilersdk.MapStyle.STREETS,
      basic: maptilersdk.MapStyle.BASIC,
      bright: maptilersdk.MapStyle.BRIGHT,
      outdoor: maptilersdk.MapStyle.OUTDOOR,
      satellite: maptilersdk.MapStyle.SATELLITE,
      hybrid: maptilersdk.MapStyle.HYBRID,
      topo: maptilersdk.MapStyle.TOPO
    };

    return styles[s] || maptilersdk.MapStyle.STREETS;
  }

  function init() {
    const CFG = window.APP_CONFIG || {};
    const MAPTILER_KEY = CFG.MAPTILER_KEY;
    const MAP_STYLE = CFG.MAP_STYLE || "streets";

    if (!MAPTILER_KEY) {
      alert("MAPTILER_KEY is missing. Set it in config.js");
      throw new Error("Missing MAPTILER_KEY");
    }

    maptilersdk.config.apiKey = MAPTILER_KEY;

    map = new maptilersdk.Map({
      container: "map",
      style: styleFromConfig(MAP_STYLE),
      center: [-2.5, 54.5],
      zoom: 6
    });

    map.on("zoomend", () => logStagingMapView("zoomend"));
    map.on("moveend", () => logStagingMapView("moveend"));

    map.setView = function (latLng, zoom, options = {}) {
      const lat = latLng[0];
      const lng = latLng[1];

      map.easeTo({
        center: [lng, lat],
        zoom,
        duration: options.animate === false ? 0 : 500
      });
    };

    setupChooser();

    map.on("load", () => {
      setupSceneLayers();
      sourceReady = true;

      if (pendingMarkers.length) {
        setSourceData(pendingMarkers);
        pendingMarkers = [];
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeChooser();
    });
  }

  function getMap() {
    return map;
  }

  function colorForType(type) {
    const t = normalizeType(type);
    const colors = {
      Film: "#2563eb",
      TV: "#16a34a",
      "Music Video": "#db2777",
      Misc: "#6b7280",
      "Video Game": "#FFA500"
    };
    return colors[t] || colors.Misc;
  }

  function badgeForType(type) {
    const t = normalizeType(type);
    if (t === "Film") return "F";
    if (t === "TV") return "TV";
    if (t === "Music Video") return "MV";
    if (t === "Video Game") return "VG";
    return "?";
  }

  function normalizeType(type) {
    const x = (type || "").toString().trim().toLowerCase();
    if (x === "film" || x === "movie" || x === "movies") return "Film";
    if (x === "tv" || x === "tv show" || x === "tv shows" || x === "series") return "TV";
    if (x === "music video" || x === "music videos" || x === "mv") return "Music Video";
    if (x === "game" || x === "games" || x === "video game" || x === "video games") return "Video Game";
    if (x === "misc" || x === "other") return "Misc";
    return type || "Misc";
  }

  function markerAllowedByAccess(marker) {
    if (!App.State || typeof App.State.getHideNoAccess !== "function") return true;
    if (!App.State.getHideNoAccess()) return true;
    return !App.State.hasNoAccess(marker?.__loc);
  }

  function applyAccessFilter(markers) {
    return (markers || []).filter(markerAllowedByAccess);
  }

  function setupSceneLayers() {
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: emptyGeoJson(),
      cluster: true,
      clusterRadius: 54,
      clusterMaxZoom: 14
    });

    map.addLayer({
      id: CLUSTERS_ID,
      type: "circle",
      source: SOURCE_ID,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": [
          "step",
          ["get", "point_count"],
          "#a855f7",
          10,
          "#7c3aed",
          40,
          "#db2777"
        ],
        "circle-radius": [
          "step",
          ["get", "point_count"],
          22,
          10,
          28,
          40,
          36
        ],
        "circle-stroke-width": 4,
        "circle-stroke-color": "rgba(255,255,255,0.72)"
      }
    });

    map.addLayer({
      id: CLUSTER_COUNT_ID,
      type: "symbol",
      source: SOURCE_ID,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-size": 13,
        "text-font": ["Noto Sans Bold"]
      },
      paint: {
        "text-color": "#ffffff"
      }
    });

    map.addLayer({
      id: POINT_CIRCLES_ID,
      type: "circle",
      source: SOURCE_ID,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": [
          "case",
          [">", ["get", "stackCount"], 1],
          22,
          20
        ],
        "circle-color": [
          "case",
          [">", ["get", "stackCount"], 1],
          "#111111",
          ["get", "color"]
        ],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 4
      }
    });

    map.addLayer({
      id: POINT_LABELS_ID,
      type: "symbol",
      source: SOURCE_ID,
      filter: ["!", ["has", "point_count"]],
      layout: {
        "text-field": [
          "case",
          [">", ["get", "stackCount"], 1],
          ["to-string", ["get", "stackCount"]],
          ["get", "badge"]
        ],
        "text-size": [
          "case",
          [">", ["get", "stackCount"], 1],
          14,
          13
        ],
        "text-font": ["Noto Sans Bold"],
        "text-offset": [0, 0.05]
      },
      paint: {
        "text-color": "#ffffff"
      }
    });

    map.on("click", CLUSTERS_ID, zoomIntoCluster);
    map.on("click", CLUSTER_COUNT_ID, zoomIntoCluster);

    map.on("click", POINT_CIRCLES_ID, openPointOrChooser);
    map.on("click", POINT_LABELS_ID, openPointOrChooser);

    map.on("click", (e) => {
      const hits = map.queryRenderedFeatures(e.point, {
        layers: [CLUSTERS_ID, CLUSTER_COUNT_ID, POINT_CIRCLES_ID, POINT_LABELS_ID]
      });
      if (!hits.length) closeChooser();
    });

    [CLUSTERS_ID, CLUSTER_COUNT_ID, POINT_CIRCLES_ID, POINT_LABELS_ID].forEach((layerId) => {
      map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; });
    });
  }

  function zoomIntoCluster(e) {
    closeChooser();

    const features = map.queryRenderedFeatures(e.point, {
      layers: [CLUSTERS_ID, CLUSTER_COUNT_ID]
    });

    const feature = features.find((f) => f.properties && f.properties.cluster);
    if (!feature) return;

    const clusterId = feature.properties.cluster_id;
    const source = map.getSource(SOURCE_ID);
    if (!source || clusterId === undefined) return;

    const flyToZoom = (zoom) => {
      if (!Number.isFinite(zoom)) return;

      map.easeTo({
        center: feature.geometry.coordinates,
        zoom,
        duration: 500
      });
    };

    try {
      const result = source.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;
        flyToZoom(zoom);
      });

      if (result && typeof result.then === "function") {
        result.then(flyToZoom).catch(() => {});
      } else if (typeof result === "number") {
        flyToZoom(result);
      }
    } catch (err) {
      console.error("Could not expand cluster", err);
    }
  }

  function openPointOrChooser(e) {
    const feature = e.features && e.features[0];
    const id = feature?.properties?.id;
    if (!id) return;

    const loc = locById.get(id);
    if (!loc) return;

    const scenesAtLocation = getScenesAtSameCoordinates(loc);

    if (scenesAtLocation.length <= 1) {
      closeChooser();
      App.Modal.open(loc);
      return;
    }

    openChooser(scenesAtLocation);
  }

  function coordKeyFromLoc(loc) {
    if (!loc) return "";
    return `${Number(loc.lat).toFixed(6)},${Number(loc.lng).toFixed(6)}`;
  }

  function getScenesAtSameCoordinates(loc) {
    const key = coordKeyFromLoc(loc);

    return currentMarkers
      .map((marker) => marker.__loc)
      .filter(Boolean)
      .filter((item) => coordKeyFromLoc(item) === key)
      .sort((a, b) => {
        const titleCmp = (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" });
        if (titleCmp !== 0) return titleCmp;
        return (a.dateFormatted || a.rawDate || "").localeCompare(b.dateFormatted || b.rawDate || "");
      });
  }

  function getScenesByIds(ids) {
    return (ids || [])
      .map((id) => locById.get(id))
      .filter(Boolean);
  }

  function setupChooser() {
    chooserEl = document.createElement("div");
    chooserEl.id = "sceneChooser";
    chooserEl.className = "scene-chooser";
    chooserEl.setAttribute("aria-hidden", "true");

    chooserEl.innerHTML = `
      <div class="scene-chooser-panel" role="dialog" aria-modal="true" aria-label="Scenes at this location">
        <div class="scene-chooser-head">
          <div>
            <div class="scene-chooser-title">Scenes at this location</div>
            <div id="sceneChooserMeta" class="scene-chooser-meta"></div>
          </div>
          <button id="sceneChooserClose" class="btn scene-chooser-close" type="button">Close</button>
        </div>
        <div id="sceneChooserList" class="scene-chooser-list"></div>
      </div>
    `;

    document.body.appendChild(chooserEl);

    chooserEl.addEventListener("click", (e) => {
      if (e.target === chooserEl) closeChooser();

      const closeBtn = e.target.closest("#sceneChooserClose");
      if (closeBtn) closeChooser();

      const item = e.target.closest("[data-scene-id]");
      if (!item) return;

      const id = item.getAttribute("data-scene-id");
      const loc = locById.get(id);
      if (!loc) return;

      const context = {
        sceneIds: [...lastChooserSceneIds]
      };

      closeChooser();
      App.Modal.open(loc, { fromStackedChooser: context });
    });
  }

  function openChooser(locs) {
    if (!chooserEl) setupChooser();

    const metaEl = chooserEl.querySelector("#sceneChooserMeta");
    const listEl = chooserEl.querySelector("#sceneChooserList");

    lastChooserSceneIds = locs.map((loc) => loc.id).filter(Boolean);

    const first = locs[0];
    const place = [first.place, first.country].filter(Boolean).join(", ");

    metaEl.textContent = `${locs.length.toLocaleString()} scene${locs.length === 1 ? "" : "s"}${place ? " • " + place : ""}`;

    listEl.innerHTML = locs.map((loc) => sceneChooserItemHtml(loc)).join("");

    chooserEl.classList.add("open");
    chooserEl.setAttribute("aria-hidden", "false");
  }

  function reopenStackedChooser(context) {
    const locs = getScenesByIds(context?.sceneIds || []);
    if (!locs.length) return;
    openChooser(locs);
  }

  function closeChooser() {
    if (!chooserEl) return;
    chooserEl.classList.remove("open");
    chooserEl.setAttribute("aria-hidden", "true");
  }

  function sceneChooserItemHtml(loc) {
    const img = Array.isArray(loc.images) && loc.images.length ? loc.images[0] : "";
    const when = loc.monthShort || loc.dateFormatted || loc.rawDate || "";
    const type = normalizeType(loc.type);
    const color = colorForType(type);
    const badge = badgeForType(type);
    const accessText = App.State?.hasNoAccess?.(loc) ? " • No public access" : "";

    return `
      <button class="scene-choice" type="button" data-scene-id="${escapeHtml(loc.id)}">
        <span class="scene-choice-thumb">
          ${
            img
              ? `<img src="${escapeHtml(img)}" alt="" loading="lazy">`
              : `<span class="scene-choice-fallback" style="background:${escapeHtml(color)}">${escapeHtml(badge)}</span>`
          }
        </span>
        <span class="scene-choice-body">
          <span class="scene-choice-title">${escapeHtml(loc.title || "Untitled")}</span>
          <span class="scene-choice-meta">${escapeHtml([type, when].filter(Boolean).join(" • ") + accessText)}</span>
        </span>
      </button>
    `;
  }

  function escapeHtml(s) {
    return (s || "").toString()
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function emptyGeoJson() {
    return {
      type: "FeatureCollection",
      features: []
    };
  }

  function buildCoordCountMap(markers) {
    const counts = new Map();

    markers.forEach((marker) => {
      const loc = marker.__loc;
      if (!loc) return;

      const key = coordKeyFromLoc(loc);
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return counts;
  }

  function markersToGeoJson(markers) {
    const coordCounts = buildCoordCountMap(markers);

    return {
      type: "FeatureCollection",
      features: markers
        .map((marker) => marker.__loc)
        .filter(Boolean)
        .map((loc) => {
          const stackCount = coordCounts.get(coordKeyFromLoc(loc)) || 1;

          return {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [loc.lng, loc.lat]
            },
            properties: {
              id: loc.id,
              title: loc.title,
              type: loc.type,
              color: colorForType(loc.type),
              badge: badgeForType(loc.type),
              stackCount
            }
          };
        })
    };
  }

  function setSourceData(markers) {
    const source = map.getSource(SOURCE_ID);
    if (!source) return;

    locById = new Map();
    markers.forEach((marker) => {
      const loc = marker.__loc;
      if (loc && loc.id) locById.set(loc.id, loc);
    });

    source.setData(markersToGeoJson(markers));
  }

  function formatCountText(markers) {
    const sceneCount = markers.length;

    const titleSet = new Set();
    markers.forEach((marker) => {
      const title = marker?.__loc?.title;
      if (title) titleSet.add(title);
    });

    const titleCount = titleSet.size;

    return `${titleCount.toLocaleString()} title${titleCount === 1 ? "" : "s"}, ${sceneCount.toLocaleString()} scene${sceneCount === 1 ? "" : "s"} shown`;
  }

  function rebuildCluster(markers) {
    currentRawMarkers = markers || [];
    currentMarkers = applyAccessFilter(currentRawMarkers);

    App.UI.setCount(formatCountText(currentMarkers));
    closeChooser();

    if (!sourceReady) {
      pendingMarkers = currentMarkers;
      return;
    }

    setSourceData(currentMarkers);
  }

  function refreshNoAccessFilter() {
    rebuildCluster(currentRawMarkers);
  }

  return {
    init,
    getMap,
    rebuildCluster,
    refreshNoAccessFilter,
    reopenStackedChooser
  };
})();
