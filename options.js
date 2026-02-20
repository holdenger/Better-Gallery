(() => {
  const api = globalThis.GalleryEnhancerProviders;
  const modulesEl = document.getElementById("modules");
  const statusEl = document.getElementById("status");
  const btnEnableAll = document.getElementById("btnEnableAll");
  const btnDisableAll = document.getElementById("btnDisableAll");

  if (!api) {
    statusEl.textContent = t("optionsProviderRegistryMissing");
    return;
  }

  function t(key, substitutions) {
    const msg = chrome.i18n.getMessage(key, substitutions);
    return msg || key;
  }

  function localizeStaticTexts() {
    document.title = t("optionsTitle");
    const headingEl = document.getElementById("heading");
    const subtitleEl = document.getElementById("subtitle");
    if (headingEl) headingEl.textContent = t("optionsHeading");
    if (subtitleEl) subtitleEl.textContent = t("optionsSubtitle");
    btnEnableAll.textContent = t("optionsEnableAll");
    btnDisableAll.textContent = t("optionsDisableAll");
    modulesEl.setAttribute("aria-label", t("optionsModulesAria"));
  }

  function setStatus(message) {
    statusEl.textContent = message;
  }

  function renderModules(enabledIds) {
    const enabled = new Set(enabledIds);
    modulesEl.textContent = "";

    for (const provider of api.providers) {
      const card = document.createElement("article");
      card.className = "module";

      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.providerId = provider.id;
      checkbox.checked = enabled.has(provider.id);

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = provider.name || provider.id;
      label.append(checkbox, name);

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = t("optionsProviderMeta", [provider.sourceServerName, provider.galleryHost]);

      card.append(label, meta);
      modulesEl.append(card);
    }
  }

  function getCheckedProviderIds() {
    const ids = [];
    const checkboxes = modulesEl.querySelectorAll('input[type="checkbox"][data-provider-id]');
    for (const cb of checkboxes) {
      if (cb.checked) ids.push(cb.dataset.providerId);
    }
    return ids;
  }

  async function saveCurrentSelection() {
    const ids = getCheckedProviderIds();
    try {
      await api.saveEnabledProviderIds(ids);
      setStatus(t("optionsSaved"));
    } catch (e) {
      setStatus(t("optionsFailedSaveSettings", [String(e && e.message ? e.message : e)]));
    }
  }

  modulesEl.addEventListener("change", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches('input[type="checkbox"][data-provider-id]')) return;
    saveCurrentSelection();
  });

  btnEnableAll.addEventListener("click", async () => {
    const ids = api.getDefaultEnabledProviderIds();
    renderModules(ids);
    await saveCurrentSelection();
  });

  btnDisableAll.addEventListener("click", async () => {
    renderModules([]);
    await saveCurrentSelection();
  });

  (async function init() {
    try {
      let enabledIds;
      try {
        enabledIds = await api.loadEnabledProviderIds();
      } catch {
        enabledIds = api.getDefaultEnabledProviderIds();
      }
      renderModules(enabledIds);
      setStatus(t("optionsSettingsLoaded"));
    } catch (e) {
      renderModules(api.getDefaultEnabledProviderIds());
      setStatus(t("optionsFailedLoadSettings", [String(e && e.message ? e.message : e)]));
    }
  })();

  localizeStaticTexts();
})();
