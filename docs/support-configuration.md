# Optional voluntary support / 自愿支持配置

This is a maintainer-controlled, build-time switch. It is not a payment system, subscription, feature unlock, remote feature flag, or an end-user setting.

这是维护者构建期配置，不是收费、订阅、会员解锁、远程开关，也不允许普通用户更换开发者收款信息。

## Default / 默认状态

`src/support/support.config.json` defaults to:

```json
{
  "enabled": false,
  "pageUrl": "https://xixi-kitchen.github.io/bookmark-atlas/support-project.html",
  "wechatQrUrl": "",
  "alipayQrUrl": ""
}
```

- `enabled: false`: hide the extension and homepage support entries. The direct support page shows a neutral not-enabled notice and contains no payment-code images or configured QR URLs.
- `enabled: true`: show only channels with a configured image URL; at least one is required. Empty `wechatQrUrl` or `alipayQrUrl` hides that channel.
- `pageUrl` is the English canonical support page, ending in `/support-project.html`, without query/fragment or credentials. The Chinese link resolves to the sibling `zh/support-project.html`. Update the domain/project prefix if hosting changes; keep this filename.
- All nonempty URLs must be public, credential-free HTTPS URLs. Do not put local paths, data URLs, API keys, payment tokens or account login links here. Invalid enabled configuration fails generation; the extension entry fails closed instead of breaking settings.

当前默认关闭。开启时至少填写一种二维码图片的公开 HTTPS 地址；另一种留空即可隐藏。`pageUrl` 必须是英文支持页的完整地址，固定以 `/support-project.html` 结尾，中文自动定位到同目录下 `zh/support-project.html`。不支持本机路径、data/file/javascript 链接或含账号密码的地址。

## Private originals / 私有原图

The supplied originals are retained byte-for-byte only in the ignored local directory `output/private-support-assets/`:

- `wechat-original.jpg`
- `alipay-original.jpg`

Those files are not referenced by the renderer, copied to docs/public, included in the extension, scanned, decoded, or published by any support command. A source bundle is not a backup of ignored private assets; keep a separate private copy if needed.

用户原图仅保存在上述可见本机目录中，被 Git 忽略。生成器不读取或复制它们，插件不打包二维码图片。不要直接把这个目录加入 Git、公开网站、Release 附件或扩展的 public 目录；关闭状态不需要配置真实图片地址。

This private directory is not an encrypted vault. Existing OS/cloud-drive backup settings still apply to the workspace; this feature does not add an upload or synchronization process.

该目录不等于加密保险柜；如果整个工作区受系统云盘或备份管理，仍按你原有系统设置处理。本功能不额外上传或同步图片。

## Enabling later / 日后启用

1. Confirm the payment provider permits the intended public online voluntary-support use, and check recipient information shown by the app. Do not use payment/charging authorization codes.
2. Obtain the owner's explicit approval before making either real image public. Prepare static images at approved public HTTPS URLs. This manual step is intentionally not automated by this project.
3. Fill the approved image URL(s), set `enabled` to `true`, and run `npm run support:generate` followed by `npm run support:check`. Preview both independent language pages and confirm the recipient and scan result yourself.
4. Publish the support page only under separately granted website-publication authority. Check the public `pageUrl` and Chinese counterpart before shipping an extension with its link enabled.
5. Rebuild/test/release the extension separately when authorized. Changing this file does not immediately change an already installed store extension. No background config fetch or polling is added.

日后启用顺序：支付机构确认使用条件 → 用户明确允许公开原图 → 准备公开静态图片地址 → 填配置、开启、生成并本地验收 → 单独授权部署支持页 → 确认公开页面可用 → 另行构建、测试和发布扩展。不能只改本机配置就宣称商店版已开启。

## Turning off / 关闭

Set `enabled` back to `false`, run `npm run support:generate`, and verify with `npm run support:check`. Generated pages no longer show QR images/URLs and homepage entries disappear. Rebuild/deploy the relevant website/extension to affect users.

Turning visibility off does **not** revoke previously published image URLs, CDN caches, Git history, screenshots, or old extension versions. Remove/revoke previously public payment assets through their host/payment provider if that is needed. The generation script never deletes unrelated files or attempts remote revocation.

关闭是隐藏入口和页面收款码，并不撤回此前公开的图片地址、CDN缓存、Git历史、截图或旧扩展版本。需要彻底撤销时，应在对应托管或支付服务中另行处理，不能把隐藏开关当作撤销收款能力。

## Commands / 命令

- `npm run support:generate`: local generation only; never uploads files or performs payment/network requests.
- `npm run support:check`: validates current configuration and generated files without writing them.
- `npm run docs:release` and `npm run verify:release` also include the support generation/check, keeping release status and support visibility in sync.

GitHub `FUNDING.yml` has not been activated. If added later, its custom link should lead to the approved support page; GitHub does not read this project's JSON switch automatically.
