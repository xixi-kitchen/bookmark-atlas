import { validateReleaseNotes } from './validate-release-notes.mjs';

const repository = 'https://github.com/xixi-kitchen/bookmark-atlas';
const store = 'https://chromewebstore.google.com/detail/bookmark-atlas/bkdplfepaegfdabniedlkaodllnmnbfl';
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const locales = ['en', 'zh-CN'];

export function validateReleaseStatus(status) {
  const fail = (condition, message) => { if (!condition) throw new Error(`Invalid release status: ${message}`); };
  fail(status && typeof status === 'object' && !Array.isArray(status), 'expected an object');
  for (const key of ['storeVersion', 'candidateVersion']) {
    fail(typeof status[key] === 'string' && stableVersion.test(status[key]), `${key} must be stable semver`);
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

/** Replace only the two plain-text status slots; preserve all surrounding homepage bytes. */
export function updateHomepageReleaseStatus(html, status) {
  validateReleaseStatus(status);
  let result = html;
  for (const locale of locales) {
    const attribute = new RegExp(`\\bdata-release-status=(["'])${locale}\\1`, 'g');
    const slot = new RegExp(`(<([a-z][a-z0-9-]*)\\b[^>]*\\bdata-release-status=(["'])${locale}\\3[^>]*>)([^<]*)(<\\/\\2\\s*>)`, 'gi');
    if ([...result.matchAll(attribute)].length !== 1 || [...result.matchAll(slot)].length !== 1) {
      throw new Error(`Homepage status slot ${locale} must occur exactly once and contain plain text`);
    }
    result = result.replace(slot, (_match, open, _tag, _quote, _text, close) => `${open}${escapeHtml(formatReleaseStatus(status, locale))}${close}`);
  }
  return result;
}

export function renderPublicReleases(entries, status) {
  validateReleaseStatus(status);
  validateReleaseNotes(entries, status.candidateVersion);
  if (!entries.some((entry) => entry.version === status.storeVersion)) throw new Error(`Missing public notes for store version ${status.storeVersion}`);
  const history = entries.slice().sort((a, b) => b.date.localeCompare(a.date) || compareVersions(b.version, a.version));
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="Bookmark Atlas release introductions, practical starting steps, and verified Chrome Web Store channel status in English and Chinese.">
  <title>Updates · Bookmark Atlas</title>
  <link rel="stylesheet" href="site.css">
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <div class="site-shell">
    <header class="site-nav">
      <a class="site-brand" href="index.html"><img src="store-assets/icon-128.png" width="38" height="38" alt="">Bookmark Atlas</a>
      <nav aria-label="Primary"><a href="guide.html">Get started</a><a href="changelog.html" aria-current="page">Updates</a><a href="support.html">Support</a><a href="#zh-cn" lang="zh-CN">中文</a><a href="${repository}">GitHub ↗</a></nav>
    </header>
    <main id="main-content" class="release-page">
      <header class="document release-header">
        <span class="eyebrow">Release introductions</span><h1>Updates</h1>
        <p class="lede">What changed, why it helps, and where to begin.</p>
        <p class="release-status">${escapeHtml(formatReleaseStatus(status, 'en'))}</p>
        <p>From v0.9.6, the version date is the package freeze date. Store submission and publication are separate events; a prepared package does not imply store approval.</p>
        <nav class="release-links" aria-label="Release links"><a href="${store}">Install the current Chrome version</a> · <a href="${repository}/releases">GitHub release archive</a> · <a href="#zh-cn">简体中文</a></nav>
      </header>
      <section aria-label="English release history">
${history.map((entry) => renderEntry(entry, status, 'en')).join('\n')}
      </section>
      <section id="zh-cn" lang="zh-CN" aria-labelledby="chinese-history">
        <header class="document release-header"><span class="eyebrow">简体中文 / 版本介绍</span><h2 id="chinese-history">更新记录</h2>
          <p class="release-status">${escapeHtml(formatReleaseStatus(status, 'zh-CN'))}</p>
          <p>从 v0.9.6 起，版本日期为正式包冻结日期。商店提交和实际上架分别记录；正式包准备完成不代表商店审核通过。</p>
        </header>
${history.map((entry) => renderEntry(entry, status, 'zh-CN')).join('\n')}
      </section>
    </main>
    <footer class="site-footer"><p>Bookmark Atlas <span>Make room for the things you save.</span></p><nav aria-label="Footer"><a href="index.html">Home</a><a href="guide.html">Guide</a><a href="privacy.html">Privacy</a><a href="support.html">Support</a><a href="${repository}">GitHub</a></nav></footer>
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
          <p class="release-links"><a href="${escapeHtml(href)}">${candidate ? (zh ? '候选版本发布说明（源文件）' : 'Candidate release notes (source)') : (zh ? '正式 GitHub 发布说明' : 'GitHub release notes')}</a> · <a href="guide.html${zh ? '#zh-cn' : ''}">${zh ? '上手指南' : 'Getting started guide'}</a></p>
        </article>`;
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
