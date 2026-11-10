import { validateReleaseNotes } from './validate-release-notes.mjs';

const repository = 'https://github.com/xixi-kitchen/bookmark-atlas';
const store = 'https://chromewebstore.google.com/detail/bookmark-atlas/bkdplfepaegfdabniedlkaodllnmnbfl';
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const locales = ['en', 'zh-CN'];

export function validateReleaseStatus(status) {
  validateChannelStatus(status);
}

function validateChannelStatus(status, allowFirstStoreVersion = false) {
  const fail = (condition, message) => { if (!condition) throw new Error(`Invalid release status: ${message}`); };
  fail(status && typeof status === 'object' && !Array.isArray(status), 'expected an object');
  for (const key of ['storeVersion', 'candidateVersion']) {
    fail((allowFirstStoreVersion && key === 'storeVersion' && status[key] === null)
      || (typeof status[key] === 'string' && stableVersion.test(status[key])), `${key} must be stable semver`);
  }
  fail(['preparing', 'submitted', 'published'].includes(status.stage), 'unknown stage');
  fail(calendarDate(status.preparedAt), 'preparedAt must be a real ISO calendar date');
  if (status.stage === 'preparing') {
    fail(status.submittedAt === null && status.publishedAt === null, 'preparing cannot claim submission or publication');
  } else {
    fail(calendarDate(status.submittedAt) && status.submittedAt >= status.preparedAt, 'submittedAt must follow preparation');
  }
  if (status.stage === 'published') {
    fail(status.storeVersion === status.candidateVersion, 'published candidate must match the store version');
    fail(calendarDate(status.publishedAt) && status.publishedAt >= status.submittedAt, 'publishedAt must follow submission');
  } else {
    fail(status.storeVersion !== status.candidateVersion, 'unpublished candidate must differ from the store version');
    fail(status.publishedAt === null, 'unpublished candidate cannot have publishedAt');
  }
}

/** Edge can prepare its first store release before a public store version exists. */
export function validateEdgeReleaseStatus(status) {
  const fail = (condition, message) => { if (!condition) throw new Error(`Invalid Edge release status: ${message}`); };
  fail(status && typeof status === 'object' && !Array.isArray(status), 'expected an object');
  fail(status.browser === 'edge', 'browser must be edge');
  fail(status.draftId === null || (typeof status.draftId === 'string' && status.draftId.trim().length > 0), 'draftId must be a non-empty string or null');
  validateChannelStatus(status, true);
}

export function formatReleaseStatus(status, locale) {
  validateReleaseStatus(status);
  if (!locales.includes(locale)) throw new Error(`Unsupported release status locale: ${locale}`);
  const { storeVersion, candidateVersion, stage, submittedAt, publishedAt } = status;
  if (locale === 'zh-CN') {
    const current = `Chrome 商店当前版本：${storeVersion}。`;
    if (stage === 'published') return `${current}实际上架日期：${publishedAt}。`;
    return stage === 'submitted'
      ? `${current}候选版本 ${candidateVersion} 已于 ${submittedAt} 提交审核，尚未上架。`
      : `${current}候选版本 ${candidateVersion} 正在准备发布。`;
  }
  const current = `Chrome Web Store: ${storeVersion}.`;
  if (stage === 'published') return `${current} Published on ${publishedAt}.`;
  return stage === 'submitted'
    ? `${current} Candidate ${candidateVersion} was submitted for review on ${submittedAt} and is not yet published.`
    : `${current} Candidate ${candidateVersion} is being prepared for release.`;
}

/** Replace one locale's plain-text status slot; preserve all surrounding homepage bytes. */
export function updateHomepageReleaseStatus(html, status, locale = 'en') {
  validateReleaseStatus(status);
  validateLocale(locale);
  const attribute = new RegExp(`\\bdata-release-status\\s*=\\s*(["'])${locale}\\1`, 'g');
  const slot = new RegExp(`(<([a-z][a-z0-9-]*)\\b[^>]*\\bdata-release-status\\s*=\\s*(["'])${locale}\\3[^>]*>)([^<]*)(<\\/\\2\\s*>)`, 'gi');
  if ([...html.matchAll(attribute)].length !== 1 || [...html.matchAll(slot)].length !== 1) {
    throw new Error(`Homepage status slot ${locale} must occur exactly once and contain plain text`);
  }
  return html.replace(slot, (_match, open, _tag, _quote, _text, close) => `${open}${escapeHtml(formatReleaseStatus(status, locale))}${close}`);
}

export function renderPublicReleases(entries, status, locale = 'en') {
  validateLocale(locale);
  validateReleaseStatus(status);
  // Validate every record, including hidden channels, before applying Chrome scope.
  validateReleaseNotes(entries, status.candidateVersion, 'chrome');
  entries = entries.filter((entry) => !entry.browsers || entry.browsers.includes('chrome'));
  if (!entries.some((entry) => entry.version === status.storeVersion)) throw new Error(`Missing public notes for store version ${status.storeVersion}`);
  const history = entries.slice().sort((a, b) => b.date.localeCompare(a.date) || compareVersions(b.version, a.version));
  const zh = locale === 'zh-CN';
  const assetBase = zh ? '../' : '';
  const peerLocale = zh ? 'en' : 'zh-CN';
  const peerHref = zh ? '../changelog.html' : 'zh/changelog.html';
  const text = zh ? {
    description: 'Bookmark Atlas 版本介绍、上手步骤与经过核实的 Chrome 商店发布状态。',
    title: '更新记录', skip: '跳转到内容', primary: '主导航', guide: '使用指南', support: '帮助',
    switch: 'English', switchLabel: 'Switch to English', eyebrow: '版本介绍',
    lede: '了解改进内容、带来的帮助，以及从哪里开始。',
    dates: '从 v0.9.6 起，版本日期为正式包冻结日期。商店提交和实际上架分别记录；正式包准备完成不代表商店审核通过。',
    releaseLinks: '发布链接', install: '安装 Chrome 商店当前版本', archive: 'GitHub 发布存档', history: '版本历史',
    tagline: '为收藏的事物，留一片天地。', footer: '页脚导航', home: '首页', privacy: '隐私政策',
  } : {
    description: 'Bookmark Atlas release introductions, practical starting steps, and verified Chrome Web Store channel status.',
    title: 'Updates', skip: 'Skip to content', primary: 'Primary', guide: 'Guide', support: 'Help',
    switch: '中文', switchLabel: '切换到简体中文', eyebrow: 'Release introductions',
    lede: 'What changed, why it helps, and where to begin.',
    dates: 'From v0.9.6, the version date is the package freeze date. Store submission and publication are separate events; a prepared package does not imply store approval.',
    releaseLinks: 'Release links', install: 'Install the current Chrome version', archive: 'GitHub release archive', history: 'Release history',
    tagline: 'Make room for the things you save.', footer: 'Footer', home: 'Home', privacy: 'Privacy',
  };
  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="${text.description}">
  <title>${text.title} · Bookmark Atlas</title>
  <link rel="stylesheet" href="${assetBase}site.css">
  <link rel="canonical" href="https://xixi-kitchen.github.io/bookmark-atlas/${zh ? 'zh/' : ''}changelog.html">
  <link rel="alternate" hreflang="en" href="https://xixi-kitchen.github.io/bookmark-atlas/changelog.html">
  <link rel="alternate" hreflang="zh-CN" href="https://xixi-kitchen.github.io/bookmark-atlas/zh/changelog.html">
</head>
<body>
  <a class="skip-link" href="#main-content">${text.skip}</a>
  <div class="site-shell">
    <header class="site-nav">
      <a class="site-brand" href="index.html"><img src="${assetBase}store-assets/icon-128.png" width="38" height="38" alt="">Bookmark Atlas</a>
      <nav aria-label="${text.primary}"><a href="guide.html">${text.guide}</a><a href="changelog.html" aria-current="page">${text.title}</a><a href="support.html">${text.support}</a><a class="language-switch" href="${peerHref}" lang="${peerLocale}" hreflang="${peerLocale}" aria-label="${text.switchLabel}">${text.switch}</a><a href="${repository}">GitHub ↗</a></nav>
    </header>
    <main id="main-content" class="release-page">
      <header class="document release-header">
        <h1>${text.title}</h1>
        <p class="lede">${text.lede}</p>
        <p class="release-status">${escapeHtml(formatReleaseStatus(status, locale))}</p>
        <p>${text.dates}</p>
        <nav class="release-links" aria-label="${text.releaseLinks}"><a href="${store}">${text.install}</a><a href="${repository}/releases">${text.archive}</a></nav>
      </header>
      <section aria-label="${text.history}">
${history.map((entry) => renderEntry(entry, status, locale)).join('\n')}
      </section>
    </main>
    <footer class="site-footer"><p>Bookmark Atlas <span>${text.tagline}</span></p><nav aria-label="${text.footer}"><a href="index.html">${text.home}</a><a href="guide.html">${text.guide}</a><a href="privacy.html">${text.privacy}</a><a href="support.html">${text.support}</a><a href="${repository}">GitHub</a></nav></footer>
  </div>
</body>
</html>
`.replace(/[\t ]+$/gm, '');
}

function renderEntry(entry, status, locale) {
  const zh = locale === 'zh-CN';
  const categories = zh
    ? { added: '新增', changed: '改进', fixed: '修复', security: '安全', deprecated: '弃用', removed: '移除' }
    : { added: 'Added', changed: 'Changed', fixed: 'Fixed', security: 'Security', deprecated: 'Deprecated', removed: 'Removed' };
  const candidate = entry.version === status.candidateVersion && status.stage !== 'published';
  const href = candidate ? `${repository}/blob/main/docs/releases/v${entry.version}.md` : `${repository}/releases/tag/v${entry.version}`;
  const dateLabel = compareVersions(entry.version, '0.9.6') >= 0
    ? (zh ? '正式包冻结日期' : 'Package freeze date') : (zh ? '历史发布日期' : 'Historical release date');
  const publication = entry.version === status.candidateVersion && status.stage === 'published'
    ? `<p class="release-meta">${zh ? 'Chrome 实际上架日期' : 'Chrome publication date'}: <time datetime="${escapeHtml(status.publishedAt)}">${escapeHtml(status.publishedAt)}</time></p>` : '';
  return `        <article class="document release-entry" id="${escapeHtml(`v${entry.version}-${locale}`)}">
          <p class="eyebrow">${escapeHtml(`v${entry.version}`)}${candidate ? (zh ? ' · 候选版本' : ' · Candidate') : ''}</p>
          <h2>${escapeHtml(entry.title[locale])}</h2>
          <p class="release-meta">${dateLabel}: <time datetime="${escapeHtml(entry.date)}">${escapeHtml(entry.date)}</time></p>
          ${publication}
          <p class="release-summary">${escapeHtml(entry.summary[locale])}</p>
${entry.sections.map((section) => `          <section class="release-section"><h3>${categories[section.type]}</h3><ul>
${section.items.map((item) => `            <li><strong>${escapeHtml(item.title[locale])}</strong><p>${escapeHtml(item.description[locale])}</p>${item.where ? `<p class="small-copy">${zh ? '入口' : 'Where'}: ${escapeHtml(item.where[locale])}</p>` : ''}</li>`).join('\n')}
          </ul></section>`).join('\n')}
          <section class="release-section"><h3>${zh ? '开始使用' : 'Getting started'}</h3><ol>${entry.gettingStarted.map((item) => `<li>${escapeHtml(item[locale])}</li>`).join('')}</ol></section>
          <section class="release-section"><h3>${zh ? '更新须知' : 'Notices'}</h3><ul>${entry.notices.map((item) => `<li>${escapeHtml(item[locale])}</li>`).join('')}</ul></section>
          <p class="release-links"><a href="${escapeHtml(href)}">${candidate ? (zh ? '候选版本发布说明（源文件）' : 'Candidate release notes (source)') : (zh ? '正式 GitHub 发布说明' : 'GitHub release notes')}</a><a href="guide.html">${zh ? '上手指南' : 'Getting started guide'}</a></p>
        </article>`;
}

function validateLocale(locale) {
  if (!locales.includes(locale)) throw new Error(`Unsupported public release locale: ${locale}`);
}

function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function compareVersions(a, b) {
  const left = a.split('.').map(Number); const right = b.split('.').map(Number);
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
