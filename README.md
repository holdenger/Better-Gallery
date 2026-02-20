# Better Gallery

Better Gallery is a Chromium (MV3) extension that replaces supported web galleries with a cleaner, faster viewer focused on original-resolution images.

Current integration:
- `GAMES.CZ - Tiscali` (`games.tiscali.cz` / `foto.games.tiscali.cz`)

## Features

- Opens supported galleries in the Better Gallery viewer (new tab from article links).
- Keeps the original article page intact.
- "Original Gallery" button opens the source gallery with extension bypass (`ge_noext=1`).
- Keyboard navigation (`Left`, `Right`, `F`, `Esc`).
- Mouse horizontal wheel / trackpad swipe navigation.
- Prefetching for smoother image browsing.
- Download options:
  - Single image
  - Whole gallery as one ZIP (with confirmation)
- Module toggles:
  - Popup: toggle only the provider detected on the current page
  - Options page: toggle all providers globally
- Localization: English, Slovak, Czech.

## Install (Microsoft Edge / Chrome)

1. Open extensions page:
   - Edge: `edge://extensions`
   - Chrome: `chrome://extensions`
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder:
   - `/Users/michal.zila/GalleryEnhancer`

After code changes, use **Reload** on the extension card.

## Project Structure

- `manifest.json` - MV3 manifest, permissions, content scripts, popup/options wiring.
- `providers.js` - provider registry, URL matching, enabled/disabled storage, provider APIs.
- `content.js` - intercepts supported links/pages and routes to viewer.
- `viewer.html` / `viewer.css` / `viewer.js` - custom gallery viewer UI and logic.
- `popup.html` / `popup.css` / `popup.js` - action popup, active-site module toggle.
- `options.html` / `options.css` / `options.js` - global provider settings.
- `_locales/*/messages.json` - i18n strings.
- `icons/` - extension icons.

## How Module/Provider System Works

Each provider in `providers.js` should define:

- `id`, `name`, `sourceServerName`, `galleryHost`, `imageHost`
- `matchesUrl(url, base)`
- `normalizeGalleryRoot(url, base)`
- `extractStartImageId(url, base)`
- `extractImageIdFromOriginalUrl(url)`
- `buildOriginalGalleryUrl(galleryRoot, imageId)`
- `fetchGalleryImages(galleryRoot)`
- optional: `fetchGalleryTitle(galleryRoot)`

Providers are stored in `providers` array and are toggleable via `chrome.storage.sync` (`enabledProviders`).

## Development Notes

- This project is plain JavaScript/HTML/CSS (no build step).
- Keep provider logic isolated in `providers.js`.
- Keep UI text in `_locales` only.
- Avoid external runtime dependencies for security and portability.

## Roadmap Ideas

- Add more gallery providers.
- Add optional per-provider advanced settings.
- Add telemetry-free performance diagnostics (local only).

## License

Not specified yet.
