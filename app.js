// app.js (boot)
window.App = window.App || {};

(function boot() {
  try {
    App.State.init();
    App.Router.init();

    App.Map.init();
    App.Router.setMap(App.Map.getMap()); // ✅ NEW: enable URL <-> map view sync

    App.Modal.init();
    App.UI.init();
    App.Search.init();
    App.Data.init();
  } catch (e) {
    console.error(e);
    alert("App failed to start. Check console for details.");
  }
})();
