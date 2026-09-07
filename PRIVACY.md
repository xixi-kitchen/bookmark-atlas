# Bookmark Atlas Privacy Policy

Last updated: 2026-09-04

Bookmark Atlas is a local-first Chrome extension. It does not sell, analyze, or
upload your bookmarks, open tabs, browsing history, or canvas content to a
developer server. It does not include ads, trackers, or remote code execution.

简体中文说明见本文件下方的「中文隐私说明」。

## Data Handled by the Extension

- Chrome bookmarks are read and modified locally through the Chrome Bookmarks
  API so the extension can display and manage bookmarks at the user's request.
- Website icons are read from Chrome's local Favicon API cache.
- Open tabs and browsing history are read locally to produce the search box's
  pre-search results. These local results are not uploaded to the developer or
  to a search engine.
- The full Excalidraw canvas and user-added binary attachments are stored in
  the extension's local IndexedDB, with `chrome.storage.local` as a fallback.
- Lightweight canvas state, including shapes, text, bookmark references,
  viewport, and library items, may be compressed and written to
  `chrome.storage.sync` when Chrome Sync is available and quota allows.
- Images and binary attachments are not uploaded to Chrome Sync. They remain on
  the device where they were added unless the user exports a full backup.
- Theme, view, card size, and search engine preferences are stored in
  `chrome.storage.sync` when available.

## Sync Behavior

Chrome Sync is controlled by the user's Chrome account settings. Bookmark Atlas
writes eligible lightweight data when local changes occur, and listens for
Chrome storage change events in other open extension pages. This usually behaves
as near-real-time sync, but Chrome does not guarantee an exact delivery latency
across devices or browser tabs.

Synced bookmark cards are reconciled on each device by normalized URL, title,
and folder path. Chrome bookmark IDs are local to a specific browser profile and
are not treated as cross-device identifiers.

## Remote Requests

- Search terms are not recorded by Bookmark Atlas. When the user submits a
  search, the query is sent to the selected search provider.
- When the user selects Baidu, Bing, or Google as the active built-in search
  engine, input text is sent to that provider's fixed suggestion endpoint to
  show remote suggestions. The extension does not store those suggestion
  requests.
- When the user uses Chrome Default or a custom search engine, Bookmark Atlas
  does not call an extra remote suggestion endpoint.
- When the canvas contains a web embed, the embedded website loads inside a
  sandboxed iframe. The website may receive normal browser requests, cookies,
  and account state according to browser rules. Bookmark Atlas does not proxy,
  inspect, or record those requests.
- For official YouTube `/embed/` player requests created by Bookmark Atlas, a
  declarative rule sets a fixed `https://bookmark-atlas.invalid/` referrer as a
  client identifier. The rule does not read request content and does not apply to
  YouTube players created by other websites.

## What Bookmark Atlas Does Not Do

- It does not upload bookmarks, tabs, history, or canvas content to a developer
  server.
- It does not sell or transfer user data to third parties.
- It does not use user data for advertising, analytics, creditworthiness, or
  unrelated purposes.
- It does not read web page body content.
- It does not request broad host permissions such as `https://*/*` or
  `<all_urls>`.
- It does not execute JavaScript or WebAssembly loaded from a remote server as
  extension code.

## Data Deletion

Uninstalling the extension removes local extension storage from the device.
Chrome account sync data is managed by Chrome. Uninstalling Bookmark Atlas does
not delete the user's Chrome bookmarks.

Users may export a full JSON backup, including local attachment references and
stored canvas data, from inside the extension.

## Limited Use

The use of information received from Google APIs will adhere to the Chrome Web
Store User Data Policy, including the Limited Use requirements.

## 中文隐私说明

Bookmark Atlas 是本地优先的 Chrome 扩展。扩展不会把你的书签、标签页、
浏览历史或画布内容上传到开发者服务器，也不包含广告、追踪器或远程执行代码。

处理的数据：

- 使用 Chrome Bookmarks API 在本地读取和修改用户主动管理的书签。
- 使用 Chrome Favicon API 从浏览器本地图标缓存显示网站图标。
- 在本地读取已打开标签页和浏览历史，用于搜索框预搜索结果；这些结果不会上传。
- 完整 Excalidraw 画布和用户添加的附件保存在当前设备的 IndexedDB。
- 图形、文字、书签引用、视口和素材库会在配额允许时写入 Chrome Sync。
- 图片和二进制附件不会进入 Chrome Sync，只保存在添加它们的设备上。

同步说明：

Chrome Sync 由用户自己的 Chrome 账号设置控制。Bookmark Atlas 会在本地内容变化时写入可同步的轻量数据，并监听其他扩展页面的 Chrome storage 变化事件。它通常表现为近实时同步，但 Chrome 不保证跨设备或多标签页的固定到达时间。书签卡片会按规范化 URL、标题和文件夹路径重新关联当前设备的书签，不把 Chrome 本地书签 ID 当作跨设备主键。

远程请求：

- 用户提交搜索时，搜索词会发送给当前选择的搜索服务。
- 用户主动选择百度、必应或 Google 后，输入词会发送给对应的固定联想接口。
- 使用「Chrome 默认」或自定义搜索引擎时，扩展不会额外调用远程联想接口。
- 画布中的网页嵌入会按浏览器规则连接目标网站；Bookmark Atlas 不代理或记录这些请求。

卸载扩展会删除当前设备上的扩展本地数据，但不会删除用户的 Chrome 书签。Chrome 账号同步数据由 Chrome 自身管理。
