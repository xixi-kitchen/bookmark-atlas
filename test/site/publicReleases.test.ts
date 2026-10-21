import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import entries from '../../src/onboarding/releaseNotes.json';
import { formatReleaseStatus, renderPublicReleases, updateHomepageReleaseStatus, validateReleaseStatus } from '../../scripts/lib/public-releases.mjs';

const status = {
  storeVersion: '0.9.5', candidateVersion: '0.9.6', stage: 'preparing' as const,
  preparedAt: '2026-10-21', submittedAt: null, publishedAt: null,
};
const submitted = { ...status, stage: 'submitted' as const, submittedAt: '2026-10-22' };
const published = { ...submitted, stage: 'published' as const, storeVersion: '0.9.6', publishedAt: '2026-10-23' };
const homepage = '<main><h1>Keep this page intact</h1><p class="release-status" data-release-status="en">old English</p><p class="release-status" data-release-status="zh-CN">旧状态</p><a href="guide.html">Go</a></main>';
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

describe('public release rendering', () => {
  it('renders complete bilingual introductions and truthful version links from the catalogue', () => {
    const page = parse(renderPublicReleases(entries, status));
    expect(page.querySelector('html')?.lang).toBe('en');
    expect(page.querySelector('h1')?.textContent).toBe('Updates');
    expect(page.querySelector('[lang="zh-CN"]')).not.toBeNull();
    for (const entry of entries) {
      for (const locale of ['en', 'zh-CN'] as const) {
        const release = page.getElementById(`v${entry.version}-${locale}`)!;
        expect(release).not.toBeNull();
        for (const text of [entry.title[locale], entry.summary[locale], ...entry.gettingStarted.map((item) => item[locale]), ...entry.notices.map((item) => item[locale])]) {
          expect(release.textContent).toContain(text);
        }
        for (const section of entry.sections) for (const item of section.items) {
          expect(release.textContent).toContain(item.title[locale]);
          expect(release.textContent).toContain(item.description[locale]);
          expect(release.textContent).toContain(item.where[locale]);
        }
      }
    }
    expect(page.querySelector('a[href="https://github.com/xixi-kitchen/bookmark-atlas/blob/main/docs/releases/v0.9.6.md"]')).not.toBeNull();
    expect(page.querySelector('a[href="https://github.com/xixi-kitchen/bookmark-atlas/releases/tag/v0.9.5"]')).not.toBeNull();
    expect(page.querySelector('a[href$="/releases/tag/v0.9.6"]')).toBeNull();
    expect(page.body.textContent).toContain('Package freeze date');
    expect(page.querySelector('script')).toBeNull();
    for (const route of ['index.html', 'guide.html', 'privacy.html', 'support.html']) expect(page.querySelector(`a[href="${route}"]`)).not.toBeNull();
    expect(page.querySelector('a[href="https://chromewebstore.google.com/detail/bookmark-atlas/bkdplfepaegfdabniedlkaodllnmnbfl"]')).not.toBeNull();
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
    expect(updated).toBe(homepage.replace('old English', formatReleaseStatus(status, 'en')).replace('旧状态', formatReleaseStatus(status, 'zh-CN')));
  });

  it('fails clearly when the homepage status slots are absent, repeated, or contain markup', () => {
    for (const html of [
      '<main>No status slots</main>', homepage.replace('data-release-status="en"', 'data-release-status="fr"'),
      homepage + '<p data-release-status="en">duplicate</p>', homepage.replace('old English', '<b>nested content</b>'),
    ]) expect(() => updateHomepageReleaseStatus(html, status)).toThrow(/status slot/i);
  });
});

describe('public release generation command', () => {
  it('generates both outputs and makes --check reject stale files without writing anything', () => {
    const root = mkdtempSync(join(tmpdir(), 'atlas-public-releases-'));
    const script = resolve('scripts/generate-public-releases.mjs');
    mkdirSync(join(root, 'docs'));
    mkdirSync(join(root, 'src/onboarding'), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '0.9.6' }));
    writeFileSync(join(root, 'docs/index.html'), homepage);
    writeFileSync(join(root, 'docs/release-status.json'), JSON.stringify(status));
    writeFileSync(join(root, 'src/onboarding/releaseNotes.json'), JSON.stringify(entries));
    try {
      execFileSync(process.execPath, [script, '--root', root]);
      expect(readFileSync(join(root, 'docs/changelog.html'), 'utf8')).toContain('Package freeze date');
      expect(readFileSync(join(root, 'docs/index.html'), 'utf8')).toContain(formatReleaseStatus(status, 'en'));
      expect(spawnSync(process.execPath, [script, '--root', root, '--check']).status).toBe(0);
      const stale = '<!-- stale generated file -->';
      writeFileSync(join(root, 'docs/changelog.html'), stale);
      const beforeHome = readFileSync(join(root, 'docs/index.html'), 'utf8');
      const check = spawnSync(process.execPath, [script, '--root', root, '--check'], { encoding: 'utf8' });
      expect(check.status).not.toBe(0);
      expect(check.stderr).toMatch(/stale.*changelog\.html/i);
      expect(readFileSync(join(root, 'docs/changelog.html'), 'utf8')).toBe(stale);
      expect(readFileSync(join(root, 'docs/index.html'), 'utf8')).toBe(beforeHome);
      writeFileSync(join(root, 'docs/changelog.html'), renderPublicReleases(entries, status));
      writeFileSync(join(root, 'docs/index.html'), homepage);
      const homeCheck = spawnSync(process.execPath, [script, '--root', root, '--check'], { encoding: 'utf8' });
      expect(homeCheck.status).not.toBe(0);
      expect(homeCheck.stderr).toMatch(/stale.*index\.html/i);
      expect(readFileSync(join(root, 'docs/index.html'), 'utf8')).toBe(homepage);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
