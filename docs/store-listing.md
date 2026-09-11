# Chrome Web Store Listing: Bookmark Atlas

This file is the working copy for the Chrome Web Store listing and review
answers. Use English as the default language for global distribution, then add
Simplified Chinese as a `zh_CN` localization.

## Default Listing: English

| Field | Suggested value |
|---|---|
| Store name | Bookmark Atlas – Excalidraw New Tab |
| Category | Productivity |
| Default language | English |
| Single purpose | Bookmark Atlas turns Chrome bookmarks, search, and an Excalidraw canvas into one local-first new tab workspace. |
| Homepage URL | Use the published `docs/index.html` URL. |
| Support URL | Use the published `docs/support.html` URL. |
| Privacy policy URL | Use the published `docs/privacy.html` URL. |

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
- Six visual themes and multiple bookmark card sizes.
- Near-real-time lightweight canvas sync through Chrome Sync for devices signed
  into the same Chrome account, plus live updates across open extension tabs.

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

Bookmark Atlas does not sell, analyze, or upload bookmarks, tabs, browsing
history, or canvas content to a developer server. It does not include ads,
trackers, or remote extension code.

## Localized Listing: zh_CN

| 字段 | 建议内容 |
|---|---|
| 商店名称 | Bookmark Atlas – Excalidraw 书签画布 |
| 类别 | 效率工具 |
| 语言 | 中文（简体） |
| 单一用途 | Bookmark Atlas 将 Chrome 书签、搜索和 Excalidraw 画布整合为一个本地优先的新标签页工作空间。 |
| 主页 URL | 使用已发布的 `docs/index.html` 页面地址。 |
| 支持 URL | 使用已发布的 `docs/support.html` 页面地址。 |
| 隐私政策 URL | 使用已发布的 `docs/privacy.html` 页面地址。 |

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
- 六套视觉主题和多种书签卡片尺寸。
- 同一 Chrome 账号设备之间可通过 Chrome Sync 同步轻量画布数据。

同步说明：

Bookmark Atlas 会把完整画布和二进制附件保存在当前设备。图形、文字、书签
引用、画布文档设置和素材库等轻量数据会在 Chrome Sync 配额允许时同步。视口、
缩放、侧边栏和绘图工具偏好只保存在本机。Chrome Sync 是事件驱动的，通常接近
实时，但 Chrome 不保证跨设备或多标签页的固定到达时间。图片和二进制附件不会
通过 Chrome Sync 同步；需要完整复制时，可以导出 JSON 备份。

隐私说明：

Bookmark Atlas 不出售、不分析、不上传用户的书签、标签页、浏览历史或画布
内容，也不包含广告、追踪器或远程扩展代码。

## Privacy Form Answers

### Single Purpose

Bookmark Atlas turns Chrome bookmarks, search, and an Excalidraw canvas into one
local-first new tab workspace.

### Permission Justification

| Permission | Justification |
|---|---|
| `bookmarks` | Required to display the user's Chrome bookmark tree and perform user-requested bookmark create, edit, move, sort, and delete actions. |
| `storage` | Required to save extension preferences, local canvas fallback data, and lightweight Chrome Sync canvas state. |
| `favicon` | Required to show bookmark and search engine icons from Chrome's local favicon cache. |
| `history` | Required to show local browsing history matches in the pre-search panel. Results are processed locally and are not uploaded. |
| `tabs` | Required to show and switch to currently open tabs from the pre-search panel. The extension does not read page body content. |
| `search` | Required to submit searches through the user's current Chrome default search service without changing browser search settings. |
| `declarativeNetRequestWithHostAccess` | Required only to add a fixed client referrer to official YouTube embed player requests created by Bookmark Atlas. |

### Host Permission Justification

| Host | Justification |
|---|---|
| `https://suggestion.baidu.com/*` | Used only when the user selects Baidu to fetch search suggestions from Baidu's fixed suggestion endpoint. |
| `https://api.bing.com/*` | Used only when the user selects Bing to fetch search suggestions from Bing's fixed suggestion endpoint. |
| `https://suggestqueries.google.com/*` | Used only when the user selects Google to fetch search suggestions from Google's fixed suggestion endpoint. |
| `https://www.youtube.com/*` | Used only for official YouTube embed player requests and the limited client referrer rule described above. |

### Remote Code Answer

Select: No, I am not using remote code.

Justification if asked:

All extension JavaScript and assets are bundled in the submitted package. Remote
search suggestion responses, favicons, and embedded web pages are data or iframe
content for user-facing features; they are not loaded or executed as extension
code.

### User Data Categories

Declare these categories:

- Web history: used locally for user-visible pre-search history results.
- Website content / URLs: bookmark URLs, tab URLs, and user-added embed URLs
  used for the corresponding features.
- User-generated content: Excalidraw shapes, text, library items, and user-added
  attachments.

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

No test account or external credentials are required.

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
