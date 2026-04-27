window.App = window.App || {};

App.Map = (function () {
  let map;
  let sourceReady = false;
  let pendingMarkers = [];
  let currentMarkers = [];
  let locById = new Map();

  const SOURCE_ID = "scene-points";
  const CLUSTERS_ID = "scene-clusters";
  const CLUSTER_COUNT_ID = "scene-cluster-count";
  const POINT_CIRCLES_ID = "scene-point-circles";
  const POINT_LABELS_ID = "scene-point-labels";

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

    map.addControl(new maptilersdk.NavigationControl(), "top-left");

    // Compatibility shim so existing UI/router code can still call setView([lat,lng], zoom)
    map.setView = function (latLng, zoom, options = {}) {
      const lat = latLng[0];
      const lng = latLng[1];

      map.easeTo({
        center: [lng, lat],
        zoom,
        duration: options.animate === false ? 0 : 500
      });
    };

    map.on("load", () => {
      setupSceneLayers();
      sourceReady = true;

      if (pendingMarkers.length) {
        setSourceData(pendingMarkers);
        pendingMarkers = [];
      }
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
        "circle-radius": 20,
        "circle-color": ["get", "color"],
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
        "text-field": ["get", "badge"],
        "text-size": 13,
        "text-font": ["Noto Sans Bold"],
        "text-offset": [0, 0.05]
      },
      paint: {
        "text-color": "#ffffff"
      }
    });

    map.on("click", CLUSTERS_ID, (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: [CLUSTERS_ID] });
      const clusterId = features[0]?.properties?.cluster_id;
      const source = map.getSource(SOURCE_ID);

      if (!source || clusterId === undefined) return;

      source.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;

        map.easeTo({
          center: features[0].geometry.coordinates,
          zoom
        });
      });
    });

    map.on("click", POINT_CIRCLES_ID, openFeatureModal);
    map.on("click", POINT_LABELS_ID, openFeatureModal);

    map.on("mouseenter", CLUSTERS_ID, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", CLUSTERS_ID, () => { map.getCanvas().style.cursor = ""; });
    map.on("mouseenter", POINT_CIRCLES_ID, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", POINT_CIRCLES_ID, () => { map.getCanvas().style.cursor = ""; });
    map.on("mouseenter", POINT_LABELS_ID, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", POINT_LABELS_ID, () => { map.getCanvas().style.cursor = ""; });
  }

  function openFeatureModal(e) {
    const feature = e.features && e.features[0];
    const id = feature?.properties?.id;
    if (!id) return;

    const loc = locById.get(id);
    if (!loc) return;

    App.Modal.open(loc);
  }

  function emptyGeoJson() {
    return {
      type: "FeatureCollection",
      features: []
    };
  }

  function markersToGeoJson(markers) {
    return {
      type: "FeatureCollection",
      features: markers
        .map((marker) => marker.__loc)
        .filter(Boolean)
        .map((loc) => ({
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
            badge: badgeForType(loc.type)
          }
        }))
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
    currentMarkers = markers || [];
    App.UI.setCount(formatCountText(currentMarkers));

    if (!sourceReady) {
      pendingMarkers = currentMarkers;
      return;
    }

    setSourceData(currentMarkers);
  }

  return { init, getMap, rebuildCluster };
})();
