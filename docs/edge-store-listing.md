# Microsoft Edge Add-ons Listing Draft

Status: compatibility candidate, not yet submitted.

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

Bookmark Atlas does not synchronize data between Chrome, Edge, and Safari. Edge synchronization is limited to Microsoft Edge instances signed in to the same supported account and still requires real multi-device acceptance testing before this claim is used in the public listing.

### Privacy and permissions

- `bookmarks`: display and manage favorites the user acts on.
- `storage`: save local preferences and eligible lightweight synchronized canvas state.
- `tabs` and `history`: provide local pre-search results.
- `search`: use the current Edge search provider without changing it.
- `favicon`: request locally cached site icons when supported by Edge.
- Fixed suggestion host permissions: retrieve optional search suggestions only from the selected built-in provider.
- YouTube host access and declarative request rule: set the fixed client identity required by official YouTube iframe players created inside Bookmark Atlas.

No ads, trackers, developer analytics, arbitrary page-content access, or remotely hosted executable code are included.

## 简体中文

### 名称

Bookmark Atlas – Excalidraw 新标签页

### 简短说明

把 Microsoft Edge 收藏夹、统一搜索、网页嵌入和完整 Excalidraw 画布放进一个新标签页。

### 详细说明

Bookmark Atlas 将 Microsoft Edge 新标签页变成本地优先的可视化工作空间。你可以浏览和管理 Edge 收藏夹，在一个搜索框中检索收藏夹、已打开标签页和浏览历史，并把收藏夹卡片、网页、绘图、文字和图片放到完整的 Excalidraw 画布中。

完整画布保存在当前设备。图形、文字、收藏夹引用、视口和素材库等轻量数据会在浏览器账号同步可用且配额允许时同步；图片和二进制附件仍保存在添加它们的设备上，可通过完整备份迁移。

Bookmark Atlas 不在 Chrome、Edge 和 Safari 之间同步数据。Edge 同步仅限登录同一受支持 Microsoft Edge 账号的 Edge 实例，并且必须完成真实双设备验收后，才能把该能力写入公开商店文案。

## Pre-submission acceptance checklist

- [ ] Sideload `output/edge-mv3/` in current stable Microsoft Edge.
- [ ] Verify new-tab override after browser restart.
- [ ] Verify favorite create, edit, move, reorder, delete, and undo.
- [ ] Verify open-tab, history, favorite, and remote-suggestion search.
- [ ] Verify cached favicon rendering and text fallback.
- [ ] Verify YouTube and Bilibili embed behavior without top-level navigation.
- [ ] Verify same-device multi-tab canvas updates.
- [ ] Verify same-account Edge-to-Edge canvas and favorite synchronization on two real devices.
- [ ] Reconcile the final privacy disclosure and permission justifications with the submitted package.
- [ ] Select all intended markets and provide English and Simplified Chinese store listings.
