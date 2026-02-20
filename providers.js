(() => {
  const BYPASS_PARAM = "ge_noext";
  const ENABLED_PROVIDERS_KEY = "enabledProviders";

  function toUrl(urlString, baseHref) {
    try {
      return new URL(urlString, baseHref);
    } catch {
      return null;
    }
  }

  function stripJsonp(text) {
    const t = text.trim();
    const m = t.match(/^[a-zA-Z0-9_]+\(([\s\S]*)\)\s*;?\s*$/);
    return m ? m[1] : t;
  }

  function t(key, substitutions) {
    if (!chrome || !chrome.i18n || !chrome.i18n.getMessage) return key;
    const msg = chrome.i18n.getMessage(key, substitutions);
    return msg || key;
  }

  function collectStrings(node, out) {
    if (node == null) return;
    if (typeof node === "string") {
      out.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const x of node) collectStrings(x, out);
      return;
    }
    if (typeof node === "object") {
      for (const k of Object.keys(node)) collectStrings(node[k], out);
    }
  }

  function uniqPreserveOrder(arr) {
    const seen = new Set();
    const out = [];
    for (const x of arr) {
      if (!seen.has(x)) {
        seen.add(x);
        out.push(x);
      }
    }
    return out;
  }

  function decodeHtmlEntities(text) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(text), "text/html");
    return (doc.documentElement.textContent || "").trim();
  }

  function extractTitleFromHtml(html) {
    const m = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!m) return null;
    const decoded = decodeHtmlEntities(m[1]).replace(/\s+/g, " ").trim();
    return decoded || null;
  }

  function isBypassRequested(urlString, baseHref) {
    const u = toUrl(urlString, baseHref);
    return !!u && u.searchParams.get(BYPASS_PARAM) === "1";
  }

  const tiscaliProvider = {
    id: "tiscali-games",
    name: "GAMES.CZ - Tiscali",
    sourceServerName: "games.tiscali.cz",
    galleryHost: "foto.games.tiscali.cz",
    imageHost: "im.tiscali.cz",

    matchesUrl(urlString, baseHref) {
      const u = toUrl(urlString, baseHref);
      if (!u) return false;
      return (
        u.hostname === "games.tiscali.cz" ||
        u.hostname === "foto.games.tiscali.cz" ||
        u.hostname === "im.tiscali.cz"
      );
    },

    normalizeGalleryRoot(urlString, baseHref) {
      const u = toUrl(urlString, baseHref);
      if (!u || u.protocol !== "https:" || u.hostname !== this.galleryHost) return null;
      const m = u.pathname.match(/^\/([^/?#]+-\d+)(?:\/\d+)?\/?$/);
      if (!m) return null;
      return `https://${u.hostname}/${m[1]}`;
    },

    extractStartImageId(urlString, baseHref) {
      const u = toUrl(urlString, baseHref);
      if (!u || u.hostname !== this.galleryHost) return null;
      const m = u.pathname.match(/^\/[^/?#]+-\d+\/(\d+)\/?$/);
      return m ? m[1] : null;
    },

    extractImageIdFromOriginalUrl(urlString) {
      const m = String(urlString).match(/\/(\d+)[-_][^/]*-original\.(?:png|jpe?g|webp)(?:\?|$)/i);
      return m ? m[1] : null;
    },

    buildOriginalGalleryUrl(galleryRoot, imageId) {
      return imageId ? `${galleryRoot}/${imageId}` : galleryRoot;
    },

    async fetchGalleryImages(galleryRoot) {
      const url = galleryRoot.includes("?") ? `${galleryRoot}&json=1` : `${galleryRoot}?json=1`;
      const resp = await fetch(url, {
        method: "GET",
        credentials: "omit",
        referrer: "https://games.tiscali.cz/",
        referrerPolicy: "no-referrer-when-downgrade"
      });
      if (!resp.ok) {
        throw new Error(t("providerGalleryJsonFailedHttp", [String(resp.status)]));
      }

      const raw = stripJsonp(await resp.text());
      let obj;
      try {
        obj = JSON.parse(raw);
      } catch {
        throw new Error(t("providerGalleryJsonParseFailed"));
      }

      const strings = [];
      collectStrings(obj, strings);
      const originals = strings
        .map((s) => (typeof s === "string" ? s.replace(/&amp;/g, "&") : s))
        .filter((s) => new RegExp(`^https?:\\/\\/${this.imageHost.replace(/\./g, "\\.")}\\/`, "i").test(s))
        .filter((s) => /-original\.(png|jpe?g|webp)(\?|$)/i.test(s));

      const images = uniqPreserveOrder(originals);
      if (!images.length) {
        throw new Error(t("providerNoOriginalImages"));
      }
      return images;
    },

    async fetchGalleryTitle(galleryRoot) {
      const resp = await fetch(galleryRoot, {
        method: "GET",
        credentials: "omit",
        referrer: "https://games.tiscali.cz/",
        referrerPolicy: "no-referrer-when-downgrade"
      });
      if (!resp.ok) return null;
      return extractTitleFromHtml(await resp.text());
    }
  };

  const providers = [tiscaliProvider];

  function getDefaultEnabledProviderIds() {
    return providers.map((p) => p.id);
  }

  function normalizeEnabledProviderIds(value) {
    if (!Array.isArray(value)) return getDefaultEnabledProviderIds();
    const known = new Set(providers.map((p) => p.id));
    return value.filter((id) => known.has(id));
  }

  async function loadEnabledProviderIds() {
    const fallback = getDefaultEnabledProviderIds();
    if (!chrome.storage || !chrome.storage.sync) {
      return fallback;
    }
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        resolve(value);
      };

      const timer = setTimeout(() => finish(fallback), 500);
      try {
        chrome.storage.sync.get({ [ENABLED_PROVIDERS_KEY]: null }, (result) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            finish(fallback);
            return;
          }
          const raw = result[ENABLED_PROVIDERS_KEY];
          if (raw == null) {
            finish(fallback);
            return;
          }
          finish(normalizeEnabledProviderIds(raw));
        });
      } catch {
        clearTimeout(timer);
        finish(fallback);
      }
    });
  }

  async function saveEnabledProviderIds(ids) {
    const normalized = normalizeEnabledProviderIds(ids);
    if (!chrome.storage || !chrome.storage.sync) return normalized;
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.sync.set({ [ENABLED_PROVIDERS_KEY]: normalized }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(normalized);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function getProviderById(id) {
    if (!id) return null;
    return providers.find((p) => p.id === id) || null;
  }

  function detectProviderForUrl(urlString, baseHref) {
    for (const provider of providers) {
      if (provider.matchesUrl(urlString, baseHref)) return provider;
    }
    return null;
  }

  globalThis.GalleryEnhancerProviders = {
    BYPASS_PARAM,
    ENABLED_PROVIDERS_KEY,
    providers,
    isBypassRequested,
    getDefaultEnabledProviderIds,
    normalizeEnabledProviderIds,
    loadEnabledProviderIds,
    saveEnabledProviderIds,
    getProviderById,
    detectProviderForUrl
  };
})();
