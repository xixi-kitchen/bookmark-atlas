# Edge desktop adaptation — 2026-10-26

Scope: PLAN-004, current code based on local 84123cd, including the accepted community/embed changes and disabled optional support configuration. This is a development acceptance candidate, not a store release. No Chrome package/tag, public channel, website deployment, account sign-in or cross-browser sync was changed.

## Compatibility and implementation

- Reuse WXT's existing `edge --mv3` target and the `chrome.*` API namespace. Microsoft documents these as the porting path; the APIs used for bookmarks/history/tabs/search/storage/permissions/DNR are listed for desktop Edge. Retain `minimum_chrome_version`, not the legacy `minimum_edge_version` key. The current 114 floor is inherited, not an assertion that all versions back to 114 were tested.
- Display the built-in default engine through a localized browser-neutral label, including the trigger, menu, manager, accessibility label, placeholder and direct-search suggestion. Preserve the persisted `chrome-default` ID/kind and all custom engine names; no destructive preference migration.
- Selected-target manifest checks compare the actual build to package.json; Edge rejects a foreign `update_url`. `check:edge` now also checks release metadata and generated site content without marking Edge published.
- Existing Chrome test packaging remains compatible. `node scripts/create-sync-test-package.mjs edge` adds an independent fixed public identity, ZIP/checksum, a visible extracted directory and bilingual instructions. Invalid source/target/version, private keys, conflict paths or symlinks fail before replacing old artifacts. No new dependency or browser permission.
- Edge candidate copy now describes AI data disclosure, local encrypted credentials, optional origin permission, popup capture, language/learning and separate native-favorite/canvas sync. Public Edge install/privacy pages and final store disclosures remain submission prerequisites; the deployed Chrome website remains accurate for its published edition.

## Official references checked in this round

- https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension
- https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/api-support
- https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/manifest-format
- https://support.microsoft.com/en-us/edge/change-and-customize-sync-settings-in-microsoft-edge
- https://learn.microsoft.com/en-us/deployedge/microsoft-edge-troubleshoot-enterprise-sync
- https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension
- https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies

API availability or a successful storage.sync write does not prove remote transport. A matching development key ensures matching IDs only, not eligibility for remote sync or a future Add-ons identity. Record account settings/policies and verify actual receipt on another device. No delivery-time guarantee or custom cloud backend is added.

## Local native Edge smoke

Environment: macOS, Microsoft Edge Stable **156.0.4314.42** universal. No existing Edge app found in standard application directories. Downloaded the official Microsoft macOS package from the Microsoft update feed; SHA256 matched **e89327a5ac7488a797ad63822cb47d77dcfefdf6aba4d4e8e01a8fe551158ba0**. Package trusted/notarized, app `codesign --verify --deep --strict` passed outside the sandbox. No signature/Gatekeeper protection bypass.

Extraction under the desktop file-provider directory gained FinderInfo metadata, causing strict app verification to reject that metadata; copying without resource/extended attributes to `/private/tmp/bookmark-atlas-edge-runtime-20261026/Microsoft Edge.app` resolved it. Sandboxed signature checks also could not reach the system trust service; successful unsandboxed read-only checks are the evidence used. No package installer scripts were executed and no system-wide app/updater installation performed.

Disposable profile: `output/edge-qa-profile-20261026`. Only synthetic favorites and public example pages; no import from Chrome, no Microsoft sign-in, no actual API key, no user bookmarks/financial QR images. Tests used native computer use, not Chrome browser-control plugins or a debug protocol.

Observed:

- Edge Load Unpacked succeeded with **fmikkfohgeimnehehdijgfmjdmkalnfd**, name **Bookmark Atlas Edge Sync Test**, version **0.9.6**. New-tab override required Edge's normal Keep Changes confirmation in this disposable profile and then loaded the real extension.
- First-run optional learning appeared; choosing Explore on my own dismissed it. Default Excalidraw canvas/theme loaded.
- Created native `Edge QA · Excalidraw` favorite at `https://excalidraw.com/`; native favorites bar and extension list updated. Imported the actual favorite into the canvas through the picker.
- English/Chinese settings changed the app and Excalidraw labels immediately; another new tab restored both preference and card.
- On the second tab changed the card to Detailed and saved `EDGE LIVE TAB CHECK 2026-10-26`; the first tab showed the new style/note and the explicit automatically-applied-another-tab notification without refresh/conflict prompt.
- AI settings opened with the correct local/encrypted/no-sync notices and expected model/connection controls. No real provider request or credential persistence claim is made from opening the UI alone.
- On public example.com, toolbar popup captured Example Domain with Open canvas after adding unchecked. It reported success without leaving the page. Returning to the existing canvas inserted the card and showed native `Other Favorites / Bookmark Atlas` grouping.
- Default-engine submission for the synthetic query `Bookmark Atlas Edge QA` navigated to the current Edge provider, Bing, rather than the generic Google fallback.
- Added public `https://www.youtube.com/watch?v=jNQXAC9IVRw` through the real More tools → Embed webpage → draw → URL flow. Official iframe title/poster loaded, explicit Play video started audio/video, Seek reached 78% then 100%/Replay. Top-level remained Bookmark Atlas/edge://newtab throughout. No Error153 appeared in this run. This is one video's evidence, not a guarantee of all content/regions.
- Native smoke exposed placeholder/direct-search labels still using a stored English name; added failing regression assertions and fixed both before final packaging. Final package is rebuilt separately; reload confirmation is recorded below.
- Reloaded the installed extension from `edge://extensions` after regenerating the final package, then opened a fresh new tab: Chinese placeholder now reads `使用 浏览器默认 搜索网页、标签页、历史和书签`; both captured cards, the test note and YouTube embed persisted, with no conflict prompt.
- Navigated directly to the extension's `_favicon/` URL for the visited Bing site: Edge returned a 32×32 image with a visible search icon. This validates the cached-image endpoint for that case; it does not complete the full card/missing-icon matrix.
- Quit and relaunched only this disposable Edge instance using the same explicit profile. The new tab still opened Bookmark Atlas with Chinese labels, both cards, test note and YouTube poster/Play button; no first-run guide restart, conflict prompt or automatic playback was observed. This verifies ordinary app restart persistence for the tested scene, not AI credential persistence.

## Verification and remaining gates

- Baseline: 73 files / 770 tests passed.
- Real regression cycles: visible stored label failed first; placeholder and direct suggestion each failed first, then fixed. CLI manifest fixtures failed on stale Edge/foreign update service before the verifier change. Packager initially had 12 missing-feature failures plus its existing Chrome compatibility pass; all 13 then passed.
- Current `npm run check:edge`: typecheck, **75 files / 787 tests**, Edge build/manifest, metadata and generated-page checks passed. Upstream >500kB chunks remain; no separate lint script exists.
- Chrome regression build/manifest and release/generated-page checks passed. The frozen Chrome 0.9.6 ZIP remains a separate immutable artifact.
- Remaining user acceptance: native favorite editing/moving/deleting/undo and actual cached favicon behavior; real Bilibili/full-page interactions and other video/region cases; real AI permission grant/revocation/provider calls and persisted-key restart; two genuine devices with the same supported Edge account and matching extension ID. Do not mark these complete from unit tests or same-device tabs.
- Before public submission: reconcile Edge-facing install/privacy documentation, current store data declarations/AI disclosure, actual required Partner Center assets and worldwide markets, then obtain explicit release/submission authorization.

## Acceptance artifact

- `output/edge-sync-test-mv3/` — visible Load Unpacked directory, retains new-tab override.
- `output/bookmark-atlas-0.9.6-edge-sync-test.zip` and matching `.sha256` — same build for both devices.
- Final SHA256: **82a8c1b22faf26cc2b4834b75f15e11c7c25341c1aed72d8c4472d37c827af1f**.
- Fixed ID **fmikkfohgeimnehehdijgfmjdmkalnfd**; distinct from the Chrome test and store identities. **0.9.6 is the source version, not a newly published Edge version.**
- Follow [Edge acceptance instructions](edge-acceptance-test.md). Do not load `output/edge-qa-profile-20261026` or the downloaded browser runtime as the extension directory. Do not uninstall an existing user's data-bearing extension for testing.
