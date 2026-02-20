(() => {
  const $ = (sel) => document.querySelector(sel);

  const imgEl = $("#img");
  const loadingEl = $("#loading");
  const counterEl = $("#counter");
  const brandEl = $("#brand");

  const btnOriginal = $("#btnOriginalGallery");
  const btnOriginalLabelEl = $("#btnOriginalGalleryLabel");
  const btnFullRes = $("#btnFullRes");
  const btnFullResLabelEl = $("#btnFullResLabel");
  const btnDownloadImage = $("#btnDownloadImage");
  const btnDownloadImageLabelEl = $("#btnDownloadImageLabel");
  const btnDownloadAll = $("#btnDownloadAll");
  const btnDownloadAllLabelEl = $("#btnDownloadAllLabel");
  const btnFs = $("#btnFullscreen");
  const prevBtn = $("#prev");
  const nextBtn = $("#next");
  const providersApi = globalThis.GalleryEnhancerProviders;
  const BYPASS_PARAM = providersApi ? providersApi.BYPASS_PARAM : "ge_noext";
  const LOADING_INDICATOR_DELAY_MS = 120;
  const SWIPE_THRESHOLD_PX = 120;
  const SWIPE_COOLDOWN_MS = 45;
  const SWIPE_RELEASE_DELTA_PX = 12;
  const ZIP_MIME = "application/zip";
  const UTF8_FLAG = 0x0800;
  const ZIP_STORE = 0;
  const ZIP_VERSION = 20;
  const CRC32_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let j = 0; j < 8; j += 1) {
        c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c >>> 0;
    }
    return table;
  })();

  function t(key, substitutions) {
    const msg = chrome.i18n.getMessage(key, substitutions);
    return msg || key;
  }

  function localizeStaticTexts() {
    if (brandEl) brandEl.textContent = t("viewerBrand");
    if (btnOriginalLabelEl) btnOriginalLabelEl.textContent = t("viewerOriginalGallery");
    if (btnFullResLabelEl) btnFullResLabelEl.textContent = t("viewerShowFullRes");
    if (btnDownloadImageLabelEl) btnDownloadImageLabelEl.textContent = t("viewerDownloadImage");
    if (btnDownloadAllLabelEl) btnDownloadAllLabelEl.textContent = t("viewerDownloadGallery");
    btnFs.title = t("viewerFullscreen");
    btnFs.setAttribute("aria-label", t("viewerFullscreen"));
    prevBtn.setAttribute("aria-label", t("viewerPrev"));
    nextBtn.setAttribute("aria-label", t("viewerNext"));
    loadingEl.textContent = t("viewerLoading");
    document.title = t("extName");
  }

  function getGalleryDisplayName(galleryRoot) {
    try {
      const slugWithId = decodeURIComponent(new URL(galleryRoot).pathname.split("/").filter(Boolean).pop() || "");
      const withoutId = slugWithId.replace(/-\d+$/, "");
      const cleaned = withoutId.replace(/-/g, " ").trim();
      return cleaned || slugWithId;
    } catch {
      return "";
    }
  }

  function updateBrandWithProviderAndGallery(provider, galleryName) {
    if (!brandEl || !provider) return;
    const moduleName = provider.name || provider.id;
    const normalizedName = String(galleryName || "").trim();
    brandEl.textContent = normalizedName
      ? `${t("viewerBrand")} (${moduleName}) - ${normalizedName}`
      : `${t("viewerBrand")} (${moduleName})`;
  }

  if (!providersApi) {
    loadingEl.textContent = t("viewerProviderRegistryMissing");
    return;
  }


  function findStartIndex(images, startId) {
    if (!startId) return 0;
    // URL býva napr. .../1839176-xxx-original.png?...
    const needle1 = `/${startId}-`;
    const needle2 = `/${startId}_`;
    const idx = images.findIndex((u) => u.includes(needle1) || u.includes(needle2));
    return idx >= 0 ? idx : 0;
  }

  function withBypassParam(urlString) {
    const u = new URL(urlString);
    u.searchParams.set(BYPASS_PARAM, "1");
    return u.toString();
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function toUtf8Bytes(value) {
    return new TextEncoder().encode(String(value));
  }

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function toDosDateTime(inputDate) {
    const d = inputDate instanceof Date ? inputDate : new Date();
    const year = Math.min(2107, Math.max(1980, d.getFullYear()));
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hours = d.getHours();
    const minutes = d.getMinutes();
    const seconds = Math.floor(d.getSeconds() / 2);
    const time = ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f);
    const date = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);
    return { time, date };
  }

  function u16(value) {
    return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
  }

  function u32(value) {
    return new Uint8Array([
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff
    ]);
  }

  function concatBytes(chunks) {
    let total = 0;
    for (const c of chunks) total += c.length;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }

  function buildZip(entries) {
    const locals = [];
    const centrals = [];
    let localOffset = 0;
    const now = new Date();

    for (const entry of entries) {
      const nameBytes = toUtf8Bytes(entry.name);
      const fileBytes = entry.bytes;
      const checksum = crc32(fileBytes);
      const { time, date } = toDosDateTime(entry.mtime || now);

      const localHeader = concatBytes([
        u32(0x04034b50),
        u16(ZIP_VERSION),
        u16(UTF8_FLAG),
        u16(ZIP_STORE),
        u16(time),
        u16(date),
        u32(checksum),
        u32(fileBytes.length),
        u32(fileBytes.length),
        u16(nameBytes.length),
        u16(0),
        nameBytes
      ]);

      locals.push(localHeader, fileBytes);

      const centralHeader = concatBytes([
        u32(0x02014b50),
        u16(ZIP_VERSION),
        u16(ZIP_VERSION),
        u16(UTF8_FLAG),
        u16(ZIP_STORE),
        u16(time),
        u16(date),
        u32(checksum),
        u32(fileBytes.length),
        u32(fileBytes.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(localOffset),
        nameBytes
      ]);
      centrals.push(centralHeader);

      localOffset += localHeader.length + fileBytes.length;
    }

    const centralBytes = concatBytes(centrals);
    const end = concatBytes([
      u32(0x06054b50),
      u16(0),
      u16(0),
      u16(entries.length),
      u16(entries.length),
      u32(centralBytes.length),
      u32(localOffset),
      u16(0)
    ]);

    return concatBytes([...locals, centralBytes, end]);
  }

  function sanitizePathSegment(value, fallback) {
    const cleaned = String(value || "")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned || fallback;
  }

  function getImageBasename(imageUrl) {
    try {
      const u = new URL(imageUrl);
      const raw = u.pathname.split("/").pop() || "";
      const decoded = decodeURIComponent(raw);
      return sanitizePathSegment(decoded, "image.jpg");
    } catch {
      return "image.jpg";
    }
  }

  function getGalleryFolderName() {
    const slug = state.galleryRoot.split("/").filter(Boolean).pop() || "gallery";
    return sanitizePathSegment(slug, "gallery");
  }

  function getArchiveFolderName() {
    const sourceName = state.provider && state.provider.sourceServerName
      ? state.provider.sourceServerName
      : "unknown-source";
    return sanitizePathSegment(
      `Gallery-Enhancer_${sourceName}_${getGalleryFolderName()}`,
      `Gallery-Enhancer_${sourceName}_gallery`
    );
  }

  function buildDownloadFilename(index, imageUrl) {
    const folder = getArchiveFolderName();
    const base = getImageBasename(imageUrl);
    const prefix = String(index + 1).padStart(3, "0");
    return `${folder}/${prefix}-${base}`;
  }

  function buildGalleryZipFilename() {
    return `${getArchiveFolderName()}.zip`;
  }

  async function downloadUrl(imageUrl, filename) {
    if (!chrome.downloads || !chrome.downloads.download) {
      throw new Error(t("viewerDownloadsApiUnavailable"));
    }

    await new Promise((resolve, reject) => {
      chrome.downloads.download(
        {
          url: imageUrl,
          filename,
          saveAs: false,
          conflictAction: "uniquify"
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (typeof downloadId !== "number") {
            reject(new Error(t("viewerDownloadDidNotStart")));
            return;
          }
          resolve(downloadId);
        }
      );
    });
  }

  function triggerObjectUrlDownload(objectUrl, filename) {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.rel = "noreferrer noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function setDownloadAllUi(isBusy, label) {
    btnDownloadAll.disabled = isBusy;
    const text = isBusy ? label || t("viewerPreparingZip") : t("viewerDownloadGallery");
    if (btnDownloadAllLabelEl) btnDownloadAllLabelEl.textContent = text;
  }

  async function downloadCurrentImage() {
    if (!state.images.length) return;
    const imageUrl = state.images[state.index];
    const filename = buildDownloadFilename(state.index, imageUrl);
    try {
      await downloadUrl(imageUrl, filename);
    } catch (e) {
      loadingEl.textContent = t("viewerDownloadFailed", [String(e && e.message ? e.message : e)]);
      loadingEl.style.display = "block";
    }
  }

  async function fetchImageBytes(imageUrl) {
    const resp = await fetch(imageUrl, {
      method: "GET",
      credentials: "omit",
      referrer: "https://games.tiscali.cz/",
      referrerPolicy: "no-referrer-when-downgrade"
    });
    if (!resp.ok) {
      throw new Error(t("viewerFetchImageFailedHttp", [String(resp.status)]));
    }
    const buffer = await resp.arrayBuffer();
    return new Uint8Array(buffer);
  }

  async function downloadAllImages() {
    if (!state.images.length || state.downloadingAll) return;
    const archiveName = buildGalleryZipFilename();
    const confirmed = window.confirm(
      t("viewerConfirmZip", [String(state.images.length), archiveName])
    );
    if (!confirmed) return;

    state.downloadingAll = true;
    setDownloadAllUi(true, t("viewerPreparingZip"));
    try {
      const entries = [];
      for (let i = 0; i < state.images.length; i += 1) {
        setDownloadAllUi(true, t("viewerZippingProgress", [String(i + 1), String(state.images.length)]));
        const bytes = await fetchImageBytes(state.images[i]);
        entries.push({ name: buildDownloadFilename(i, state.images[i]), bytes });
        await sleep(40);
      }
      const zipBytes = buildZip(entries);
      const blob = new Blob([zipBytes], { type: ZIP_MIME });
      const objectUrl = URL.createObjectURL(blob);
      try {
        triggerObjectUrlDownload(objectUrl, buildGalleryZipFilename());
        await sleep(100);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch (e) {
      loadingEl.textContent = t("viewerBatchDownloadFailed", [String(e && e.message ? e.message : e)]);
      loadingEl.style.display = "block";
    } finally {
      state.downloadingAll = false;
      setDownloadAllUi(false);
    }
  }

  function updateOriginalGalleryLink(imageUrl) {
    if (!state.provider) return;
    const imageId = state.provider.extractImageIdFromOriginalUrl
      ? state.provider.extractImageIdFromOriginalUrl(imageUrl)
      : null;
    const originalUrl = state.provider.buildOriginalGalleryUrl
      ? state.provider.buildOriginalGalleryUrl(state.galleryRoot, imageId)
      : (imageId ? `${state.galleryRoot}/${imageId}` : state.galleryRoot);
    btnOriginal.href = withBypassParam(originalUrl);
  }

  function setCounter(i, total) {
    counterEl.textContent = `${i + 1}/${total}`;
  }

  function clearLoadingUi() {
    if (state.loadingTimer) {
      clearTimeout(state.loadingTimer);
      state.loadingTimer = null;
    }
    loadingEl.textContent = t("viewerLoading");
    loadingEl.style.display = "none";
  }

  function scheduleLoadingUi() {
    if (state.loadingTimer) clearTimeout(state.loadingTimer);
    state.loadingTimer = setTimeout(() => {
      loadingEl.textContent = t("viewerLoading");
      loadingEl.style.display = "block";
      state.loadingTimer = null;
    }, LOADING_INDICATOR_DELAY_MS);
  }

  function preloadImage(url) {
    return new Promise((resolve, reject) => {
      const pre = new Image();
      pre.referrerPolicy = "no-referrer-when-downgrade";
      pre.onload = () => resolve();
      pre.onerror = () => reject(new Error(t("viewerFailedLoadImage")));
      pre.src = url;
    });
  }

  function prefetchImage(url) {
    if (!url || state.prefetched.has(url)) return;
    state.prefetched.add(url);
    const img = new Image();
    img.referrerPolicy = "no-referrer-when-downgrade";
    img.src = url;
  }

  function prefetchNextImage() {
    if (!state.images.length) return;
    const prefetchCount = Math.min(2, state.images.length - 1);
    for (let step = 1; step <= prefetchCount; step += 1) {
      const nextIndex = (state.index + step) % state.images.length;
      prefetchImage(state.images[nextIndex]);
    }
  }

  async function showImage(i) {
    const url = state.images[i];
    state.index = i;

    setCounter(i, state.images.length);
    updateOriginalGalleryLink(url);
    btnFullRes.href = url;
    prefetchNextImage();

    const loadToken = ++state.loadToken;
    scheduleLoadingUi();

    try {
      await preloadImage(url);
      if (loadToken !== state.loadToken) return;

      imgEl.src = url;
      imgEl.style.display = "block";
      clearLoadingUi();
    } catch (e) {
      if (loadToken !== state.loadToken) return;
      if (state.loadingTimer) {
        clearTimeout(state.loadingTimer);
        state.loadingTimer = null;
      }
      loadingEl.textContent = String(e && e.message ? e.message : e);
      loadingEl.style.display = "block";
    }
  }

  function prev() {
    if (!state.images.length) return;
    const i = (state.index - 1 + state.images.length) % state.images.length;
    showImage(i);
  }

  function next() {
    if (!state.images.length) return;
    const i = (state.index + 1) % state.images.length;
    showImage(i);
  }

  async function toggleFullscreen() {
    const isFs = !!document.fullscreenElement;
    try {
      if (!isFs) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore rejected fullscreen requests (e.g. not triggered by user gesture).
    }
  }

  function syncFullscreenUi() {
    const isFs = !!document.fullscreenElement;
    document.body.classList.toggle("is-fullscreen", isFs);
  }

  function handleHorizontalWheel(e) {
    if (!state.images.length) return;

    const absX = Math.abs(e.deltaX);
    const absY = Math.abs(e.deltaY);
    if (absX < 1) return;
    if (absY > absX) return;

    const now = Date.now();
    if (state.wheelGestureConsumed) {
      const cooldownPassed = now - state.lastWheelNavAt >= SWIPE_COOLDOWN_MS;
      const movementQuiet = absX <= SWIPE_RELEASE_DELTA_PX;
      if (cooldownPassed && movementQuiet) {
        state.wheelGestureConsumed = false;
        state.wheelAccumX = 0;
      } else {
        return;
      }
    }

    state.wheelAccumX += e.deltaX;
    if (Math.abs(state.wheelAccumX) < SWIPE_THRESHOLD_PX) return;

    e.preventDefault();
    const goNext = state.wheelAccumX > 0;
    state.wheelAccumX = 0;
    state.wheelGestureConsumed = true;
    state.lastWheelNavAt = now;
    if (goNext) next();
    else prev();
  }

  const state = {
    provider: null,
    providerId: null,
    galleryRoot: null,
    images: [],
    index: 0,
    downloadingAll: false,
    prefetched: new Set(),
    loadToken: 0,
    loadingTimer: null,
    wheelAccumX: 0,
    wheelGestureConsumed: false,
    lastWheelNavAt: 0
  };

  // controls
  prevBtn.addEventListener("click", prev);
  nextBtn.addEventListener("click", next);
  btnDownloadImage.addEventListener("click", downloadCurrentImage);
  btnDownloadAll.addEventListener("click", downloadAllImages);
  btnFs.addEventListener("click", toggleFullscreen);

  document.addEventListener("fullscreenchange", syncFullscreenUi);
  document.addEventListener("wheel", handleHorizontalWheel, { passive: false });

  const showPointerNav = () => {
    document.body.classList.remove("keyboard-nav");
  };
  document.addEventListener("mousemove", showPointerNav);
  document.addEventListener("pointermove", showPointerNav);
  document.addEventListener("pointerdown", showPointerNav);
  document.addEventListener("touchstart", showPointerNav, { passive: true });

  // keyboard
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") {
      document.body.classList.add("keyboard-nav");
      prev();
    } else if (e.key === "ArrowRight") {
      document.body.classList.add("keyboard-nav");
      next();
    }
    else if (e.key === "f" || e.key === "F") toggleFullscreen();
    else if (e.key === "Escape" && document.fullscreenElement) document.exitFullscreen();
  });

  // init
  (async function init() {
    localizeStaticTexts();
    const params = new URLSearchParams(location.search);
    const providerIdParam = params.get("provider");
    const gallery = params.get("gallery");
    const start = params.get("start");

    if (!gallery) {
      loadingEl.textContent = t("viewerMissingGalleryParam");
      return;
    }
    const provider = providerIdParam
      ? providersApi.getProviderById(providerIdParam)
      : providersApi.detectProviderForUrl(gallery, location.href);
    if (!provider) {
      loadingEl.textContent = t("viewerUnknownProvider");
      return;
    }
    let enabledProviderIds;
    try {
      enabledProviderIds = new Set(await providersApi.loadEnabledProviderIds());
    } catch {
      enabledProviderIds = new Set(providersApi.getDefaultEnabledProviderIds());
    }
    if (!enabledProviderIds.has(provider.id)) {
      loadingEl.textContent = t("viewerProviderDisabled", [provider.name || provider.id]);
      return;
    }

    const normalizedGallery = provider.normalizeGalleryRoot(gallery, location.href);
    if (!normalizedGallery) {
      loadingEl.textContent = t("viewerInvalidGalleryUrl");
      return;
    }

    state.provider = provider;
    state.providerId = provider.id;
    state.galleryRoot = normalizedGallery;
    btnOriginal.href = withBypassParam(normalizedGallery);
    updateBrandWithProviderAndGallery(provider, getGalleryDisplayName(normalizedGallery));

    loadingEl.textContent = t("viewerLoading");

    if (provider.fetchGalleryTitle) {
      provider.fetchGalleryTitle(normalizedGallery)
        .then((title) => {
          if (title) {
            document.title = title;
            updateBrandWithProviderAndGallery(provider, title);
          }
        })
        .catch(() => {});
    }

    try {
      const images = await provider.fetchGalleryImages(normalizedGallery);
      state.images = images;
      state.index = findStartIndex(images, start);

      setCounter(state.index, state.images.length);
      showImage(state.index);
      syncFullscreenUi();
    } catch (e) {
      loadingEl.textContent = String(e && e.message ? e.message : e);
    }
  })();
})();
