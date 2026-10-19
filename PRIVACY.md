# Bookmark Atlas Privacy Policy

Effective: 2026-10-19 · Applies to Bookmark Atlas v0.9.5, including optional AI
organization and current-page capture. Feature availability depends on the
version installed; this policy also explains data handling before you enable
those optional features.

Bookmark Atlas is a local-first Chrome extension. It does not sell your data or
send bookmarks, open tabs, browsing history, or canvas content to a
developer-operated server by default. Optional AI organization sends only the
selected metadata described below to the model service you choose, after your
explicit agreement. The extension does not include ads, trackers, or remote
extension code execution.

简体中文说明见本文件下方的「中文隐私说明」。

## Data Handled by the Extension

- Chrome bookmarks are read and modified locally through the Chrome Bookmarks
  API so the extension can display and manage bookmarks at the user's request.
- When you click the extension icon and explicitly add the current page, its
  title and URL are read from that active tab and saved as a native bookmark in
  Other bookmarks / Bookmark Atlas. An extension-local pending queue retains the
  corresponding canvas insertion until the canvas is saved successfully. This
  does not move or rewrite unrelated bookmarks or read the page body. The saved
  native bookmark follows your normal browser bookmark-sync settings; the pending
  queue itself is not shared or synced by Bookmark Atlas.
- Website icons are read from Chrome's local Favicon API cache.
- Open tabs and browsing history are read locally to produce the search box's
  pre-search results. These local results are not uploaded to the developer or
  to a search engine.
- The full Excalidraw canvas and user-added binary attachments are stored in
  the extension's local IndexedDB, with `chrome.storage.local` as a fallback.
- Lightweight canvas state, including shapes, text, bookmark references,
  document settings, and library items, may be compressed and written to
  `chrome.storage.sync` when Chrome Sync is available and quota allows.
- Viewport position, zoom, open sidebar, and drawing-tool preferences remain
  local and are not written as part of the synced canvas.
- Interface language (Follow browser, English, or Simplified Chinese) and the
  popup's Open canvas after adding preference stay in local extension storage.
  Switching language does not reload or reset the canvas or change Chrome's
  own interface language. Disabling popup navigation retains captures locally
  until a canvas is opened and saved successfully.
- Images and binary attachments are not uploaded to Chrome Sync. They remain on
  the device where they were added unless the user exports a full backup.
- Theme, view, card size, and search engine preferences are stored in
  `chrome.storage.sync` when available.
- Bookmark presentation and optional canvas notes are part of the canvas and
  may sync with other lightweight canvas content.
- AI Base URL and model name are saved locally only after you explicitly choose
  Save on this device. The API key is encrypted with AES-GCM-256, a fresh 96-bit
  IV, and authenticated binding to the normalized endpoint. Its credential
  record in `chrome.storage.local` contains ciphertext, IV, and endpoint rather
  than the plaintext key. A locally generated non-extractable CryptoKey is kept
  in the extension's dedicated IndexedDB; no encryption key is bundled in the
  package. AI configuration and encryption keys are not synced, shared, or
  included in extension backups. This is not an OS keychain or absolute
  protection: someone controlling the browser profile or extension runtime may
  still invoke or recover access to the credential. Closing the panel does not
  delete a saved credential. Existing plaintext development settings migrate
  only after encryption and replacement succeed; unavailable IndexedDB or
  encryption produces an explicit error, not a plaintext or silent session-only
  fallback.

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

## Optional AI Organization

AI is off unless you configure a compatible HTTPS model endpoint and choose to
use it. Before generation, you select the bookmark cards, review the outgoing
data, and explicitly agree to send their titles, domains, existing canvas notes,
selected card IDs, and your organization instruction to that service. Other
canvas elements are not included. Bookmark Atlas does not include complete
bookmark URLs, folder paths, URL parameters or fragments, history, other open
tabs, images, or API keys in the model prompt. Your API Key is sent only as an
authentication header to the configured endpoint; it is never part of the prompt.

The extension declares optional HTTPS host capability so a user-selected model
service can be connected. This is not installation-time access to every website:
connection requests permission only for the configured service origin. Requests
do not carry browser cookies and do not follow redirects.

Model discovery and connectivity checks run only when you request them. Model
discovery authenticates a `GET /models` request to the configured service; a
successful list does not establish that the selected model can generate a
response. Test selected model sends a fixed minimal prompt using
`POST /chat/completions`, without bookmark metadata or your canvas. The provider
may charge for this test. Neither operation automatically saves your settings.

The selected provider processes the submitted metadata and authentication. Its
fees, privacy terms, retention, and training policies apply; you should review
them before connecting. The request uses `store: false`, but Bookmark Atlas
cannot guarantee that a third-party provider honors that option or retains no
data. No developer-funded model account or shared API key is supplied.

AI output is validated as a declarative suggestion, not executable code.
Descriptions are metadata-based suggestions, not verified summaries of pages
the model has visited. A preview does not change the saved canvas; applying it is
an explicit, undoable action. Applied groups and notes may sync as canvas content.

## What Bookmark Atlas Does Not Do

- It does not upload bookmarks, tabs, history, or canvas content to a developer
  server by default. Optional AI sends only user-approved selected metadata to
  the configured provider.
- It does not sell user data or transfer it for purposes unrelated to the
  user-requested features described in this policy.
- It does not use user data for advertising, analytics, creditworthiness, or
  unrelated purposes.
- It does not read web page body content.
- It does not request installation-time access to all websites. Optional AI
  declares an HTTPS capability but requests access only to the configured origin
  when the user connects it.
- It does not execute JavaScript or WebAssembly loaded from a remote server as
  extension code.

## Data Deletion

Uninstalling the extension removes local extension storage from the device.
Chrome account sync data is managed by Chrome. Uninstalling Bookmark Atlas does
not delete the user's Chrome bookmarks.

Users may export a full JSON backup, including local attachment references and
stored canvas data, from inside the extension.
AI endpoint configuration and API keys are not included in that backup.
Clear local AI settings removes the saved endpoint, model, and API Key from this
browser profile. The non-credential encryption key remains locally to support
concurrent operations and contains no provider token. Uninstalling removes
extension storage, including that key and the local pending capture queue.
Closing the AI panel alone does not delete saved settings. Removing the extension does not
delete metadata already received by a model provider; contact that provider
under its own deletion process where applicable.

## Limited Use

The use of information received from Google APIs will adhere to the Chrome Web
Store User Data Policy, including the Limited Use requirements.

## 中文隐私说明

生效日期：2026-10-19。适用于 Bookmark Atlas v0.9.5，包括可选 AI 整理与当前网页收藏。实际可用功能取决于已安装版本；本政策也在启用这些可选功能前说明其数据处理方式。

Bookmark Atlas 是本地优先的 Chrome 扩展。默认不把你的书签、标签页、
浏览历史或画布内容发送到开发者服务器，也不出售数据、不包含广告、追踪器或远程扩展代码。可选 AI 整理仅在你明确同意后，把选中范围的指定信息发送给你配置的模型服务。

处理的数据：

- 使用 Chrome Bookmarks API 在本地读取和修改用户主动管理的书签。
- 点击扩展图标并主动添加当前网页时，读取活动标签页的标题和网址，保存到原生「其他书签 / Bookmark Atlas」文件夹。对应画布添加任务存入扩展本机待处理队列，画布成功落盘后才确认完成；不读取网页正文，不移动或改写其他书签。原生书签仍按用户自己的浏览器书签同步设置管理，待处理队列本身不由扩展同步或共享。
- 使用 Chrome Favicon API 从浏览器本地图标缓存显示网站图标。
- 在本地读取已打开标签页和浏览历史，用于搜索框预搜索结果；这些结果不会上传。
- 完整 Excalidraw 画布和用户添加的附件保存在当前设备的 IndexedDB。
- 图形、文字、书签引用、画布文档设置和素材库会在配额允许时写入 Chrome Sync。
- 视口位置、缩放、侧边栏和绘图工具偏好只保存在本机，不作为画布内容同步。
- 界面语言（跟随浏览器、English 或简体中文）和「添加后打开画布」偏好只保存在本机扩展存储中。切换语言不刷新或重置画布，不更改 Chrome 自身语言；关闭收藏跳转后，待处理项仍保留本机，之后打开画布并成功保存才完成添加。
- 图片和二进制附件不会进入 Chrome Sync，只保存在添加它们的设备上。
- 书签展示形式和画布备注属于画布内容，可随轻量画布同步。
- AI 接口地址和模型只有在明确点击「保存到本机」后才保存，API Key 使用 AES-GCM-256、每次全新 96 位 IV 加密，并以规范化接口地址进行认证绑定。`chrome.storage.local` 的凭据记录包含密文、IV 和接口地址，而非明文 Key；本机生成、不可导出的 CryptoKey 存于扩展专用 IndexedDB，安装包不内置加密密钥。配置和加密密钥均不同步、不共享、不进入扩展备份。这不是操作系统钥匙串或绝对防护，完全控制浏览器用户配置或扩展运行环境的人仍可能调用或恢复凭据访问。关闭面板不会删除已保存凭据。旧开发版明文配置只有成功加密并替换后才继续使用；IndexedDB 或加密不可用时明确报错，不回退明文，也不静默改为仅会话保存。

同步说明：

Chrome Sync 由用户自己的 Chrome 账号设置控制。Bookmark Atlas 会在本地内容变化时写入可同步的轻量数据，并监听其他扩展页面的 Chrome storage 变化事件。它通常表现为近实时同步，但 Chrome 不保证跨设备或多标签页的固定到达时间。书签卡片会按规范化 URL、标题和文件夹路径重新关联当前设备的书签，不把 Chrome 本地书签 ID 当作跨设备主键。

远程请求：

- 用户提交搜索时，搜索词会发送给当前选择的搜索服务。
- 用户主动选择百度、必应或 Google 后，输入词会发送给对应的固定联想接口。
- 使用「Chrome 默认」或自定义搜索引擎时，扩展不会额外调用远程联想接口。
- 画布中的网页嵌入会按浏览器规则连接目标网站；Bookmark Atlas 不代理或记录这些请求。
- 扩展为自己创建的 YouTube `/embed/` 请求设置固定客户端 referrer，不读取请求内容，也不影响其他网站创建的播放器。

可选 AI 整理：

- 默认不开启。你配置兼容的 HTTPS 接口、选中书签并确认发送范围后，才会发送所选卡片的标题、域名、已有备注、所选卡片 ID 和整理要求。不会把完整网址、文件夹路径、网址参数或片段、历史记录、其他标签页、图片或 API Key 放进模型提示词。
- API Key 仅作为认证请求头发送到你配置的服务端点。请求不携带浏览器 Cookie，也不跟随重定向。
- 可选 HTTPS 主机能力声明不等于安装时获得所有网站权限；只有点击连接时才申请配置服务的实际 origin 权限。
- 拉取模型和连通测试只在主动点击时请求。拉取通过已配置服务的 `GET /models` 获取列表，列表成功不代表所选模型能生成；「测试所选模型」通过 `POST /chat/completions` 仅发送固定简短测试提示，不发送书签或画布，可能产生服务商费用。两者均不会自动保存设置。
- 服务商会处理提交的数据和认证信息，其收费、隐私、保留期限和训练政策适用，请在连接前查阅。请求携带 `store: false`，但扩展无法保证第三方遵守或完全不保留数据；不提供开发者付费账号或共享密钥。
- AI 返回的是经过校验的数据建议，不执行远程代码；根据标题、域名和备注生成的简介不是已访问网页后的事实摘要。预览不改变已保存画布，确认应用后可撤销；应用后的分组和备注可随画布同步。

卸载扩展会删除当前设备上的扩展本地数据（含已保存 AI 配置、加密密钥及待处理收藏队列），但不会删除用户的 Chrome 书签。Chrome 账号同步数据由 Chrome 自身管理。清除本机 AI 配置会删除当前用户配置内已保存的接口、模型和 API 凭据；为支持并发操作，本机保留不含服务商 token 的加密密钥。关闭面板本身不会删除已保存配置；扩展备份不含 AI 配置、凭据或加密密钥。已发送给服务商的数据不随卸载自动删除，需要按该服务商的流程处理。
