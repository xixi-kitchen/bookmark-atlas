import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import catalogue from '../../src/onboarding/releaseNotes.json';

import { formatReleaseStatus, renderPublicReleases, updateHomepageReleaseStatus, validateEdgeReleaseStatus, validateReleaseStatus } from '../../scripts/lib/public-releases.mjs';

// The Chrome renderer fixture stays pinned to its historical channel releases.
const entries = catalogue.filter((entry) => ['0.9.6', '0.9.5'].includes(entry.version));

const status = {
  storeVersion: '0.9.5', candidateVersion: '0.9.6', stage: 'preparing' as const,
  preparedAt: '2026-10-21', submittedAt: null, publishedAt: null,
};
const submitted = { ...status, stage: 'submitted' as const, submittedAt: '2026-10-22' };
const edgeStatus = {
  browser: 'edge' as const, storeVersion: null, candidateVersion: '0.9.7', stage: 'preparing' as const,
  preparedAt: '2026-10-26', submittedAt: null, publishedAt: null, draftId: null,
};
const edgeEntry = { ...structuredClone(entries[0]!), version: '0.9.7', date: '2026-10-26', browsers: ['edge'] };
const published = { ...submitted, stage: 'published' as const, storeVersion: '0.9.6', publishedAt: '2026-10-23' };
const homepage = '<main><h1>Keep this page intact</h1><p class="release-status" data-release-status="en">old English</p><a href="guide.html">Go</a></main>';
const chineseHomepage = '<main><h1>保留页面原文</h1><p class="release-status" data-release-status="zh-CN">旧状态</p><a href="guide.html">指南</a></main>';
const locales = ['en', 'zh-CN'] as const;
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('public release channel status', () => {
  it('keeps the public store version separate from a package being prepared or reviewed', () => {
    expect(formatReleaseStatus(status, 'en')).toBe('Chrome Web Store: 0.9.5. Candidate 0.9.6 is being prepared for release.');
    expect(formatReleaseStatus(status, 'zh-CN')).toBe('Chrome 商店当前版本：0.9.5。候选版本 0.9.6 正在准备发布。');
    expect(formatReleaseStatus(submitted, 'en')).toBe('Chrome Web Store: 0.9.5. Candidate 0.9.6 was submitted for review on 2026-10-22 and is not yet published.');
    expect(formatReleaseStatus(submitted, 'zh-CN')).toBe('Chrome 商店当前版本：0.9.5。候选版本 0.9.6 已于 2026-10-22 提交审核，尚未上架。');
    expect(formatReleaseStatus(published, 'en')).toBe('Chrome Web Store: 0.9.6. Published on 2026-10-23.');
    expect(formatReleaseStatus(published, 'zh-CN')).toBe('Chrome 商店当前版本：0.9.6。实际上架日期：2026-10-23。');
  });

  it.each([
    { ...status, stage: 'approved' }, { ...status, storeVersion: 'v0.9.5' },
    { ...status, candidateVersion: '0.9.6-beta' }, { ...status, storeVersion: '0.9.6' },
    { ...status, preparedAt: '2026-02-29' }, { ...status, preparedAt: '2026-13-01' },
    { ...status, submittedAt: '2026-10-22' }, { ...submitted, submittedAt: null },
    { ...submitted, submittedAt: '2026-10-20' }, { ...submitted, publishedAt: '2026-10-23' },
    { ...published, storeVersion: '0.9.5' }, { ...published, publishedAt: null },
    { ...published, publishedAt: '2026-10-21' }, { ...published, publishedAt: '2026-10-32' },
  ])('rejects an invalid or misleading channel state %j', (input) => {
    expect(() => validateReleaseStatus(input)).toThrow(/release status/i);
  });

  it('requires notes for both candidate and current store version', () => {
    expect(() => renderPublicReleases(entries.filter((entry) => entry.version !== '0.9.6'), status)).toThrow(/0\.9\.6/);
    expect(() => renderPublicReleases(entries.filter((entry) => entry.version !== '0.9.5'), status)).toThrow(/0\.9\.5/);
  });
});

describe('browser-specific release channels', () => {
  it('keeps Edge-only notes out of Chrome history and required version matching', () => {
    expect(renderPublicReleases([edgeEntry, ...entries], published)).toBe(renderPublicReleases(entries, published));
    expect(() => renderPublicReleases([{ ...entries[0]!, browsers: ['edge'] }, entries[1]!], status)).toThrow(/0\.9\.6/);
    expect(() => renderPublicReleases([entries[0]!, { ...entries[1]!, browsers: ['edge'] }], status)).toThrow(/0\.9\.5/);
    expect(() => renderPublicReleases([{ ...edgeEntry, browsers: [] }, ...entries], published)).toThrow(/browsers/);
    expect(() => renderPublicReleases([{ ...edgeEntry, summary: { en: 'Missing translation' } }, ...entries], published)).toThrow(/summary/);
  });

  it('accepts the first Edge draft without a published store version', () => {
    expect(() => validateEdgeReleaseStatus(edgeStatus)).not.toThrow();
    const submittedEdge = { ...edgeStatus, stage: 'submitted', submittedAt: '2026-10-27', draftId: 'draft-123' };
    expect(() => validateEdgeReleaseStatus(submittedEdge)).not.toThrow();
    expect(() => validateEdgeReleaseStatus({ ...submittedEdge, stage: 'published', storeVersion: '0.9.7', publishedAt: '2026-10-28' })).not.toThrow();
  });

  it.each([
    { ...edgeStatus, browser: 'chrome' }, { ...edgeStatus, stage: 'approved' },
    { ...edgeStatus, storeVersion: 'v0.9.6' }, { ...edgeStatus, candidateVersion: '0.9.7-beta' },
    { ...edgeStatus, storeVersion: '0.9.7' }, { ...edgeStatus, preparedAt: '2026-02-29' },
    { ...edgeStatus, submittedAt: '2026-10-27' }, { ...edgeStatus, publishedAt: '2026-10-28' },
    { ...edgeStatus, draftId: 123 }, { ...edgeStatus, draftId: '' }, { ...edgeStatus, draftId: undefined },
    { ...edgeStatus, stage: 'submitted', submittedAt: null },
    { ...edgeStatus, stage: 'submitted', submittedAt: '2026-10-25' },
    { ...edgeStatus, stage: 'published', submittedAt: '2026-10-27', publishedAt: '2026-10-28' },
    { ...edgeStatus, stage: 'published', storeVersion: '0.9.6', submittedAt: '2026-10-27', publishedAt: '2026-10-28' },
    { ...edgeStatus, stage: 'published', storeVersion: '0.9.7', submittedAt: '2026-10-27', publishedAt: '2026-10-26' },
  ])('rejects invalid Edge status before publication claims: %j', (input) => {
    expect(() => validateEdgeReleaseStatus(input)).toThrow(/release status/i);
  });
});

describe('public release rendering', () => {
  it.each(locales)('renders complete independent %s introductions with local routes and reciprocal peers', (locale) => {
    const zh = locale === 'zh-CN';
    const otherLocale = zh ? 'en' : 'zh-CN';
    const page = parse(renderPublicReleases(entries, status, locale));
    expect(page.documentElement.lang).toBe(locale);
    expect(page.querySelector('h1')?.textContent).toBe(zh ? '更新记录' : 'Updates');
    expect(page.querySelector('link[rel="stylesheet"]')?.getAttribute('href')).toBe(zh ? '../site.css' : 'site.css');
    expect(page.querySelector('.site-brand img')?.getAttribute('src')).toBe(zh ? '../store-assets/icon-128.png' : 'store-assets/icon-128.png');
    const peer = zh ? '../changelog.html' : 'zh/changelog.html';
    expect(page.querySelector(`link[rel="alternate"][hreflang="${otherLocale}"]`)?.getAttribute('href')).toBe(`https://xixi-kitchen.github.io/bookmark-atlas/${zh ? '' : 'zh/'}changelog.html`);
    expect(page.querySelector(`a[hreflang="${otherLocale}"][lang="${otherLocale}"]`)?.getAttribute('href')).toBe(peer);
    for (const entry of entries) {
      const release = page.getElementById(`v${entry.version}-${locale}`)!;
      expect(release).not.toBeNull();
      expect(page.getElementById(`v${entry.version}-${otherLocale}`)).toBeNull();
      for (const text of [entry.title[locale], entry.summary[locale], ...entry.gettingStarted.map((item) => item[locale]), ...entry.notices.map((item) => item[locale])]) {
        expect(release.textContent).toContain(text);
      }
      expect(page.body.textContent).not.toContain(entry.summary[otherLocale]);
      for (const section of entry.sections) for (const item of section.items) {
        expect(release.textContent).toContain(item.title[locale]);
        expect(release.textContent).toContain(item.description[locale]);
        if (item.where) expect(release.textContent).toContain(item.where[locale]);
      }
    }
    expect(page.querySelector('a[href="https://github.com/xixi-kitchen/bookmark-atlas/blob/main/docs/releases/v0.9.6.md"]')).not.toBeNull();
    expect(page.querySelector('a[href="https://github.com/xixi-kitchen/bookmark-atlas/releases/tag/v0.9.5"]')).not.toBeNull();
    expect(page.querySelector('a[href$="/releases/tag/v0.9.6"]')).toBeNull();
    expect(page.body.textContent).toContain(zh ? '正式包冻结日期' : 'Package freeze date');
    expect(page.querySelector('script')).toBeNull();
    for (const route of ['index.html', 'guide.html', 'privacy.html', 'support.html']) expect(page.querySelector(`a[href="${route}"]`)).not.toBeNull();
    expect(page.querySelector('a[href="https://chromewebstore.google.com/detail/bookmark-atlas/bkdplfepaegfdabniedlkaodllnmnbfl"]')).not.toBeNull();
    expect(page.querySelector('a[href="guide.html#zh-cn"]')).toBeNull();
    for (const links of page.querySelectorAll('.release-links')) {
      expect([...links.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join('').trim()).toBe('');
    }
  });

  it('defaults to English and rejects unknown locales instead of silently selecting a language', () => {
    expect(parse(renderPublicReleases(entries, status)).documentElement.lang).toBe('en');
    expect(() => renderPublicReleases(entries, status, 'fr' as 'en')).toThrow(/locale/i);
    expect(() => updateHomepageReleaseStatus(homepage, status, 'fr' as 'en')).toThrow(/locale/i);
  });

  it('escapes source text instead of creating markup, attributes, scripts, or injected links', () => {
    const hostile = '<script>alert("x")</script><img src=x onerror="bad()"> & \'quoted\'';
    const fixture = structuredClone(entries);
    fixture[0]!.title.en = hostile;
    fixture[0]!.sections[0]!.items[0]!.where.en = hostile;
    const page = parse(renderPublicReleases(fixture, status));
    expect(page.body.textContent).toContain(hostile);
    expect(page.querySelector('script, [onerror], img[src="x"]')).toBeNull();
    expect(page.querySelectorAll('a[href^="javascript:"]').length).toBe(0);
    const updated = updateHomepageReleaseStatus(homepage, status);
    expect(updated).toBe(homepage.replace('old English', formatReleaseStatus(status, 'en')));
    expect(updateHomepageReleaseStatus(chineseHomepage, status, 'zh-CN')).toBe(chineseHomepage.replace('旧状态', formatReleaseStatus(status, 'zh-CN')));
  });

  it.each(locales)('requires one plain-text %s homepage slot and preserves every surrounding byte', (locale) => {
    const original = locale === 'en' ? homepage : chineseHomepage;
    const oldText = locale === 'en' ? 'old English' : '旧状态';
    expect(updateHomepageReleaseStatus(original, status, locale)).toBe(original.replace(oldText, formatReleaseStatus(status, locale)));
    for (const html of [
      '<main>No status slots</main>', original.replace(`data-release-status="${locale}"`, 'data-release-status="fr"'),
      original + `<p data-release-status="${locale}">duplicate</p>`, original.replace(oldText, '<b>nested content</b>'),
    ]) expect(() => updateHomepageReleaseStatus(html, status, locale)).toThrow(/status slot/i);
  });
});

const script = resolve('scripts/generate-public-releases.mjs');
function withSiteFixture(run: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-public-releases-'));
  mkdirSync(join(root, 'docs/zh'), { recursive: true });
  mkdirSync(join(root, 'src/onboarding'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '0.9.6' }));
  writeFileSync(join(root, 'docs/index.html'), homepage);
  writeFileSync(join(root, 'docs/zh/index.html'), chineseHomepage);
  writeFileSync(join(root, 'docs/release-status.json'), JSON.stringify(status));
  writeFileSync(join(root, 'src/onboarding/releaseNotes.json'), JSON.stringify(entries));
  try { run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

describe('public release generation command', () => {
  it('creates both localized changelogs, updates both homepages, and checks all four outputs without writes', () => {
    withSiteFixture((root) => {
      execFileSync(process.execPath, [script, '--root', root]);
      expect(parse(readFileSync(join(root, 'docs/changelog.html'), 'utf8')).documentElement.lang).toBe('en');
      expect(parse(readFileSync(join(root, 'docs/zh/changelog.html'), 'utf8')).documentElement.lang).toBe('zh-CN');
      expect(readFileSync(join(root, 'docs/index.html'), 'utf8')).toContain('Chrome Web Store: 0.9.5.');
      expect(readFileSync(join(root, 'docs/zh/index.html'), 'utf8')).toContain('Chrome 商店当前版本：0.9.5。');
      expect(spawnSync(process.execPath, [script, '--root', root, '--check']).status).toBe(0);
      for (const path of ['docs/changelog.html', 'docs/index.html', 'docs/zh/changelog.html', 'docs/zh/index.html']) {
        const previous = readFileSync(join(root, path), 'utf8');
        const changed = path.endsWith('index.html') ? previous.replace(/(<p[^>]*data-release-status="[^"]+">)[^<]*/, '$1stale status') : '<!-- stale generated file -->';
        writeFileSync(join(root, path), changed);
        const before = ['docs/changelog.html', 'docs/index.html', 'docs/zh/changelog.html', 'docs/zh/index.html'].map((file) => readFileSync(join(root, file), 'utf8'));
        const check = spawnSync(process.execPath, [script, '--root', root, '--check'], { encoding: 'utf8' });
        expect(check.status).not.toBe(0);
        expect(check.stderr).toContain(`Stale generated release content: ${path}`);
        expect(['docs/changelog.html', 'docs/index.html', 'docs/zh/changelog.html', 'docs/zh/index.html'].map((file) => readFileSync(join(root, file), 'utf8'))).toEqual(before);
        writeFileSync(join(root, path), previous);
      }
    });
  });

  it('rejects a malformed Chinese homepage before changing any output', () => {
    withSiteFixture((root) => {
      writeFileSync(join(root, 'docs/zh/index.html'), chineseHomepage.replace('旧状态', '<b>markup</b>'));
      const run = spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' });
      expect(run.status).not.toBe(0);
      expect(run.stderr).toMatch(/status slot zh-CN/);
      expect(readFileSync(join(root, 'docs/index.html'), 'utf8')).toBe(homepage);
      expect(() => readFileSync(join(root, 'docs/changelog.html'), 'utf8')).toThrow();
    });
  });

  it('preflights all output files before writing an earlier stale output', () => {
    withSiteFixture((root) => {
      writeFileSync(join(root, 'docs/changelog.html'), 'preserve old changelog');
      mkdirSync(join(root, 'docs/zh/changelog.html'));
      const run = spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' });
      expect(run.status).not.toBe(0);
      expect(readFileSync(join(root, 'docs/changelog.html'), 'utf8')).toBe('preserve old changelog');
      expect(readFileSync(join(root, 'docs/index.html'), 'utf8')).toBe(homepage);
      expect(readFileSync(join(root, 'docs/zh/index.html'), 'utf8')).toBe(chineseHomepage);
    });
  });
});

describe('Edge candidate generation command', () => {
  const paths = ['docs/changelog.html', 'docs/index.html', 'docs/zh/changelog.html', 'docs/zh/index.html'];
  function prepareEdge(root: string) {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '0.9.7', releaseBrowser: 'edge' }));
    writeFileSync(join(root, 'docs/release-status.json'), JSON.stringify(published));
    writeFileSync(join(root, 'docs/edge-release-status.json'), JSON.stringify(edgeStatus));
    writeFileSync(join(root, 'src/onboarding/releaseNotes.json'), JSON.stringify([edgeEntry, ...entries]));
  }

  it('validates the Edge candidate while preserving Chrome 0.9.6 pages byte for byte', () => {
    withSiteFixture((root) => {
      writeFileSync(join(root, 'docs/release-status.json'), JSON.stringify(published));
      execFileSync(process.execPath, [script, '--root', root]);
      const before = paths.map((path) => readFileSync(join(root, path), 'utf8'));
      prepareEdge(root);
      expect(spawnSync(process.execPath, [script, '--root', root, '--check']).status).toBe(0);
      execFileSync(process.execPath, [script, '--root', root]);
      expect(paths.map((path) => readFileSync(join(root, path), 'utf8'))).toEqual(before);
      expect(before[0]).toContain('Chrome Web Store: 0.9.6.');
      expect(before.join('')).not.toContain('0.9.7');
    });
  });

  it.each([
    ['missing Edge status', (root: string) => rmSync(join(root, 'docs/edge-release-status.json')), /edge-release-status/],
    ['invalid Edge status', (root: string) => writeFileSync(join(root, 'docs/edge-release-status.json'), JSON.stringify({ ...edgeStatus, submittedAt: '2026-10-27' })), /release status/i],
    ['mismatched Edge version', (root: string) => writeFileSync(join(root, 'docs/edge-release-status.json'), JSON.stringify({ ...edgeStatus, candidateVersion: '0.9.8' })), /candidate.*package version/i],
    ['unsupported channel', (root: string) => writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '0.9.7', releaseBrowser: 'firefox' })), /releaseBrowser/],
    ['missing channel candidate', (root: string) => writeFileSync(join(root, 'src/onboarding/releaseNotes.json'), JSON.stringify([{ ...edgeEntry, browsers: ['chrome'] }, ...entries])), /0\.9\.7/],
    ['invalid hidden scope', (root: string) => writeFileSync(join(root, 'src/onboarding/releaseNotes.json'), JSON.stringify([{ ...edgeEntry, browsers: ['edge', 'edge'] }, ...entries])), /browsers/],
  ] as const)('rejects %s before any writes in normal and check modes', (_name, corrupt, error) => {
    withSiteFixture((root) => {
      prepareEdge(root);
      for (const path of paths) writeFileSync(join(root, path), `preserve ${path}`);
      corrupt(root);
      const before = paths.map((path) => readFileSync(join(root, path), 'utf8'));
      for (const options of [[], ['--check']]) {
        const run = spawnSync(process.execPath, [script, '--root', root, ...options], { encoding: 'utf8' });
        expect(run.status).not.toBe(0);
        expect(run.stderr).toMatch(error);
        expect(paths.map((path) => readFileSync(join(root, path), 'utf8'))).toEqual(before);
      }
    });
  });
});
