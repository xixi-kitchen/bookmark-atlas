# Bookmark Atlas v{{VERSION}} — Edge acceptance / Edge 验收

Status: development acceptance candidate. This is not an Edge Add-ons submission or a claim of completed device acceptance.

状态：开发验收候选包，不代表已提交 Edge 商店或已通过真实设备验收。

Fixed public test extension ID / 固定公开测试扩展 ID: `{{TEST_EXTENSION_ID}}`

The manifest contains a public test key, not a private key or account credential. This Edge identity is separate from the Chrome test build and store extension. Do not copy Chrome profile data or credentials into this package.

Manifest 中仅有公开测试密钥，不包含私钥或账号凭据。Edge 测试 ID 与 Chrome 测试版、商店版相互独立。不要向包内复制 Chrome 用户配置或凭据。

## 中文

### 生成与安装

在项目目录执行 `npm run build:edge`，随后执行 `node scripts/create-sync-test-package.mjs edge`。使用生成的 `output/bookmark-atlas-<版本>-edge-sync-test.zip`、同名 `.sha256` 和可见目录 `output/edge-sync-test-mv3/`。ZIP 内的 `EDGE-ACCEPTANCE-TEST.md` 会填入实际版本与 ID。

1. 首轮本机功能测试使用单独的 Edge 测试配置与示例收藏夹。打开 `edge://extensions`，开启开发者模式，加载含 `manifest.json` 的上述可见目录或 ZIP 解压目录。
2. 此验收包保留真实的新标签页覆盖。启用后新标签页会打开 Bookmark Atlas；若 Edge 提示确认变更，按实际提示记录启用状态。其他新标签页扩展若冲突，可暂时停用并记录；无需卸载。
3. 确认版本为 `{{VERSION}}`，ID 为 `{{TEST_EXTENSION_ID}}`；重启 Edge 后再次验证新标签页和弹窗。
4. 两设备同步测试须在两端使用同一受支持的 **Edge 账号**，确认相关同步设置已开启，并记录收藏夹、扩展及账号同步状态。两端加载相同测试包且扩展 ID 必须一致。ID 或账号不同则测试条件不成立。
5. 无需登录 Chrome、从 Chrome 导入数据或安装 Chrome 测试包。此包不会自动迁移 Chrome 数据，也不提供 Chrome、Edge、Safari 之间的同步。完整备份导入属于另行明确选择的操作。

### 本机验收

使用示例 URL、示例收藏夹和测试服务商凭据；记录系统、Edge 版本、扩展版本/ID、操作、预期、实际结果及证据。未执行的项目标记“未验收”。

- [ ] **收藏夹：** 读取本机原生收藏夹；新增、改名、编辑 URL、移动、重排、删除与撤销；验证系统目录和受管理目录边界。原生收藏夹的同步由 Edge 收藏夹设置管理。
- [ ] **检索：** 默认搜索遵循 Edge 当前设置；书签/收藏夹、标签页、历史、本地结果激活和远程联想分别验证。验证中英文显示及切换语言后画布仍保留。
- [ ] **图标：** 有缓存网站正常显示图标；无缓存或失败时显示文字回退。
- [ ] **弹窗收藏：** 普通 HTTP(S) 页面可收藏；`edge://`、扩展页面、文件和 InPrivate 页面不可收藏。验证“添加后打开画布”开/关、重开后保留、不开画布时的本机队列、稍后首次插入、重复点击与错误恢复。不要把入队成功当作画布已保存。
- [ ] **画布和本机多页：** 同标签页编辑/重开持久化；两张同配置扩展页自动接收修改；视口与工具不互相抢占；导入前保留原始备份，验证完整导出/恢复与附件。
- [ ] **嵌入：** YouTube、Bilibili 和普通 HTTPS 网页；检查 YouTube 请求规则、播放及站点限制；尝试嵌入内容导航，确认不能替换扩展顶层页面。失败时记录站点限制或规则错误。
- [ ] **AI 权限与隐私：** 由连接按钮申请选定 HTTPS 来源权限；拒绝/撤销权限后不得发送请求。确认所选元数据范围、预览、明确应用与撤销，不重排无关原生收藏夹；检查超时、取消和错误提示。
- [ ] **AI 本机凭据：** 保存后刷新、关闭页面、重启 Edge仍能使用；两页同时保存/清除结果一致。仅本机密文与 IndexedDB 不可导出密钥；缺失密钥时明确报错，不回退明文。配置/凭据不进入备份或同步，另一设备须单独配置。此存储不是系统钥匙串。
- [ ] **引导与社区：** 首装引导、跳过、手动打开、学习进度、版本更新提示和跨页记录；中英文与在线教程/反馈链接；不发送学习遥测；赞助入口保持关闭。

### 同一 Edge 账号的真实双设备验收

先使用不含图片的小画布。原生收藏夹与画布轻量数据是独立同步链路，应分别记录结果；画布会重新关联本设备收藏夹，不能依赖另一设备的本地收藏夹 ID。

- [ ] A 新增带唯一时间标记的文字；B 保持打开且不刷新，观察其自动出现，再反向测试。记录实际等待时间与账号状态。
- [ ] 仅修改 A 的缩放、平移、侧栏和工具；B 的视口不应跳动，也不应出现内容冲突。
- [ ] 关闭 B 的画布页，A 修改；重新打开 B，检查恢复的新内容。
- [ ] 两端从同一基线断网，分别编辑，再依次联网；检查真实冲突选择、选定后的收敛和不重复弹窗。
- [ ] 分别新增/修改原生收藏夹，独立确认 Edge 收藏夹同步及画布引用关联。
- [ ] 验证图片/二进制附件仍只在原设备，超过轻量配额、离线和账号同步不可用时提示准确，本机完整画布仍保留。

`chrome.storage.sync.set` 成功或界面显示“已同步”只说明扩展写入浏览器同步存储，不能单独证明数据已进入云端或另一设备。以另一真实设备收到对应内容作为跨设备证据；没有新的固定送达时间承诺。未收到时记录等待时长、设置与网络，不宣布已通过。

## English

### Build and install

Run `npm run build:edge`, then `node scripts/create-sync-test-package.mjs edge`. Use `output/bookmark-atlas-<version>-edge-sync-test.zip`, its `.sha256`, or the visible `output/edge-sync-test-mv3/` directory. The packaged `EDGE-ACCEPTANCE-TEST.md` substitutes the actual version and ID.

1. Start local checks in a separate Edge test profile with synthetic favorites. Open `edge://extensions`, enable Developer mode, and load the visible folder or extracted ZIP containing `manifest.json`.
2. This acceptance build retains its real new-tab override: enabled new tabs open Bookmark Atlas. Record any Edge confirmation and the resulting enabled state. Temporarily disable a conflicting new-tab extension if needed; do not uninstall it.
3. Confirm version `{{VERSION}}` and ID `{{TEST_EXTENSION_ID}}`. Restart Edge and recheck the new tab and toolbar popup.
4. For two-device sync, sign in with the **same supported Edge account**, enable the relevant sync settings, and record favorites/extension/account sync state. Load the same test package with the same extension ID on both devices. Different IDs or accounts invalidate the test conditions.
5. No Chrome sign-in, Chrome import, or Chrome test build is required. There is no automatic Chrome migration or Chrome–Edge–Safari sync. Importing a full backup is a separate explicit choice.

### Local checks

Use synthetic URLs/favorites and test provider credentials. Record OS, Edge version, extension version/ID, steps, expected/actual behavior, and evidence. Mark unperformed checks as unaccepted.

- [ ] **Favorites:** read, create, edit, move, reorder, delete, undo; protect system/managed folders. Native favorites sync is controlled by Edge favorites settings.
- [ ] **Search and language:** current Edge default provider, favorites/tabs/history, local-result activation, remote suggestions, and English/Chinese switching without resetting the canvas.
- [ ] **Favicons:** cached icons and text fallback on missing/failed icons.
- [ ] **Capture popup:** HTTP(S) capture; reject `edge://`, extension, file and InPrivate pages. Test Open canvas after adding on/off, persistence, queued insertion after opening the canvas, retries and duplicate clicks. Queue success alone is not canvas-save success.
- [ ] **Canvas:** persistence within the same tab and after reopening; updates between two extension tabs; local viewport/tool isolation; full backup/restore and attachments with the original retained.
- [ ] **Embeds:** YouTube request rule/player, Bilibili, ordinary HTTPS, site restrictions, and blocked top-level navigation from embedded content.
- [ ] **AI permissions/privacy:** exact HTTPS origin requested from the connect button; no request after denial/revocation; selected-metadata consent, preview, explicit apply/undo, unrelated favorites unchanged, cancellation/timeout/error handling.
- [ ] **Local credential vault:** saved credentials survive refresh/page close/Edge restart; concurrent save/clear is consistent. Credentials use local ciphertext and a nonextractable IndexedDB key, with explicit failure if the key is missing and no plaintext fallback. Config/credentials are excluded from sync/backups; configure the other device separately. This is not an OS keychain.
- [ ] **Education/community:** fresh-install guide, skip/manual reopen, learning progress, update notice and cross-tab records; both languages, online guide/feedback links, no learning telemetry, sponsorship remains disabled.

### Real two-device checks within Edge

Start with a small canvas without images. Native favorites and lightweight canvas data have independent sync mechanisms; record both. Canvas references must reconcile to this device's favorites rather than treating another profile's local IDs as shared IDs.

- [ ] Add unique timestamped text on A; keep B open without refresh and observe receipt. Repeat B to A, recording elapsed time and account state.
- [ ] Pan, zoom, change tools and sidebar on A only; B keeps its viewport and neither device reports a content conflict.
- [ ] Close B's canvas, edit A, then reopen B and verify the new content.
- [ ] Edit both devices offline from a common baseline, reconnect in sequence, and verify a real conflict choice, convergence after selection, and no repeated prompt.
- [ ] Separately create/edit native favorites and confirm Edge favorites sync plus canvas reference reconciliation.
- [ ] Images/binary attachments stay on their source device. Verify quota/offline/unavailable-sync messaging and preservation of the complete local canvas.

A successful `chrome.storage.sync.set` or a “synced” UI state confirms a browser sync-storage write; it does not alone prove cloud or remote-device delivery. Receipt on another real device is the cross-device evidence. No new fixed delivery SLA is promised. If delivery is absent, record elapsed time/settings/network and leave acceptance open.
