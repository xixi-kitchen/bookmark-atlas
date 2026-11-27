# Voluntary support / 自愿支持配置

项目使用静态中英文支持页。Ko-fi 付款在其官方页面完成，微信与支付宝由对应应用处理。Chrome、Edge 扩展只读取生成的 `src/support/support-entry.json`，其中只有官网地址和入口开关。

## 渠道开关 / Channel switches

修改 `src/support/support.config.json`：

- `enabled` 是总开关。关闭时首页与插件入口隐藏，直接访问支持页显示尚未启用。
- `channelEnabled.koFi`、`channelEnabled.wechat` 和 `channelEnabled.alipay` 单独控制对应渠道。关掉某个渠道时可保留其地址。总开关打开时至少需要一个有效渠道。
- `koFiUrl` 填官方 `https://ko-fi.com/<用户名>` 主页。网址须为 HTTPS，无查询参数、片段或账户凭据。
- `wechatQrUrl`、`alipayQrUrl` 填允许用于公开网页场景的收款码图片 HTTPS 地址。同站 `support-assets/` 下的图片在生成页面中使用相对路径，便于本地预览。
- `pageUrl` 是英文官网的固定 `/support-project.html` 地址。中文页面为相邻的 `zh/support-project.html`。

维护者配置后运行 `npm run support:generate` 及 `npm run support:check`。首版启用入口需随扩展更新，之后调整单个渠道只需重新生成和部署官网。GitHub README 链接也指向这两个固定页面。

## Private originals / 私有原图

The supplied originals are retained byte-for-byte only in the ignored local directory `output/private-support-assets/`:

- `wechat-original.jpg`
- `alipay-original.jpg`

The generator does not read or copy these originals. Approved display copies live under `docs/support-assets/` and are served only by the website. A source bundle is not a backup of ignored private assets; keep a separate private copy if needed.

原图保存在上述被 Git 忽略的目录。生成器不会读取或复制原图。经确认可公开展示的副本放在 `docs/support-assets/`，二维码不进入扩展安装包。

This private directory is not an encrypted vault. Existing OS/cloud-drive backup settings still apply to the workspace; this feature does not add an upload or synchronization process.

该目录不等于加密保险柜；如果整个工作区受系统云盘或备份管理，仍按你原有系统设置处理。本功能不额外上传或同步图片。

## 验收和停用 / Acceptance and shutdown

- 公开前核对 Ko-fi 仅提供一次性支持，匿名访客能打开页面。确认两个二维码在支付应用中显示预期收款人。
- 分别打开桌面和手机上的中英文支持页，从中国大陆网络验证官网、码图和付款入口的可达性。
- 下架渠道时关闭相应开关并部署官网。需要停止收款时，在支付平台停用入口或撤销码。隐藏官网入口不会撤回历史截图、缓存或 Git 历史中的图像副本。

`npm run support:generate` 和 `npm run support:check` 只操作本地。两者都不会上传文件或发起支付。
