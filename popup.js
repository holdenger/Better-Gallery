(() => {
  const api = globalThis.GalleryEnhancerProviders;
  const btn = document.getElementById("openSettings");
  const titleEl = document.getElementById("popupTitle");
  const supportedStateEl = document.getElementById("supportedState");
  const unsupportedStateEl = document.getElementById("unsupportedState");
  const moduleNameEl = document.getElementById("moduleName");
  const toggleLabelEl = document.getElementById("toggleLabel");
  const unsupportedTextEl = document.getElementById("unsupportedText");
  const moduleToggleEl = document.getElementById("moduleToggle");
  const statusEl = document.getElementById("status");

  let activeProvider = null;

  function t(key, substitutions) {
    const msg = chrome.i18n.getMessage(key, substitutions);
    return msg || key;
  }

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message;
  }

  function getActiveTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(Array.isArray(tabs) ? (tabs[0] || null) : null);
      });
    });
  }

  function showSupported(provider, isEnabled) {
    supportedStateEl.hidden = false;
    unsupportedStateEl.hidden = true;
    moduleNameEl.textContent = provider.name || provider.id;
    moduleToggleEl.checked = isEnabled;
    setStatus("");
  }

  function showUnsupported() {
    supportedStateEl.hidden = true;
    unsupportedStateEl.hidden = false;
    setStatus("");
  }

  async function onToggleModule() {
    if (!activeProvider) return;
    try {
      const enabled = new Set(await api.loadEnabledProviderIds());
      if (moduleToggleEl.checked) enabled.add(activeProvider.id);
      else enabled.delete(activeProvider.id);
      await api.saveEnabledProviderIds(Array.from(enabled));
      setStatus(t("optionsSaved"));
    } catch (e) {
      setStatus(t("optionsFailedSaveSettings", [String(e && e.message ? e.message : e)]));
    }
  }

  document.title = t("extName");
  if (titleEl) titleEl.textContent = t("extName");
  if (btn) btn.textContent = t("popupOpenSettings");
  if (toggleLabelEl) toggleLabelEl.textContent = t("popupEnabledOnSite");
  if (unsupportedTextEl) unsupportedTextEl.textContent = t("popupUnsupportedPage");
  if (!btn || !api) return;

  btn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  if (moduleToggleEl) {
    moduleToggleEl.addEventListener("change", onToggleModule);
  }

  (async function init() {
    const tab = await getActiveTab();
    const tabUrl = tab && tab.url ? tab.url : "";
    activeProvider = api.detectProviderForUrl(tabUrl, tabUrl);
    if (!activeProvider) {
      showUnsupported();
      return;
    }
    const enabled = new Set(await api.loadEnabledProviderIds());
    showSupported(activeProvider, enabled.has(activeProvider.id));
  })().catch((e) => {
    showUnsupported();
    setStatus(`Failed to initialize popup: ${e && e.message ? e.message : e}`);
  });
})();
