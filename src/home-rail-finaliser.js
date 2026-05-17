window.FTS = window.FTS || {};

FTS.HomeRailFinaliser = (function () {
  let timer = null;
  let insertingPeopleRail = false;

  function norm(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  function railTitle(rail) {
    return norm(rail?.querySelector?.(".rail-title")?.textContent);
  }

  function railsReady(root) {
    return Boolean(root) && !root.querySelector(".loading-card") && root.querySelectorAll(":scope > .rail").length > 0;
  }

  async function ensurePeopleRail(root) {
    if (!root || root.querySelector(":scope > .rail-people") || insertingPeopleRail) return;
    if (window.FTS?.Features?.isEnabled("homeRailPeopleEnabled") === false) return;
    if (!window.FTS?.HomePeopleRail?.html) return;

    insertingPeopleRail = true;

    try {
      const markup = await window.FTS.HomePeopleRail.html();
      if (!markup || root.querySelector(":scope > .rail-people")) return;

      const template = document.createElement("template");
      template.innerHTML = markup.trim();
      const rail = template.content.firstElementChild;
      if (rail) root.appendChild(rail);
    } catch (error) {
      console.warn("Could not insert people rail", error);
    } finally {
      insertingPeopleRail = false;
    }
  }

  function moveSpecialRails(root) {
    if (!root) return;

    const rails = Array.from(root.querySelectorAll(":scope > .rail"));
    if (!rails.length) return;

    const peopleRail = rails.find((rail) => rail.classList.contains("rail-people"));
    const gamesRail = rails.find((rail) => railTitle(rail) === "games");

    if (peopleRail) root.appendChild(peopleRail);
    if (gamesRail) root.appendChild(gamesRail);
  }

  function refreshDrag() {
    window.FTS?.HomeRails?.makeRailsDraggable?.();
  }

  async function finalise() {
    const root = document.getElementById("railsRoot");
    if (!railsReady(root)) return;

    await ensurePeopleRail(root);
    moveSpecialRails(root);
    refreshDrag();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(finalise, 350);
  }

  function init() {
    const root = document.getElementById("railsRoot");
    if (!root) return;

    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true });
    schedule();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return { finalise, schedule };
})();
