# Browser Compatibility Report: Edge MV3 and Safari MV3

Date: 2026-09-10

Scope: feasibility validation only. No store submission was performed. A disposable macOS Xcode packaging project was generated under `/tmp` to obtain Apple compatibility diagnostics; it is not a product deliverable. This report covers same-browser, same-account sync only. It does not propose or validate cross-browser sync between Chrome, Microsoft Edge, and Safari.

## Executive Result

Current WXT builds can generate both Edge MV3 and Safari MV3 extension folders from the existing project:

- Edge MV3: feasible as a Chromium extension build, with store/listing wording and sideload QA still required.
- Safari MV3: buildable and packageable as a macOS Safari Web Extension, but full Bookmark Atlas parity is currently a no-go. Apple's packager reports the core `bookmarks`, `history`, and `search` manifest permissions as unsupported by the Safari version installed on this Mac.

The build now generates browser-specific manifests: Chrome and Edge retain the Chromium favicon and host-access DNR permissions, while Safari omits `favicon` and the YouTube header-modification DNR capability, removes `minimum_chrome_version`, and declares a Safari 17 minimum. Runtime product wording is browser-neutral; store listings remain platform-specific.

## Commands Run

```sh
./node_modules/.bin/wxt --help
./node_modules/.bin/wxt build --help
./node_modules/.bin/wxt build -b edge --mv3
./node_modules/.bin/wxt build -b safari --mv3
npm run typecheck
xcrun --find safari-web-extension-converter
xcrun --find safari-web-extension-packager
xcrun safari-web-extension-converter --help
xcrun safari-web-extension-packager --help
xcrun safari-web-extension-packager --project-location /tmp/<temporary-project> --app-name "Bookmark Atlas" --bundle-identifier com.xixikitchen.bookmarkatlas --swift --macos-only --copy-resources --no-open --no-prompt /tmp/<temporary-web-extension>
```

## Local Results

| Target | Command | Result | Output |
| --- | --- | --- | --- |
| Edge MV3 | `./node_modules/.bin/wxt build -b edge --mv3` | Passed | `output/edge-mv3/` |
| Safari MV3 | `./node_modules/.bin/wxt build -b safari --mv3` | Passed | `output/safari-mv3/` |
| TypeScript | `npm run typecheck` | Passed | `tsc --noEmit` |
| Safari tools | `xcrun --find safari-web-extension-converter` | Present | `/Applications/Xcode.app/Contents/Developer/usr/bin/safari-web-extension-converter` |
| Safari tools | `xcrun --find safari-web-extension-packager` | Present | `/Applications/Xcode.app/Contents/Developer/usr/bin/safari-web-extension-packager` |
| Safari package probe | `xcrun safari-web-extension-packager ...` | Xcode project generated with warnings | Disposable project under `/tmp` |

Apple packager diagnostic:

```text
Warning: The following keys in your manifest.json are not supported by your current version of Safari:
  history
  search
  bookmarks
```

This warning affects Bookmark Atlas's core product rather than an optional enhancement. A Safari build without those APIs would not provide the same native-bookmark or unified-search experience as Chrome and Edge.

Build output:

- `output/edge-mv3`: about 8.4 MiB, including the onboarding background service worker.
- `output/safari-mv3`: about 8.4 MiB, including the onboarding background service worker.
- Both builds warn that some Excalidraw-related chunks exceed 500 kB after minification. The main new-tab bundle is about 1.5 MiB and the largest shared Excalidraw subset chunk is about 1.82 MiB.

## Generated Manifest Snapshot

The current Edge manifest contains:

```json
{
  "manifest_version": 3,
  "version": "0.9.3",
  "default_locale": "en",
  "permissions": [
    "bookmarks",
    "storage",
    "favicon",
    "history",
    "tabs",
    "search",
    "declarativeNetRequestWithHostAccess"
  ],
  "host_permissions": [
    "https://suggestion.baidu.com/*",
    "https://api.bing.com/*",
    "https://suggestqueries.google.com/*",
    "https://www.youtube.com/*"
  ],
  "minimum_chrome_version": "114",
  "chrome_url_overrides": {
    "newtab": "newtab.html"
  }
}
```

The Safari manifest differs in the following relevant fields:

```json
{
  "version": "0.9.3",
  "permissions": [
    "bookmarks",
    "storage",
    "history",
    "tabs",
    "search"
  ],
  "browser_specific_settings": {
    "safari": {
      "strict_min_version": "17.0"
    }
  }
}
```

English generated description:

```text
An Excalidraw-powered new tab with persistent web embeds and native browser bookmark cards.
```

Chinese generated description:

```text
把浏览器原生书签、搜索和完整 Excalidraw 画布放进一个可同步的新标签页。
```

## Edge Assessment

Status: likely feasible after sideload testing and Edge-specific metadata cleanup.

Evidence:

- WXT generated a valid `edge-mv3` build without build errors.
- Microsoft documents Chrome extension API and manifest compatibility with Microsoft Edge, while still requiring API review and sideload testing.
- The generated manifest has no `update_url`, which avoids one common Edge porting issue.

Main risks:

1. Store wording: runtime and manifest wording are now browser-neutral, and `docs/edge-store-listing.md` contains an Edge-specific bilingual draft. Final Partner Center fields still need review during submission.
2. Permissions: `bookmarks`, `history`, `tabs`, `search`, remote suggestion host permissions, YouTube host access, and `declarativeNetRequestWithHostAccess` are all explainable by product behavior, but they will require clear privacy/store justifications.
3. Performance: the build succeeds, but the large Excalidraw chunks could slow first load on lower-end devices. This is not an Edge blocker, but code splitting remains a practical follow-up.
4. Runtime QA still required: build success does not prove Edge runtime behavior for bookmark CRUD, history/tab search, `_favicon`, DNR YouTube embed headers, and `chrome.storage.sync`.

Sync boundary:

- Edge sync should be treated as same Microsoft Edge profile/account only.
- It should not be described as syncing with Chrome Web Store users or Safari/iCloud users.

## Safari Assessment

Status: packageable, but no-go for a full-parity public release on the Safari version tested.

Evidence:

- WXT generated a `safari-mv3` build when explicitly passed `--mv3`.
- WXT documentation says Safari defaults to MV2 unless `--mv3` is specified.
- Apple/WebKit documents Safari Web Extension support for Manifest V3, service workers, and declarativeNetRequest APIs.
- Apple tools are present locally. A disposable macOS Xcode project was generated successfully under `/tmp`, and the packager reported `history`, `search`, and `bookmarks` as unsupported manifest keys.

Main risks:

1. Core product parity: Apple's packager reports `bookmarks`, `history`, and `search` as unsupported. Removing those permissions would also remove Bookmark Atlas's native bookmark management and much of unified pre-search.
2. Packaging: Safari users do not install a raw WXT output folder as a normal production app. Apple requires packaging/distribution through a containing app, Xcode tooling, or the Safari Web Extension Packager/App Store Connect flow.
3. Favicon behavior: the app uses Chrome's `_favicon` extension URL pattern. The Safari manifest now omits the Chrome-only `favicon` permission, so Safari would fall back to text marks until a native alternative is designed.
4. Search behavior: the packager explicitly reports `search` as unsupported. The URL fallback can perform a web search, but it cannot promise the user's Safari default provider and does not restore history/bookmark search.
5. DNR YouTube header rule: the Safari build deliberately skips Chrome's YouTube `modifyHeaders` identity rule and omits its DNR permission. Safari therefore cannot claim the same YouTube Error 153 mitigation as Chrome/Edge without a separately validated implementation.
6. Storage sync: `chrome.storage.sync` is the current Chrome cross-device canvas/preference mechanism. Safari implements the `storage.sync` storage surface but Apple explicitly states that syncing is not supported. A Safari-to-Safari implementation therefore needs a separate native iCloud/CloudKit bridge, or it must ship as local-only until that bridge exists.
7. Web embeds: the CSP allows `frame-src https:` plus localhost. That matches the product's free-form Excalidraw web embed direction, but Safari/App Store review may scrutinize broad third-party iframe behavior and host permissions.

Sync boundary:

- Safari support cannot currently claim cross-device canvas synchronization from the WebExtension build alone. Same-browser Safari sync requires a separately designed and tested iCloud/CloudKit path.
- No current mechanism synchronizes Excalidraw scenes between Chrome `chrome.storage.sync`, Edge sync, and Safari/iCloud.

## API and Permission Inventory

| Area | Current usage | Edge outlook | Safari outlook |
| --- | --- | --- | --- |
| New tab override | `chrome_url_overrides.newtab` | Expected compatible; sideload required | Supported in modern Safari Web Extensions, but Safari runtime UX must be tested |
| Bookmarks | `chrome.bookmarks` CRUD/events | Expected compatible | Packager reports `bookmarks` unsupported; full native bookmark parity is blocked on the tested Safari version |
| Storage local/sync | `chrome.storage.local`, `chrome.storage.sync`, `storage.onChanged` | Expected compatible; sync is Edge-account scoped | Local storage is usable; `storage.sync` does not actually sync, so Safari-to-Safari data sync needs a native iCloud/CloudKit bridge |
| History | `chrome.history.search` | Expected compatible | Packager reports `history` unsupported |
| Tabs | `chrome.tabs.query/update` paths in search | Expected compatible | Permission/API support must be verified in Safari runtime |
| Search | `chrome.search.query` with URL fallback | Expected compatible if Edge exposes it | Packager reports `search` unsupported; URL fallback cannot restore native provider behavior |
| Favicons | `chrome.runtime.getURL("_favicon/")`, `favicon` permission | Expected Chrome/Edge compatible | High risk; likely needs Safari fallback |
| DNR | YouTube Referer header rule via `declarativeNetRequestWithHostAccess` | Expected compatible, store-review sensitive | Deliberately disabled in the feasibility build; Chrome/Edge YouTube identity mitigation is not claimed |
| Compression | `CompressionStream` if present, plain base64 fallback | Expected compatible or fallback | Fallback exists, but uncompressed scenes hit sync quota sooner |
| BroadcastChannel | same-device tab sync | Expected web-platform support | Expected web-platform support, but extension-page behavior needs smoke test |

## Recommended Next Steps

1. Edge: sideload `output/edge-mv3/` in Microsoft Edge and test bookmark CRUD, tab/history search, favicon rendering, search execution, YouTube embed behavior, and same Edge-account sync.
2. Edge: after acceptance, reconcile `docs/edge-store-listing.md` with the final package and submit it through Microsoft Partner Center.
3. Safari: do not submit the current build. Decide later whether a reduced Safari edition without native bookmarks/history is worthwhile, or whether to fund a larger native Safari companion plus iCloud/CloudKit bridge.
4. Safari: only resume implementation after explicitly accepting a product scope different from the Chrome/Edge edition; the current full-parity target is a no-go.
5. Product copy: keep runtime terminology browser-neutral and use platform-specific wording only in each store listing.
6. Sync disclosure: document that Chrome and Edge sync are same browser plus same account only. Do not promise Safari cross-device data sync until the native iCloud/CloudKit bridge exists, and do not promise Chrome-to-Edge, Edge-to-Safari, or Chrome-to-Safari synchronization.

## Sources Consulted

- WXT Targeting Different Browsers: https://wxt.dev/guide/essentials/target-different-browsers
- WXT Manifest configuration: https://wxt.dev/guide/essentials/config/manifest.html
- Microsoft Edge Chrome extension porting guide: https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension
- Chrome declarativeNetRequest API: https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
- Apple Safari Web Extensions overview: https://developer.apple.com/documentation/safariservices/safari-web-extensions
- Apple Safari Web Extension packaging with App Store Connect: https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect
- Apple Safari Web Extension browser compatibility (`storage.sync` does not sync): https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility
- WebKit Safari 15.4 Web Extensions notes: https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/
- WebKit Safari 26.0 Web Extensions notes: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- MDN WebExtensions Chrome incompatibilities: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities
- MDN WebExtensions bookmarks API: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/bookmarks
- MDN WebExtensions search.query API: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/search/query
