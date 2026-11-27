import { parseProjectSupportConfig } from '../../src/support/config.mjs';

const escape = (value) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const checkLocale = (locale) => { if (locale !== 'en' && locale !== 'zh-CN') throw new Error('Unsupported project support locale.'); };

export function renderProjectSupportPage(input, locale = 'en') {
  checkLocale(locale);
  const config = parseProjectSupportConfig(input);
  const zh = locale === 'zh-CN';
  const assetBase = zh ? '../' : '';
  const enUrl = config.pageUrl;
  const zhUrl = new URL('zh/support-project.html', enUrl).href;
  const supportAssetsUrl = new URL('support-assets/', enUrl).href;
  const qrSource = (value) => {
    const url = new URL(value).href;
    return url.startsWith(supportAssetsUrl) ? `${assetBase}support-assets/${url.slice(supportAssetsUrl.length)}` : value;
  };
  const copy = zh ? {
    title: '自愿支持项目', description: '按自己的意愿支持 Bookmark Atlas 的持续维护。',
    skip: '跳到正文', guide: '使用指南', updates: '更新记录', help: '帮助', privacy: '隐私政策', home: '首页',
    primary: '主导航', footer: '页脚', switch: 'English', switchLabel: 'Switch this page to English',
    off: '自愿支持尚未启用。', offDetail: '你仍可正常使用 Bookmark Atlas 的现有功能，或通过 GitHub 提交反馈。',
    intro: '自愿支持用于 Bookmark Atlas 的维护与开发，不解锁功能，也不影响现有功能使用。',
    scan: '使用对应支付应用扫码。确认付款前，请核对应用显示的收款人和金额。',
    boundary: '付款由你选择的平台处理。Bookmark Atlas 官网和扩展不收集支付凭据或付款结果。',
    koFiButton: '通过 Ko-fi 支持', koFiDetail: '前往 Ko-fi 进行一次性支持。可用付款方式以结账页为准。', mainland: '中国大陆扫码支持',
    wechat: '微信支付', alipay: '支付宝', alt: '自愿支持收款码', fullSize: '查看原图',
  } : {
    title: 'Support Bookmark Atlas', description: 'Optional, voluntary support for the maintenance of Bookmark Atlas.',
    skip: 'Skip to content', guide: 'Guide', updates: 'Updates', help: 'Help', privacy: 'Privacy', home: 'Home',
    primary: 'Primary', footer: 'Footer', switch: '中文', switchLabel: '切换此页为简体中文',
    off: 'Voluntary support is not enabled.', offDetail: 'Existing Bookmark Atlas features remain available. You can also share feedback on GitHub.',
    intro: 'Voluntary support helps maintain and develop Bookmark Atlas. It does not unlock features or change access to existing features.',
    scan: 'Scan with the indicated payment app. Check the recipient and amount in that app before confirming payment.',
    boundary: 'Payment is handled by your chosen provider. The Bookmark Atlas website and extension do not collect payment credentials or results.',
    koFiButton: 'Support on Ko-fi', koFiDetail: 'Make a one-time contribution on Ko-fi. Available payment methods appear at checkout.', mainland: 'Scan to support in mainland China',
    wechat: 'WeChat Pay', alipay: 'Alipay', alt: 'QR code for voluntary support', fullSize: 'Open full-size QR code',
  };
  const methods = config.enabled ? [
    ['wechat', copy.wechat, config.wechatQrUrl], ['alipay', copy.alipay, config.alipayQrUrl],
  ].filter(([id, , url]) => url && config.channelEnabled?.[id] !== false) : [];
  const koFi = config.enabled && config.koFiUrl && config.channelEnabled?.koFi !== false
    ? `<section class="project-support-section"><h2>Ko-fi</h2><p>${copy.koFiDetail}</p><div class="actions"><a data-support-channel="ko-fi" href="${escape(config.koFiUrl)}" target="_blank" rel="noopener noreferrer">${copy.koFiButton}</a></div></section>` : '';
  const renderQr = ([id, label, url]) => {
    const src = escape(qrSource(url));
    return `<figure><figcaption><h3>${label}</h3></figcaption><img data-payment-code="${id}" src="${src}" alt="${label}: ${copy.alt}" referrerpolicy="no-referrer" decoding="async"><a class="text-link" href="${src}" target="_blank" rel="noopener noreferrer" aria-label="${label} · ${copy.fullSize}">${copy.fullSize}</a></figure>`;
  };
  const mainland = methods.length > 0
    ? `<section class="project-support-section"><h2>${copy.mainland}</h2><p>${copy.scan}</p><div class="project-support-methods">${methods.map(renderQr).join('')}</div></section>` : '';
  const body = config.enabled
    ? `<p class="lede">${copy.intro}</p>${koFi}${mainland}<p class="small-copy">${copy.boundary}</p>`
    : `<p class="lede">${copy.off}</p><p>${copy.offDetail}</p>`;
  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="${copy.description}">
  <title>${copy.title} · Bookmark Atlas</title>
  <link rel="canonical" href="${escape(zh ? zhUrl : enUrl)}">
  <link rel="alternate" hreflang="en" href="${escape(enUrl)}">
  <link rel="alternate" hreflang="zh-CN" href="${escape(zhUrl)}">
  <link rel="stylesheet" href="${assetBase}site.css">
</head>
<body>
  <a class="skip-link" href="#main-content">${copy.skip}</a>
  <div class="site-shell">
    <header class="site-nav">
      <a class="site-brand" href="index.html"><img src="${assetBase}store-assets/icon-128.png" width="38" height="38" alt="">Bookmark Atlas</a>
      <nav aria-label="${copy.primary}"><a href="guide.html">${copy.guide}</a><a href="changelog.html">${copy.updates}</a><a href="support.html">${copy.help}</a><a class="language-switch" href="${zh ? '../support-project.html' : 'zh/support-project.html'}" lang="${zh ? 'en' : 'zh-CN'}" hreflang="${zh ? 'en' : 'zh-CN'}" aria-label="${copy.switchLabel}">${copy.switch}</a><a href="https://github.com/xixi-kitchen/bookmark-atlas">GitHub</a></nav>
    </header>
    <main id="main-content"><article class="document"><h1>${copy.title}</h1>${body}</article></main>
    <footer class="site-footer"><p>Bookmark Atlas</p><nav aria-label="${copy.footer}"><a href="index.html">${copy.home}</a><a href="guide.html">${copy.guide}</a><a href="privacy.html">${copy.privacy}</a><a href="support.html">${copy.help}</a></nav></footer>
  </div>
</body>
</html>
`;
}

export function updateHomepageSupportSlot(html, input, locale = 'en') {
  checkLocale(locale);
  const config = parseProjectSupportConfig(input);
  const marker = new RegExp(`\\bdata-project-support\\s*=\\s*(["'])${locale}\\1`, 'g');
  const slot = new RegExp(`(<div\\b[^>]*\\bdata-project-support\\s*=\\s*(["'])${locale}\\2[^>]*>)([\\s\\S]*?)(<\\/div\\s*>)`, 'gi');
  if ([...html.matchAll(/\bdata-project-support\s*=/g)].length !== 1
    || [...html.matchAll(marker)].length !== 1 || [...html.matchAll(slot)].length !== 1) {
    throw new Error(`Invalid project support slot: ${locale}`);
  }
  const content = config.enabled ? `<a class="text-link" href="support-project.html">${locale === 'zh-CN' ? '自愿支持项目' : 'Support this project'}</a>` : '';
  return html.replace(slot, (_match, open, _quote, _content, close) => `${open}${content}${close}`);
}
