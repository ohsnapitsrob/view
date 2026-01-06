window.App = window.App || {};

App.Router = (function () {
  let locationsById = new Map();
  let dataReady = false;

  let applyingFromUrl = false;
  let pendingState = null;

  let map = null;
  let mapReady = false;
  let mapDebounce = null;
  let lastMapSig = "";

  function init() {
    window.addEventListener("popstate", () => {
      applyFromUrl(); // back/forward restores state
    });

    // Initial parse (may apply later once data/map are ready)
    pendingState = readUrlState();
  }

  function setMap(leafletMap) {
    map = leafletMap;
    mapReady = !!map;

    if (!mapReady) return;

    // Apply initial state once map is ready (if pending)
    if (pendingState) {
      applyState(pendingState);
      pendingState = null;
    } else {
      applyFromUrl();
    }

    // Listen for map changes -> URL
    map.on("moveend zoomend", () => {
      if (applyingFromUrl) return;

      // Debounce so we don't spam history while user pans/zooms
      if (mapDebounce) clearTimeout(mapDebounce);
      mapDebounce = setTimeout(() => {
        const c = map.getCenter();
        const z = map.getZoom();

        // Keep URLs neat/stable with sensible rounding
        const mlat = round(c.lat, 5);
        const mlng = round(c.lng, 5);
        const mz = Math.round(z);

        const sig = `${mlat},${mlng},${mz}`;
        if (sig === lastMapSig) return;
        lastMapSig = sig;

        onMapViewChanged({ mlat, mlng, mz });
      }, 150);
    });
  }

  function setLocationsIndex(allLocs) {
    locationsById = new Map();
    (allLocs || []).forEach((loc) => {
      if (loc && loc.id) locationsById.set(loc.id, loc);
    });

    dataReady = true;

    // Apply pending once we have data (and map if possible)
    if (pendingState) {
      applyState(pendingState);
      pendingState = null;
    } else {
      applyFromUrl();
    }
  }

  function round(n, dp) {
    const p = Math.pow(10, dp);
    return Math.round(n * p) / p;
  }

  function readUrlState() {
    const params = new URLSearchParams(window.location.search);

    const q = params.get("q") || "";
    const tab = params.get("tab") || "";
    const fk = params.get("fk") || "";
    const fl = params.get("fl") || "";
    const loc = params.get("loc") || "";

    const mlat = params.get("mlat");
    const mlng = params.get("mlng");
    const mz = params.get("mz");

    return {
      q, tab, fk, fl, loc,
      mlat: mlat !== null ? Number(mlat) : null,
      mlng: mlng !== null ? Number(mlng) : null,
      mz: mz !== null ? Number(mz) : null
    };
  }

  function writeUrlState(state, { push = false } = {}) {
    const params = new URLSearchParams();

    if (state.q) params.set("q", state.q);
    if (state.tab) params.set("tab", state.tab);
    if (state.fk) params.set("fk", state.fk);
    if (state.fl) params.set("fl", state.fl);
    if (state.loc) params.set("loc", state.loc);

    if (Number.isFinite(state.mlat)) params.set("mlat", String(state.mlat));
    if (Number.isFinite(state.mlng)) params.set("mlng", String(state.mlng));
    if (Number.isFinite(state.mz)) params.set("mz", String(state.mz));

    const qs = params.toString();
    const newUrl = qs ? `?${qs}` : window.location.pathname;

    const current = window.location.search ? `?${new URLSearchParams(window.location.search).toString()}` : "";
    const next = qs ? `?${qs}` : "";
    if (current === next) return;

    if (push) history.pushState({}, "", newUrl);
    else history.replaceState({}, "", newUrl);
  }

  function applyFromUrl() {
    // we can apply map view even if data not ready
    const st = readUrlState();
    applyState(st);
  }

  function applyState(state) {
    // Don't do anything until we have at least the map for map view, and data for filters/modals
    applyingFromUrl = true;

    try {
      // 0) Map view first (so UI opens at correct place)
      if (mapReady && Number.isFinite(state.mlat) && Number.isFinite(state.mlng) && Number.isFinite(state.mz)) {
        map.setView([state.mlat, state.mlng], state.mz, { animate: false });
        lastMapSig = `${round(state.mlat,5)},${round(state.mlng,5)},${Math.round(state.mz)}`;
      }

      // If data isn't ready yet, stop here — pendingState is handled by setLocationsIndex()
      if (!dataReady) return;

      // 1) Tab
      if (state.tab === "places" || state.tab === "groups") {
        App.Search.setActiveTab(state.tab, { skipUrl: true });
      }

      // 2) Filter OR search OR default
      if (state.fk && state.fl) {
        App.Search.applyGroupFilter(state.fk, state.fl, { skipUrl: true, keepSearch: true });
      } else if (state.q) {
        const input = App.UI.getSearchInput();
        input.value = state.q;
        App.Search.runSearch(state.q, { skipUrl: true });
      } else {
        App.Search.resetAll({ skipUrl: true });
      }

      // 3) Location modal
      if (state.loc && locationsById.has(state.loc)) {
        const locObj = locationsById.get(state.loc);
        App.Modal.open(locObj, { skipUrl: true });
      }
    } finally {
      applyingFromUrl = false;
    }
  }

  // ---- Public API used by Search + Modal ----

  function onSearchChanged({ q, tab }) {
    if (applyingFromUrl) return;

    const st = readUrlState();
    writeUrlState({
      q: q || "",
      tab: tab || "",
      fk: "", fl: "",
      loc: st.loc || "",
      mlat: st.mlat, mlng: st.mlng, mz: st.mz
    }, { push: false });
  }

  function onFilterChanged({ kind, label }) {
    if (applyingFromUrl) return;

    const st = readUrlState();
    writeUrlState({
      q: "",
      tab: "",
      fk: kind || "",
      fl: label || "",
      loc: "",
      mlat: st.mlat, mlng: st.mlng, mz: st.mz
    }, { push: true });
  }

  function onReset() {
    if (applyingFromUrl) return;

    const st = readUrlState();
    // Keep map view on reset (feels nicer)
    writeUrlState({
      q: "", tab: "", fk: "", fl: "", loc: "",
      mlat: st.mlat, mlng: st.mlng, mz: st.mz
    }, { push: true });
  }

  function onLocationOpened(id) {
    if (applyingFromUrl) return;

    const st = readUrlState();
    writeUrlState({
      q: st.q || "",
      tab: st.tab || "",
      fk: st.fk || "",
      fl: st.fl || "",
      loc: id || "",
      mlat: st.mlat, mlng: st.mlng, mz: st.mz
    }, { push: true });
  }

  function onLocationClosed() {
    if (applyingFromUrl) return;

    const st = readUrlState();
    writeUrlState({
      q: st.q || "",
      tab: st.tab || "",
      fk: st.fk || "",
      fl: st.fl || "",
      loc: "",
      mlat: st.mlat, mlng: st.mlng, mz: st.mz
    }, { push: false });
  }

  function onMapViewChanged({ mlat, mlng, mz }) {
    if (applyingFromUrl) return;

    const st = readUrlState();
    writeUrlState({
      q: st.q || "",
      tab: st.tab || "",
      fk: st.fk || "",
      fl: st.fl || "",
      loc: st.loc || "",
      mlat, mlng, mz
    }, { push: false });
  }

  function isApplyingFromUrl() {
    return applyingFromUrl;
  }

  return {
    init,
    setMap,
    setLocationsIndex,
    onSearchChanged,
    onFilterChanged,
    onReset,
    onLocationOpened,
    onLocationClosed,
    onMapViewChanged,
    isApplyingFromUrl
  };
})();
