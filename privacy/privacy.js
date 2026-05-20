(function () {
  const emailLink = document.getElementById("privacyContactEmail");
  const email = window.FTS?.SiteContent?.contactEmail || "";
  const settingsButton = document.getElementById("openPrivacySettings");

  if (emailLink && email) {
    emailLink.href = "mailto:" + email;
    emailLink.textContent = email;
  }

  settingsButton?.addEventListener("click", () => {
    if (window.FTS?.AppSettings?.open) {
      window.FTS.AppSettings.open();
    } else {
      window.FTS?.Privacy?.openSettings?.({ saveLabel: "Save settings" });
    }
  });
})();
