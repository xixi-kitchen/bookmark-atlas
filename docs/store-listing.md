# Chrome Web Store Listing: Bookmark Atlas

This file is the working copy for the Chrome Web Store listing and review
answers. Use English as the default language for global distribution, then add
Simplified Chinese as a `zh_CN` localization.

v0.9.5 submission copy · 2026-10-19. The user has completed real-use acceptance,
including AI organization, saved local configuration, and optional popup
navigation. Chrome Web Store submission/review remains a separate release step;
this file alone is not evidence of publication. Existing release history is
unchanged. Verify the final package, public privacy page, and live dashboard
disclosures before submitting.

v0.9.5 提交文案（2026-10-19）：用户已完成实际使用验收，包括 AI 整理、本机配置保存与收藏可选跳转。商店提交和审核是独立步骤，本文件不代表已经发布，不改写历史版本记录；提交前核对最终包、公开隐私页和实际后台披露。

## Default Listing: English

| Field | Suggested value |
|---|---|
| Store name | Bookmark Atlas – Excalidraw New Tab |
| Category | Productivity |
| Default language | English |
| Single purpose | Bookmark Atlas turns Chrome bookmarks, search, and an Excalidraw canvas into one local-first new tab workspace. |
| Homepage URL | https://xixi-kitchen.github.io/bookmark-atlas/ |
| Support URL | https://xixi-kitchen.github.io/bookmark-atlas/support.html |
| Privacy policy URL | https://xixi-kitchen.github.io/bookmark-atlas/privacy.html |

### Short Description

Turn Chrome bookmarks, search, and an Excalidraw canvas into a local-first new
tab workspace.

### Detailed Description

Bookmark Atlas replaces the default new tab with a local-first visual workspace
for Chrome bookmarks, search, web embeds, and Excalidraw.

You can keep using Chrome's native bookmarks while arranging selected bookmarks
on an infinite Excalidraw canvas alongside drawings, text, frames, links, and
embedded web pages. Bookmark folders remain editable through Chrome's own
bookmark APIs, and bookmark cards can be opened, moved, sorted, edited, or
removed without leaving the new tab.

Main features:

- Full Excalidraw drawing experience, including text, images, frames, links,
  undo, import, and export.
- Chrome bookmark folder view with create, edit, delete, move, precise sorting,
  breadcrumbs, and folder navigation.
- Import a single bookmark, one folder group, or all bookmarks into the canvas.
- Search open tabs, browsing history, and Chrome bookmarks from the new tab.
- Use Chrome's default search service, or switch to Baidu, Bing, Google, or a
  custom search template.
- Remote suggestions for the supported built-in search engines only.
- Real favicons from Chrome's local favicon cache for bookmarks and search
  engines.
- HTTPS web embeds with iframe sandboxing that prevents embedded pages from
  navigating the extension page.
- YouTube and Bilibili video embeds through official players where available.
  Bilibili video pages load with autoplay disabled.
- Excalidraw as the default visual theme, six alternatives, and multiple bookmark card sizes.
- Switch between Follow browser, English, and Simplified Chinese in Settings
  without reloading or resetting the canvas; the preference remains local.
- Near-real-time lightweight canvas sync through Chrome Sync for devices signed
  into the same Chrome account, plus live updates across open extension tabs.
- Icon, compact, and detailed bookmark presentation, canvas-only notes, and
  selection-based layout previews; historical cards keep their existing layout.
- Open bookmark icons directly while retaining canvas selection and dragging.
- Click the extension icon to add the active page to the canvas and to the
  native Other bookmarks / Bookmark Atlas folder. A local pending queue retains
  the insertion until canvas persistence succeeds, without rearranging other
  browser bookmarks. Choose whether capture opens the canvas or stays on the
  current page for later organization; the popup remembers the choice locally.
- Optional AI organization with your own compatible HTTPS endpoint and API key:
  review selected metadata, generate a plan, preview it, then explicitly apply it
  as an undoable canvas change. Native browser bookmarks are not reorganized.
- Save AI endpoint, model, and API key only in this device's browser profile;
  fetch available models or independently test the selected model on request.

Sync note:

Bookmark Atlas stores the full canvas and binary attachments on the current
device. Lightweight canvas data such as shapes, text, bookmark references,
document settings, and library items may sync through Chrome Sync when quota
allows. Viewport, zoom, sidebar, and drawing-tool preferences remain local.
Open extension tabs receive same-device updates through BroadcastChannel and
cross-device updates through Chrome storage change events. Visible tabs also
check for newer cloud state on focus, on visibility return, and every 30
seconds as a fallback. Images and binary attachments do not sync through Chrome
Sync; users can export a full JSON backup when they need a complete copy.

Privacy note:

Bookmark Atlas does not sell user data or send bookmarks, tabs, history, or
canvas content to a developer-operated server by default. Optional AI sends only
the selected cards' titles, domains, notes, card IDs, and your instruction to the
model service you configure, after explicit agreement. Complete URLs, folder
paths, URL parameters or fragments, history, other tabs, and images are not part
of the AI organization prompt. Your API key is used only for service authentication.
Choosing Save on this device stores the endpoint and model locally and encrypts
the API key with AES-GCM-256, a fresh 96-bit IV, and authenticated binding to the
normalized endpoint. The local credential record contains ciphertext, IV, and
endpoint. A locally generated non-extractable CryptoKey stays in the extension's
dedicated IndexedDB, not in the package. Configuration and encryption keys are
not synced, shared, or included in extension backups. This is not an OS keychain
or absolute protection: control over the browser profile or extension runtime
may still permit credential use or recovery. Closing the panel does not delete
saved settings; Clear local AI settings removes configuration and credentials.
The non-credential encryption key remains locally for concurrent operations and
contains no provider token; uninstall removes extension storage. Earlier
plaintext development settings migrate only after encryption and replacement
succeed; IndexedDB or encryption failure is reported, without plaintext or
silent session-only fallback.
Model discovery uses GET /models; a successful list does not prove generation
works. The separate selected-model test uses POST /chat/completions and sends
only a fixed prompt, no bookmarks,
and may incur provider charges. These actions do not automatically save settings.
Current-page capture reads only the active tab's title and URL on explicit
request. Its native bookmark follows your browser's bookmark-sync settings;
the extension's pending insertion queue remains local.
The provider's fees and data-retention policies apply. AI notes
are metadata-based suggestions, not verified page summaries. There are no ads,
trackers, or remote extension code.

## Localized Listing: zh_CN

| 字段 | 建议内容 |
|---|---|
| 商店名称 | Bookmark Atlas – Excalidraw 书签画布 |
| 类别 | 效率工具 |
| 语言 | 中文（简体） |
| 单一用途 | Bookmark Atlas 将 Chrome 书签、搜索和 Excalidraw 画布整合为一个本地优先的新标签页工作空间。 |
| 主页 URL | https://xixi-kitchen.github.io/bookmark-atlas/ |
| 支持 URL | https://xixi-kitchen.github.io/bookmark-atlas/support.html |
| 隐私政策 URL | https://xixi-kitchen.github.io/bookmark-atlas/privacy.html |

### 简短说明

把 Chrome 书签、搜索和 Excalidraw 画布放进本地优先的新标签页工作空间。

### 详细说明

Bookmark Atlas 把默认新标签页变成一个本地优先的可视化工作空间，用来管理
Chrome 书签、搜索、网页嵌入和 Excalidraw 画布。

你可以继续使用 Chrome 原生书签，也可以把常用书签导入无限画布，与绘图、
文字、框架、链接和网页嵌入放在一起。书签仍通过 Chrome 原生书签 API 管理，
可以在新标签页内打开、移动、排序、编辑或删除。

主要功能：

- 完整 Excalidraw 绘图体验，包括文字、图片、框架、链接、撤销、导入和导出。
- Chrome 书签文件夹视图，支持新建、编辑、删除、移动、精确排序、面包屑和文件夹导航。
- 将单个书签、文件夹组或全部书签导入画布。
- 搜索已打开标签页、浏览历史和 Chrome 书签。
- 默认使用 Chrome 当前搜索服务，也可以切换到百度、必应、Google 或自定义搜索模板。
- 仅对内置支持的搜索引擎提供远程输入联想。
- 使用 Chrome 本地 favicon 缓存显示真实网站和搜索引擎图标。
- 支持 HTTPS 网页嵌入，并通过 iframe sandbox 防止嵌入网页覆盖跳转插件页面。
- YouTube 和 Bilibili 视频尽量使用官方播放器；Bilibili 视频默认关闭自动播放。
- 默认 Excalidraw 主题、六种替代主题和多种书签卡片尺寸。
- 设置中可切换跟随浏览器、English 和简体中文，不刷新或重置画布，偏好只保存在本机。
- 同一 Chrome 账号设备之间可通过 Chrome Sync 同步轻量画布数据。
- 书签支持图标、简洁、详细三种展示、画布备注和选中范围的排布预览；旧卡片保持既有布局。
- 单击书签图标可打开网页，同时保留画布的选择和拖动。
- 点击扩展图标可把当前活动网页添加到画布，并保存在原生「其他书签 / Bookmark Atlas」文件夹；本机待处理队列会保留任务直到画布成功落盘，不重排其他原生书签。可选择添加后打开画布，或留在当前页面稍后集中整理，并记住本机选择。
- 可选 AI 整理使用你自己的兼容 HTTPS 接口和密钥；确认所选元数据、生成预览后再明确应用，可撤销，不重排浏览器原生书签。
- AI 接口、模型和密钥可明确保存到当前设备的浏览器用户配置中，并可主动拉取模型或单独测试所选模型。

同步说明：

Bookmark Atlas 会把完整画布和二进制附件保存在当前设备。图形、文字、书签
引用、画布文档设置和素材库等轻量数据会在 Chrome Sync 配额允许时同步。视口、
缩放、侧边栏和绘图工具偏好只保存在本机。Chrome Sync 是事件驱动的，通常接近
实时，但 Chrome 不保证跨设备或多标签页的固定到达时间。图片和二进制附件不会
通过 Chrome Sync 同步；需要完整复制时，可以导出 JSON 备份。

隐私说明：

Bookmark Atlas 不出售用户数据，默认不向开发者服务器发送书签、标签页、历史或画布。可选 AI 仅在明确同意后，把所选卡片的标题、域名、备注、卡片 ID 和整理要求发送给你配置的服务；完整网址、文件夹路径、网址参数或片段、历史、其他标签页和图片不进入 AI 整理提示词。API Key 仅用于服务认证。明确点击「保存到本机」后，接口和模型本机保存，API Key 使用 AES-GCM-256、每次全新 96 位 IV 加密，并以规范化接口地址进行认证绑定；本机凭据记录仅含密文、IV 和接口地址，本机生成、不可导出的 CryptoKey 存于扩展专用 IndexedDB，不内置在安装包中。配置及加密密钥不同步、不共享、不进入扩展备份。这不是操作系统钥匙串或绝对防护，完全控制浏览器用户配置或扩展运行环境的人仍可能调用或恢复凭据访问。关闭面板不会删除已保存配置；清除本机配置会删除配置和 API 凭据，为并发操作保留的加密密钥不含服务商 token，卸载会移除扩展存储。旧开发版明文配置仅在成功加密并替换后迁移，IndexedDB 或加密受限时明确报错，不回退明文或静默改为仅会话保存。模型列表通过 GET /models 获取，列表成功不代表可以生成；独立模型连通测试通过 POST /chat/completions 只发送固定提示、不传书签，可能收费，两者均不自动保存设置。主动收藏当前网页只读取活动标签页的标题和网址，原生书签按用户的浏览器书签同步设置管理，待处理添加队列只留本机。费用和数据保留遵循服务商政策；AI 简介是基于元数据的建议，不是经过核实的网页摘要。扩展不含广告、追踪器或远程扩展代码。

## Privacy Form Answers

### Single Purpose

Bookmark Atlas turns Chrome bookmarks, search, and an Excalidraw canvas into one
local-first new tab workspace.

### Permission Justification

| Permission | Justification |
|---|---|
| `bookmarks` | Required to display the user's Chrome bookmark tree and perform user-requested bookmark create, edit, move, sort, and delete actions, including saving the explicitly captured current page in Other bookmarks / Bookmark Atlas. Unrelated bookmarks are not rearranged by capture. |
| `storage` | Required to save extension preferences, local canvas fallback data, lightweight Chrome Sync canvas state, local pending capture intents, and explicitly saved local-only AI configuration with AES-GCM-256 encrypted credentials. The non-extractable encryption key is generated locally in dedicated IndexedDB, not packaged. AI configuration, credentials, and encryption keys are excluded from sync, sharing, and backups. |
| `favicon` | Required to show bookmark and search engine icons from Chrome's local favicon cache. |
| `history` | Required to show local browsing history matches in the pre-search panel. Results are processed locally and are not uploaded. |
| `tabs` | Required to show and switch to currently open tabs from the pre-search panel and read the active tab's title and URL when the user explicitly clicks Add to canvas in the extension popup. The extension does not read page body content. |
| `search` | Required to submit searches through the user's current Chrome default search service without changing browser search settings. |
| `declarativeNetRequestWithHostAccess` | Required only to add a fixed client referrer to official YouTube embed player requests created by Bookmark Atlas. |

Current-page capture reuses the existing `tabs`, `bookmarks`, and `storage`
permissions; it adds no new installation-time permission. AI configuration stays
local even when normal native bookmarks and lightweight canvas data sync.

当前网页收藏复用已有的 `tabs`、`bookmarks`、`storage` 权限，不增加安装时权限；原生书签和轻量画布正常同步不代表本机 AI 配置会同步。

### Host Permission Justification

| Host | Justification |
|---|---|
| `https://suggestion.baidu.com/*` | Used only when the user selects Baidu to fetch search suggestions from Baidu's fixed suggestion endpoint. |
| `https://api.bing.com/*` | Used only when the user selects Bing to fetch search suggestions from Bing's fixed suggestion endpoint. |
| `https://suggestqueries.google.com/*` | Used only when the user selects Google to fetch search suggestions from Google's fixed suggestion endpoint. |
| `https://www.youtube.com/*` | Used only for official YouTube embed player requests and the limited client referrer rule described above. |

Optional host capability: `https://*/*` allows users to
choose a compatible model endpoint. It is declared as optional, not granted at
installation. The Connect action requests only the configured origin; generation
requires that permission plus explicit agreement to send selected metadata.
This is not permission to read arbitrary website bodies. Requests omit cookies
and reject redirects. No API key is bundled with the extension.

可选权限说明：`https://*/*` 只用于允许用户自选兼容模型服务，安装时不授予所有网站权限。点击连接才申请配置服务的实际 origin；生成前还须明确同意发送所选元数据。不用于读取任意网页正文，请求不携带 Cookie、不跟随重定向，扩展不内置共享密钥。

### Remote Code Answer

Select: No, I am not using remote code.

Justification if asked:

All extension JavaScript and assets are bundled in the submitted package. Remote
search suggestions, AI plan responses, favicons, and embedded web pages are data
or iframe content for user-facing features; they are not loaded or executed as
extension code. AI plans are strictly validated data, not generated JavaScript.

### User Data Categories

Match the current dashboard's category labels to the actual data handled by
v0.9.5. Suggested disclosures to review:

- Web history: used locally for user-visible pre-search history results.
- Website content: bookmark titles/URLs, tab URLs, user-added embeds, and
  user-created canvas content used for the corresponding visible features;
  selected titles, domains, notes, card IDs, and user instructions may be sent
  to the user's chosen AI provider only after agreement.
- Authentication information: the user's optional provider API key is saved
  only after an explicit action, encrypted locally with AES-GCM-256 and bound
  to the configured endpoint; a fresh IV is used and the non-extractable key
  stays in dedicated IndexedDB. It is sent only as the configured service's
  authentication header, never synced, shared, included in backups, or included
  in a model prompt. This is not an OS-keychain or absolute-security claim.

Do not reuse historical local-only answers: optional AI is a user-approved
third-party transfer even though no developer-operated server receives it.
Current-page title/URL capture and native bookmark sync also belong in the
disclosure. If the form distinguishes collection from local handling, use its
current definitions; the above inventory is not a legal conclusion or an
instruction to select nonexistent category labels. Review the final choices
against the actual package and policy.

Do not declare data sale, advertising, creditworthiness, or unrelated data use.

### Data Handling Certifications

The listing should certify that Bookmark Atlas:

- Does not sell or transfer user data to third parties outside approved use
  cases.
- Does not use or transfer user data for purposes unrelated to its single
  purpose.
- Does not use or transfer user data to determine creditworthiness or for
  lending purposes.

## Test Instructions

1. Install the extension and open a new tab.
2. Confirm the search box uses Chrome Default until another engine is selected.
3. Type a query and confirm local tab, history, and bookmark results appear.
4. Switch to Baidu, Bing, or Google and confirm remote suggestions appear.
5. Open the bookmark list view and test create, edit, move, sort, and delete.
6. Open the Excalidraw canvas, import bookmarks, and draw a shape or text.
7. Confirm the sync status reaches a saved or synced state. For cross-device
   behavior, use another Chrome device signed into the same account with Chrome
   Sync enabled.
8. Add YouTube and Bilibili video URLs. Confirm video embeds do not navigate the
   extension page, and Bilibili video embeds do not autoplay on extension load.
9. Add a regular HTTPS web page and confirm it can be interacted with when the
   website allows iframe embedding.
10. Open an ordinary HTTP/S page, click the extension icon, and add it. Verify
    the native Other bookmarks / Bookmark Atlas entry and corresponding canvas
    card, repeated-click deduplication, pending-queue retry, and no changes to
    unrelated bookmarks. Uncheck Open canvas after adding, capture again, and
    verify the source page remains open; the card appears when a canvas is
    opened later. Protected/internal pages are not capturable.
11. In AI settings, explicitly save the endpoint/model/key, close and reopen
    the panel, then verify reuse in the same browser profile. Confirm backups
    and another browser profile/device do not receive that configuration.
    Fetch models and independently test a selected model; listing success is not
    generation success. Clear local settings and verify the saved key is removed.
    Check that saved credential records contain ciphertext rather than plaintext,
    that changing the endpoint requires the proper credential, and that a
    blocked IndexedDB/encryption operation reports an error rather than a
    plaintext or silent session-only fallback.
12. In Settings, change between English, Simplified Chinese, and Follow browser.
    Verify labels update without losing or resetting the canvas, and the popup
    uses the local language preference.

Core bookmark, canvas, search, and sync tests do not require an extension account
or external credentials. Optional AI requires a user-provided compatible
endpoint, model, and API key; service charges may apply. Test permission denial,
cancellation, invalid output, preview, apply, and undo without changing native
bookmarks. The user has completed real-use acceptance of AI organization and the
candidate's local settings; this does not certify every provider or model.
Automated tests use mocks and are not a claim of additional paid calls.

基础功能不需要扩展账号或外部凭据；可选 AI 需自配兼容服务、模型和密钥，可能收费。用户已完成 AI 整理与本机设置的实际使用验收，但不代表任意服务商或模型都兼容；自动测试使用模拟响应，不代表额外发起了收费调用。

## v0.9.5 Submission Checklist / 提交核对

- Verify the built package's optional-host declaration and runtime requests use
  only the chosen service origin; do not convert it into an installation grant.
- Review the actual selected metadata and authentication request against the
  store's current data-use and permission form, including third-party transfer.
- Deploy the matching English/Chinese privacy page and verify its public URL;
  update both store listing localizations and permission explanations.
- User real-use acceptance is complete for the candidate, including AI. Provider
  terms and future model compatibility still vary; do not claim that
  `store: false` guarantees no retention by arbitrary providers.
- 核对可选权限及实际 origin 授权、所选元数据和认证请求的数据披露；发布中英隐私页并实测公开链接；更新双语商店说明。候选功能已获用户使用验收，仍不对任意服务商的收费、保留政策或兼容性作保证。

These are pending release tasks, not completed store changes. / 以上均为发布前待核对事项，不代表已经在商店生效。

## Graphic Assets

| Asset | File | Status |
|---|---|---|
| Store icon 128 x 128 | `public/icons/icon-128.png` | Prepared |
| Small promo tile 440 x 280 | `docs/store-assets/promo-440x280.png` | Prepared |
| Marquee promo tile 1400 x 560 | `docs/store-assets/marquee-1400x560.png` | Prepared |
| English screenshots 1280 x 800 | `docs/store-assets/screenshots/*-en-1280x800.png` | Prepared |
| Simplified Chinese screenshots 1280 x 800 | `docs/store-assets/screenshots/*-zh-1280x800.png` | Prepared |
| Editable icon source | `docs/store-assets/icon-source.svg` | Prepared |
| Editable small promo source | `docs/store-assets/promo-source.svg` | Prepared |
| Editable marquee source | `docs/store-assets/marquee-source.svg` | Prepared |

## Distribution Note

Use all available regions unless a legal, policy, or support constraint is
identified. Search indexing can lag after publication and after metadata
updates; direct item links may work before keyword search does.
