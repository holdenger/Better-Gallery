(() => {
  const LOG_PREFIX = "[Gallery Enhancer]";
  const providersApi = globalThis.GalleryEnhancerProviders;

  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }

  if (!providersApi) {
    log("Provider registry is missing.");
    return;
  }

  function isContextInvalidatedError(err) {
    const msg = String(err && err.message ? err.message : err);
    return msg.includes("Extension context invalidated");
  }

  async function isProviderEnabled(providerId) {
    try {
      if (!chrome || !chrome.runtime || !chrome.runtime.id) return false;
      const enabledProviderIds = await providersApi.loadEnabledProviderIds();
      return new Set(enabledProviderIds).has(providerId);
    } catch (e) {
      if (isContextInvalidatedError(e)) return false;
      return new Set(providersApi.getDefaultEnabledProviderIds()).has(providerId);
    }
  }

  function toViewerUrl(providerId, galleryRoot, startImageId) {
    const base = chrome.runtime.getURL("viewer.html");
    const params = new URLSearchParams();
    params.set("provider", providerId);
    params.set("gallery", galleryRoot);
    if (startImageId) params.set("start", startImageId);
    return `${base}?${params.toString()}`;
  }

  (async function init() {
    if (providersApi.isBypassRequested(location.href, location.href)) {
      log("Bypass flag detected, leaving page untouched.");
      return;
    }

    const currentProvider = providersApi.detectProviderForUrl(location.href, location.href);
    if (currentProvider && await isProviderEnabled(currentProvider.id)) {
      const root = currentProvider.normalizeGalleryRoot(location.href, location.href);
      if (root) {
        const start = currentProvider.extractStartImageId(location.href, location.href);
        const viewer = toViewerUrl(currentProvider.id, root, start);
        log("Redirecting gallery page to viewer:", viewer);
        location.replace(viewer);
        return;
      }
    }

    async function handleDocumentClick(ev) {
      try {
        if (ev.defaultPrevented) return;
        if (ev.button !== 0) return;
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;

        const a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
        if (!a) return;
        if (a.target && a.target !== "_self") return;
        if (a.hasAttribute("download")) return;

        const abs = a.href;
        const provider = providersApi.detectProviderForUrl(abs, location.href);
        if (!provider) return;

        const root = provider.normalizeGalleryRoot(abs, location.href);
        if (!root) return;

        // Block browser navigation immediately to avoid opening both tabs
        // when async settings lookup resolves slightly later.
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();

        if (!(await isProviderEnabled(provider.id))) {
          // Module disabled: proceed to original link target.
          location.href = abs;
          return;
        }

        const start = provider.extractStartImageId(abs, location.href);

        const viewer = toViewerUrl(provider.id, root, start);
        log("Opening viewer:", viewer);
        window.open(viewer, "_blank", "noopener,noreferrer");
      } catch (e) {
        if (!isContextInvalidatedError(e)) {
          log("click handler failed:", e);
        }
      }
    }

    document.addEventListener(
      "click",
      (ev) => {
        void handleDocumentClick(ev);
      },
      true
    );

    log("loaded on", location.href);
  })().catch((e) => {
    log("failed to initialize module settings:", e);
  });
})();
