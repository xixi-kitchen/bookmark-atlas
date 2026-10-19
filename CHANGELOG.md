# Changelog

## v0.9.5 - 2026-10-19

### English

- Simplified workspace actions into Settings and contextual canvas menus, kept the Excalidraw theme as the default, and improved narrow-screen search layout.
- Fixed a canvas initialization race that could misclassify an incoming update as a local conflict before the saved scene had loaded.
- Added icon, compact, and detailed bookmark cards, canvas-only notes, and explicit layout previews. Existing cards and positions are preserved; new imports default to compact.
- Made bookmark icons open websites directly in a new tab while retaining selection, dragging, and keyboard navigation; aligned each card style and added a shortened URL to detailed cards.
- Added optional AI organization with a user-configured compatible HTTPS endpoint: review selected metadata, preview groups and notes, then apply an undoable canvas change without reorganizing native bookmarks.
- Added local-only AI settings, model discovery, a separate model connectivity test, and clearing saved configuration. Saved API keys use AES-GCM-256 encryption with endpoint binding and are excluded from sync and backups; encryption keys are generated locally, not bundled.
- Added extension-icon capture into Other bookmarks / Bookmark Atlas and a durable local canvas-insertion queue. Choose whether to open the canvas after capture or stay on the current page and organize later.
- Added Settings language switching between Follow browser, English, and Simplified Chinese without reloading or resetting the canvas; language and capture-navigation preferences stay local.

### 中文

- 将工作区操作收纳到设置和画布上下文菜单，保持 Excalidraw 为默认主题，并优化窄屏搜索栏布局。
- 修复画布初始化期间的竞态，避免已保存场景尚未载入时把传入更新误判为本机冲突。
- 增加图标、简洁、详细三种书签卡片、画布备注和明确确认的排布预览。保留旧卡片及位置，新导入默认使用简洁形式。
- 单击书签图标可在新标签页打开，同时保留选择、拖动和键盘操作；分别对齐三种卡片，详细卡片增加缩略网址。
- 增加自配兼容 HTTPS 接口的可选 AI 整理：确认选中元数据，预览分组和备注后再应用，可撤销，不重排原生书签。
- 增加仅限本机的 AI 设置、模型拉取、独立模型连通测试和清除配置。已保存 API Key 使用 AES-GCM-256 加密并绑定接口，不参与同步或备份；加密密钥本机生成，不内置在安装包中。
- 点击扩展图标可保存当前网页到「其他书签 / Bookmark Atlas」，并通过可靠本机队列添加至画布；可选择添加后打开画布，或留在当前页面稍后集中整理。
- 设置中可在跟随浏览器、English 和简体中文之间切换，不刷新或重置画布；语言及收藏跳转偏好仅保存在本机。

## v0.9.4 - 2026-09-11

### English

- Reworked canvas conflict detection around the last acknowledged cloud version, so normal upload acknowledgements and stale cloud echoes no longer produce a conflict prompt.
- Same-device tabs now converge silently to the newest saved canvas; a local recovery snapshot is kept before an automatic replacement.
- Kept zoom, viewport position, sidebar state, and drawing-tool preferences local so ordinary navigation no longer creates cloud revisions.
- Added a backward-compatible sync fingerprint version and parent fingerprint so real cross-device branches remain protected.
- Stopped device-local bookmark reconciliation from rewriting shared canvas content and causing repeated sync churn.

### 中文

- 按最后确认的云端版本重构画布冲突判断，正常上传确认和旧云端回声不再触发冲突弹窗。
- 同一设备的多个标签页会静默收敛到最新保存的画布；自动替换前会保留一份本机恢复快照。
- 缩放、视口位置、侧边栏和绘图工具偏好只保存在本机，普通浏览操作不再制造云端版本。
- 增加向后兼容的同步指纹版本与父版本指纹，真正的跨设备分叉仍保留冲突保护。
- 本机书签解析不再重写共享画布，避免不同设备之间反复产生同步更新。

## v0.9.3 - 2026-09-10

### English

- Fixed same-device canvas synchronization so a saved change in one open tab applies automatically in another tab when the receiving tab has no unsaved edit.
- Preserved explicit conflict protection for truly concurrent local edits and for unsynced cross-device changes.
- Added an optional, replayable three-step first-run guide that focuses the real search box and opens the real Excalidraw canvas.
- Added a fixed-width Help menu with quick-guide replay, version highlights, and a link to the full GitHub release history.
- Added bilingual release notes, support and contribution guides, valid GitHub Issue Forms, and automated release-metadata verification.
- Added repeatable Chrome, Edge, and Safari MV3 build checks. Edge remains a compatibility candidate pending real sideload and two-device acceptance; Safari remains feasibility-only.

### 中文

- 修复同设备多标签页画布同步：一个标签页保存后，只要接收标签页没有未保存编辑，就会自动应用更新。
- 保留真正并发编辑和跨设备未同步修改的冲突保护，不会静默覆盖。
- 增加可跳过、可重播的三步首次引导，可直接聚焦真实搜索框并打开真实 Excalidraw 画布。
- 增加固定宽度帮助菜单，可重播引导、查看版本重点并进入完整 GitHub 更新历史。
- 增加中英文发布说明、支持与贡献文档、有效的 GitHub Issue Form，以及版本发布元数据检查。
- 增加可重复执行的 Chrome、Edge 和 Safari MV3 构建检查。Edge 仍需真实侧载与双设备验收；Safari 仅完成可行性构建。

## v0.9.2 - 2026-09-07

### English

- Previous release included initial real-time sync + conflict detection foundation, improved embedding safety policy, and pre-search enhancements.

### 中文

- 上一版本完成了实时同步与冲突检测基础、网页嵌入安全策略增强，以及预搜索体验优化。

## v0.9.1 - 2026-09-04

### English

- Previous maintenance and polish release prior to v0.9.2.

### 中文

- 0.9.2 之前的维护与体验优化发布。
