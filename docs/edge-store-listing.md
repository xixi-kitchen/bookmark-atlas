# Microsoft Edge Add-ons Listing Draft

Status: current-code adaptation candidate, not submitted. Last reviewed: 2026-10-26. Public copy below is a draft until the [Edge acceptance checklist](edge-acceptance-test.md) is completed. Build/API support does not prove account-to-account delivery or store approval.

## English

### Name

Bookmark Atlas – Excalidraw New Tab

### Summary

An Excalidraw-powered new tab with Microsoft Edge favorites, unified search, and persistent web embeds.

### Description

Bookmark Atlas turns the Microsoft Edge new tab into a local-first visual workspace. Browse and manage Edge favorites, search open tabs and history, place favorite cards on a full Excalidraw canvas, and keep useful web embeds beside your notes and drawings.

Key features:

- Read and manage the current Edge profile's native favorites.
- Search Edge favorites, open tabs, and browsing history from one search box.
- Use optional remote suggestions from the selected built-in search provider.
- Place favorite cards, drawings, text, links, images, and web embeds on Excalidraw.
- Save the full canvas locally; sync eligible lightweight canvas data through the same Microsoft Edge account when browser sync is available and quota permits.
- Keep images and binary attachments local unless the user exports a full backup.
- Prevent embedded pages from navigating or replacing the Bookmark Atlas new-tab page.
- Choose icon, compact or detailed favorite cards; add notes and open a favorite from its icon.
- Save the current webpage from the toolbar popup, with an optional choice to open the canvas afterward.
- Follow an optional hands-on guide, switch English/Simplified Chinese in settings, and read version introductions.
- Optionally connect your own compatible AI provider for selected-favorite organization: review the metadata and proposed layout, then explicitly apply or undo it.

Synchronization, where available, is limited to Microsoft Edge profiles signed in to the same supported account with the relevant browser sync settings enabled. Image files stay local. Delivery also depends on extension identity, browser service availability and quota; a local sync-storage write is not a remote-device receipt.

AI is optional. The selected card IDs, titles, site hostnames, notes and organization instruction are sent to the HTTPS provider configured by the user only after the user confirms the disclosed request. Full URLs and folder paths are not included in this request. Model listing and connectivity tests contact that provider separately; generation may incur provider charges. Connection settings and the API key remain in this device's browser profile and are excluded from sync and extension backups. The key is encrypted locally using a nonextractable IndexedDB key; this is not an OS keychain. Clear saved credentials in AI settings and revoke granted site access through Edge extension permissions when no longer needed.

### Privacy and permissions

- `bookmarks`: display and manage favorites the user acts on.
- `storage`: save local preferences and eligible lightweight synchronized canvas state.
- `tabs` and `history`: provide local pre-search results.
- `search`: use the current Edge search provider without changing it.
- `favicon`: request locally cached site icons when supported by Edge.
- Fixed suggestion host permissions: retrieve optional search suggestions only from the selected built-in provider.
- YouTube host access and declarative request rule: set the fixed client identity required by official YouTube iframe players created inside Bookmark Atlas.
- Optional HTTPS host access: request only the exact AI provider origin chosen by the user when they use connection controls. It does not grant blanket access to all sites at installation.

No ads, trackers, developer analytics, or remotely hosted executable extension code are included. Local favorites/tab/history search is not sent to the developer. Remote suggestions send typed queries to the selected built-in suggestion provider; AI sends the explicitly disclosed selected metadata to the configured provider. Embedded websites receive normal browser requests and may apply their own cookies, login, region or embedding restrictions. The extension does not scrape page bodies for AI organization.

## 简体中文

### 名称

Bookmark Atlas – Excalidraw 新标签页

### 简短说明

把 Microsoft Edge 收藏夹、统一搜索、网页嵌入和完整 Excalidraw 画布放进一个新标签页。

### 详细说明

Bookmark Atlas 将 Microsoft Edge 新标签页变成本地优先的可视化工作空间。你可以浏览和管理 Edge 收藏夹，在一个搜索框中检索收藏夹、已打开标签页和浏览历史，并把收藏夹卡片、网页、绘图、文字和图片放到完整的 Excalidraw 画布中。

支持图标、简洁、详细三种卡片和备注；点击图标打开网页。通过工具栏弹窗收藏当前网页，可选择添加后是否打开画布。设置可切换中英文，首次使用可跟随实操引导，之后查看完整版本介绍。

完整画布保存在当前设备。图形、文字、收藏夹引用、文档设置和素材库等轻量数据可在浏览器账号同步可用且配额允许时写入同步存储；视口、缩放和工具偏好仅在本机。图片和二进制附件仍保存在添加它们的设备上，可通过完整备份迁移。

同步仅限登录同一受支持 Microsoft Edge 账号、开启相关浏览器同步设置的 Edge 用户配置；图片仍在本机。送达还依赖扩展身份、浏览器同步服务和配额，本地写入不等于另一设备已收到。

AI 整理完全可选。用户自行配置兼容服务商，确认披露后才发送所选卡片的 ID、标题、网站域名、备注和整理要求，不发送完整网址或文件夹路径；先预览再应用，并可撤销。拉取模型和连通测试会单独访问该服务商，模型生成可能收费。配置和 Key 仅存当前设备的浏览器用户配置，不同步、不进入插件备份。Key 以本机密文和 IndexedDB 不可导出密钥保存，不是系统钥匙串。可清除本机配置，并在 Edge 扩展权限中撤销该服务商站点访问。

权限说明与英文一致：收藏夹、存储、标签页/历史、默认搜索、缓存图标、固定联想来源及 YouTube 播放器规则；AI 仅在用户操作时申请其选择的具体 HTTPS 来源。不含广告、跟踪器、开发者分析或远程执行的扩展代码。本地搜索结果不发给开发者；远程联想向选定来源发送输入文本；嵌入网站接收正常网页请求，可能使用 Cookie 或要求登录，受网站自身限制。AI 不抓取网页正文。

## Pre-submission acceptance checklist

- [ ] Sideload `output/edge-mv3/` in current stable Microsoft Edge.
- [ ] Verify new-tab override after browser restart.
- [ ] Verify favorite create, edit, move, reorder, delete, and undo.
- [ ] Verify open-tab, history, favorite, and remote-suggestion search.
- [ ] Verify cached favicon rendering and text fallback.
- [ ] Verify YouTube and Bilibili embed behavior without top-level navigation.
- [ ] Verify same-device multi-tab canvas updates.
- [ ] Verify same-account Edge-to-Edge canvas and favorite synchronization on two real devices.
- [ ] Verify optional AI origin grant/denial/revocation, selected-metadata consent, local credential encryption and no backup/sync leakage.
- [ ] Verify capture queue, duplicate prevention and open-after-capture preference; local language/onboarding behavior.
- [ ] Reconcile the final privacy disclosure and permission justifications with the submitted package.
- [ ] Select all intended markets and provide English and Simplified Chinese store listings.
- [ ] Prepare a public Edge-specific install/privacy guide before submitting. Current deployed website still documents the supported Chrome release; do not change its channel status during candidate testing.
- [ ] Review the current third-party data sharing policy against optional AI data flow at submission time. Runtime host permission alone is not a store-policy compliance determination.

## Primary references and submission boundary

- [Porting a Chromium extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension)
- [Supported APIs](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/api-support)
- [Manifest format](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/manifest-format)
- [Detailed publishing fields and assets](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)
- [Developer policies](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)

Keep public Edge metadata focused on this edition. Prepare the 128px+ square logo, 440×280 promotional tile and 1280×800 real Edge screenshots; confirm actual Partner Center required fields before upload. Do not reuse a development public test key as a guaranteed store identity. Neither signing into an account, accepting developer terms, creating a listing, nor submitting is part of this local adaptation round.
