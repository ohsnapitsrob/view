window.FTS = window.FTS || {};

FTS.Analytics = (function () {
  const config = window.APP_CONFIG || {};
  const PARAMETER_UPDATE_EVENT = "parameterUpdate";
  const SESSION_SETTINGS_KEY = "fts-analytics-session-settings";
  let parameterUpdateTimer = null;
  let lastParameterSignature = "";
  let historyWrapped = false;
  let titleObserverStarted = false;

  function isStaging() {
    const host = (window.location.hostname || "").toLowerCase();
    return host.includes("staging") || host.includes("preview") || host.includes("github.dev");
  }

  function enabled() {
    if (window.FTS?.Features?.isEnabled("plausibleAnalyticsEnabled") !== true) {
      return false;
    }

    if (isStaging()) {
      return window.FTS?.Features?.isEnabled("plausibleAnalyticsOnStagingEnabled") === true;
    }

    return true;
  }

  function getParams() {
    return new URLSearchParams(window.location.search);
  }

  function cleanValue(value) {
    if (value === undefined || value === null) return "";
    return value.toString().trim();
  }

  function getText(selector) {
    return cleanValue(document.querySelector(selector)?.textContent);
  }

  function getDataLabel(selector) {
    return cleanValue(document.querySelector(selector)?.dataset?.label);
  }

  function getPageType() {
    const path = window.location.pathname.replace(/\/+$/, "");

    if (!path || path.endsWith("/fts") || path === "/") return "home";
    if (path.endsWith("/explore")) return "explore";
    if (path.endsWith("/browse")) return "browse";
    if (path.endsWith("/title")) return "title";
    if (path.endsWith("/stats")) return "stats";
    if (path.endsWith("/national-trust")) return "national_trust";
    if (path.endsWith("/privacy")) return "privacy";

    return "other";
  }

  function normalisePropertyName(value) {
    return cleanValue(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function loadJsonStorage(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      return {};
    }
  }

  function hasPrivacyChoice() {
    try {
      const raw = localStorage.getItem("fts-privacy-settings");
      if (!raw) return false;

      const settings = JSON.parse(raw);
      return settings && typeof settings === "object";
    } catch (err) {
      return false;
    }
  }

  function getConsentMode() {
    if (!hasPrivacyChoice()) {
      return "";
    }

    const settings = loadJsonStorage("fts-privacy-settings");
    return settings.mediaEmbeds === true ? "media" : "essential_only";
  }

  function getAppSettings() {
    if (window.FTS?.AppSettings?.getSettings) {
      return window.FTS.AppSettings.getSettings();
    }

    return loadJsonStorage("fts-app-settings");
  }

  function addIfPresent(props, key, value) {
    const clean = cleanValue(value);
    if (!clean) return;
    props[key] = clean;
  }

  function getModalTitleFallback() {
    const modal = document.getElementById("modal");
    const modalVisible = modal && modal.getAttribute("aria-hidden") !== "true";

    if (!modalVisible) return "";

    return getText("#mTitle");
  }

  function getTitlePageTitleFallback(pageType) {
    if (pageType !== "title") return "";
    return getText("#titleContent h1") || getText(".title-content h1");
  }

  function getViewType(pageType) {
    if (pageType === "title") {
      return getText("#titleContent .kicker") || getText(".title-content .kicker");
    }

    return getDataLabel('#mTags [data-kind="Type"]');
  }

  function getFilterContext(params, pageType) {
    let filterValue = cleanValue(params.get("fl") || params.get("title"));
    let filterType = cleanValue(params.get("fk"));

    if (!filterValue && pageType === "title") {
      filterValue = getTitlePageTitleFallback(pageType);
    }

    if (!filterType && pageType === "title" && filterValue) {
      filterType = "Title";
    }

    return {
      filterType,
      filterValue
    };
  }

  function getParameterContext() {
    const params = getParams();
    const pageType = getPageType();
    const { filterType, filterValue } = getFilterContext(params, pageType);

    return {
      params,
      pageType,
      searchQuery: cleanValue(params.get("q")),
      activeTab: cleanValue(params.get("tab")),
      filterType,
      filterValue,
      modalTitle: getModalTitleFallback(),
      viewType: getViewType(pageType),
      locationId: cleanValue(params.get("loc")),
      ratingMatch: cleanValue(params.get("rm")),
      mapLatitude: cleanValue(params.get("mlat")),
      mapLongitude: cleanValue(params.get("mlng")),
      mapZoom: cleanValue(params.get("mz"))
    };
  }

  function hasTrackableParams() {
    const context = getParameterContext();

    return Boolean(
      context.searchQuery ||
      context.activeTab ||
      context.filterType ||
      context.filterValue ||
      context.modalTitle ||
      context.viewType ||
      context.locationId ||
      context.ratingMatch ||
      context.mapLatitude ||
      context.mapLongitude ||
      context.mapZoom
    );
  }

  function buildGlobalProperties() {
    const props = {};
    addIfPresent(props, "page_type", getPageType());
    return props;
  }

  function getSettingsState() {
    const appSettings = getAppSettings();

    if (!hasPrivacyChoice()) {
      return null;
    }

    return {
      consentMode: getConsentMode(),
      hideNoAccessScenes: appSettings.hideNoAccessScenes === true ? "true" : "false"
    };
  }

  function getPreviousSessionSettingsState() {
    try {
      const raw = sessionStorage.getItem(SESSION_SETTINGS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function setPreviousSessionSettingsState(state) {
    try {
      sessionStorage.setItem(SESSION_SETTINGS_KEY, JSON.stringify(state));
    } catch (err) {}
  }

  function eventSuffix(value) {
    return cleanValue(value)
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");
  }

  function trackSettingEvent(eventName) {
    window.plausible?.(eventName, {
      props: buildGlobalProperties()
    });
  }

  function trackSessionSettings() {
    if (!enabled()) return;

    const state = getSettingsState();
    if (!state) return;

    const previous = getPreviousSessionSettingsState();

    if (!previous || previous.consentMode !== state.consentMode) {
      trackSettingEvent(`settingConsent${eventSuffix(state.consentMode)}`);
    }

    if (!previous || previous.hideNoAccessScenes !== state.hideNoAccessScenes) {
      trackSettingEvent(`settingHideNoAccessScenes${eventSuffix(state.hideNoAccessScenes)}`);
    }

    setPreviousSessionSettingsState(state);
  }

  function addFilterProperties(props, context) {
    const dynamicFilterKey = normalisePropertyName(context.filterType);

    addIfPresent(props, "filter_type", context.filterType);
    addIfPresent(props, "filter_value", context.filterValue);

    if (dynamicFilterKey && context.filterValue) {
      addIfPresent(props, dynamicFilterKey, context.filterValue);
    }

    if (context.modalTitle && dynamicFilterKey !== "title") {
      addIfPresent(props, "title", context.modalTitle);
    }
  }

  function addLocationProperties(props, context) {
    addIfPresent(props, "location_id", context.locationId);
    addIfPresent(props, "title", context.modalTitle || (normalisePropertyName(context.filterType) === "title" ? context.filterValue : ""));
    addIfPresent(props, "view_type", context.viewType);
  }

  function addMapProperties(props, context) {
    if (context.mapLatitude && context.mapLongitude) {
      addIfPresent(props, "coordinates", `${context.mapLatitude},${context.mapLongitude}`);
    }

    addIfPresent(props, "map_zoom", context.mapZoom);
  }

  function addSearchProperties(props, context) {
    addIfPresent(props, "search_query", context.searchQuery);
  }

  function addTabProperties(props, context) {
    addIfPresent(props, "active_tab", context.activeTab);
  }

  function addViewTypeProperties(props, context) {
    addIfPresent(props, "view_type", context.viewType);
  }

  function buildParameterProperties() {
    const context = getParameterContext();
    const props = {};

    addSearchProperties(props, context);
    addTabProperties(props, context);
    addFilterProperties(props, context);
    addLocationProperties(props, context);
    addMapProperties(props, context);
    addIfPresent(props, "rating_match", context.ratingMatch);
    addViewTypeProperties(props, context);

    return props;
  }

  function buildPageviewProperties() {
    return {
      ...buildGlobalProperties(),
      ...buildParameterProperties()
    };
  }

  function getParameterUpdateEventName() {
    const context = getParameterContext();

    if (context.modalTitle || context.locationId) return "locationUpdate";
    if (context.filterType && context.filterValue) return "filterUpdate";
    if (context.mapLatitude && context.mapLongitude) return "mapUpdate";
    if (context.searchQuery) return "searchUpdate";
    if (context.activeTab) return "tabUpdate";
    if (context.viewType) return "viewTypeUpdate";

    return PARAMETER_UPDATE_EVENT;
  }

  function buildFocusedParameterProperties(eventName) {
    const context = getParameterContext();
    const props = buildGlobalProperties();

    if (eventName === "locationUpdate") {
      addLocationProperties(props, context);
      addFilterProperties(props, context);
      return props;
    }

    if (eventName === "filterUpdate") {
      addFilterProperties(props, context);
      addViewTypeProperties(props, context);
      return props;
    }

    if (eventName === "mapUpdate") {
      addMapProperties(props, context);
      return props;
    }

    if (eventName === "searchUpdate") {
      addSearchProperties(props, context);
      return props;
    }

    if (eventName === "tabUpdate") {
      addTabProperties(props, context);
      return props;
    }

    if (eventName === "viewTypeUpdate") {
      addViewTypeProperties(props, context);
      addFilterProperties(props, context);
      return props;
    }

    return {
      ...props,
      ...buildParameterProperties()
    };
  }

  function parameterSignature() {
    const params = getParams();
    const entries = Array.from(params.entries())
      .map(([key, value]) => [key, cleanValue(value)])
      .filter(([, value]) => value !== "")
      .sort(([a], [b]) => a.localeCompare(b));

    return JSON.stringify({
      path: window.location.pathname,
      params: entries,
      modalTitle: getModalTitleFallback(),
      titlePageTitle: getTitlePageTitleFallback(getPageType()),
      viewType: getViewType(getPageType())
    });
  }

  function trackParameterUpdate() {
    if (!enabled()) return;
    if (!hasTrackableParams()) return;

    const signature = parameterSignature();
    if (signature === lastParameterSignature) return;

    lastParameterSignature = signature;

    const eventName = getParameterUpdateEventName();

    window.plausible?.(eventName, {
      props: buildFocusedParameterProperties(eventName)
    });
  }

  function scheduleParameterUpdate(delay = 600) {
    if (!enabled()) return;

    if (parameterUpdateTimer) {
      clearTimeout(parameterUpdateTimer);
    }

    parameterUpdateTimer = setTimeout(trackParameterUpdate, delay);
  }

  function wrapHistoryMethod(methodName) {
    const original = window.history[methodName];

    if (typeof original !== "function") return;

    window.history[methodName] = function () {
      const result = original.apply(this, arguments);
      scheduleParameterUpdate();
      return result;
    };
  }

  function watchTitleContentUpdates() {
    if (titleObserverStarted || getPageType() !== "title") return;
    titleObserverStarted = true;

    const start = () => {
      const target = document.getElementById("titleContent");
      if (!target) return;

      const observer = new MutationObserver(() => {
        scheduleParameterUpdate(250);
      });

      observer.observe(target, {
        childList: true,
        subtree: true,
        characterData: true
      });
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  }

  function watchParameterUpdates() {
    if (historyWrapped) return;
    historyWrapped = true;

    lastParameterSignature = parameterSignature();

    wrapHistoryMethod("pushState");
    wrapHistoryMethod("replaceState");

    window.addEventListener("popstate", scheduleParameterUpdate);
    watchTitleContentUpdates();
  }

  function init() {
    if (!enabled()) return;

    const scriptUrl = config.PLAUSIBLE_SCRIPT_URL;

    if (!scriptUrl) return;
    if (document.querySelector("script[data-fts-plausible]")) return;

    window.plausible = window.plausible || function () {
      (window.plausible.q = window.plausible.q || []).push(arguments);
    };

    window.plausible.init = window.plausible.init || function (options) {
      window.plausible.o = options || {};
    };

    window.plausible.init({
      customProperties: function (eventName) {
        if (eventName !== "pageview") {
          return {};
        }

        return buildPageviewProperties();
      }
    });

    watchParameterUpdates();

    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;
    script.defer = true;
    script.setAttribute("data-fts-plausible", "true");
    script.addEventListener("load", trackSessionSettings, { once: true });

    document.head.appendChild(script);
  }

  return {
    init,
    buildPageviewProperties,
    buildParameterProperties,
    trackParameterUpdate,
    trackSessionSettings
  };
})();

FTS.Analytics.init();
