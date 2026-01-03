window.App = window.App || {};

App.State = (function () {
  let currentFilter = null; // {kind,label} or null

  function init() {
    // nothing required yet
  }

  function getFilter() {
    return currentFilter;
  }

  function setFilter(filter) {
    currentFilter = filter || null;
    App.UI.setFilterUI(currentFilter);
  }

  function clearFilter() {
    setFilter(null);
  }

  return { init, getFilter, setFilter, clearFilter };
})();
