import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const page = (name: string) => new DOMParser().parseFromString(readFileSync(resolve('docs', name), 'utf8'), 'text/html');
const releaseStatus = JSON.parse(readFileSync(resolve('docs/release-status.json'), 'utf8'));

describe('public website', () => {
  it('offers a complete local path from installation to help and release history without JavaScript', () => {
    const home = page('index.html');
    for (const target of ['guide.html', 'support.html', 'privacy.html', 'changelog.html']) {
      expect(home.querySelector(`a[href="${target}"]`), target).not.toBeNull();
    }
    expect(home.querySelector('a[href^="https://chromewebstore.google.com/detail/"]')).not.toBeNull();
    const englishStatus = home.querySelector('[data-release-status="en"]')?.textContent;
    const chineseStatus = page('zh/index.html').querySelector('[data-release-status="zh-CN"]')?.textContent;
    expect(englishStatus).toContain(`Chrome Web Store: ${releaseStatus.storeVersion}.`);
    expect(chineseStatus).toContain(`Chrome 商店当前版本：${releaseStatus.storeVersion}。`);
    if (releaseStatus.stage === 'published') {
      expect(englishStatus).toContain(`Published on ${releaseStatus.publishedAt}.`);
      expect(chineseStatus).toContain(`实际上架日期：${releaseStatus.publishedAt}。`);
      expect(englishStatus).not.toMatch(/candidate|not yet published/i);
      expect(chineseStatus).not.toMatch(/候选版本|尚未上架/);
    } else {
      expect(englishStatus).toContain(`Candidate ${releaseStatus.candidateVersion}`);
      expect(chineseStatus).toContain(`候选版本 ${releaseStatus.candidateVersion}`);
      expect(englishStatus).toMatch(/prepar|review|submitted/i);
    }
    expect(home.querySelector('[data-release-status="en"]')?.children).toHaveLength(0);
    expect(page('zh/index.html').querySelector('[data-release-status="zh-CN"]')?.children).toHaveLength(0);
    expect(home.querySelector('main[id="main-content"]')).not.toBeNull();
    expect(home.querySelector('a[href="#main-content"]')).not.toBeNull();
  });

  it('shows the public demo with reserved dimensions and explains the real three-step workflow', () => {
    const home = page('index.html');
    const demo = home.querySelector<HTMLImageElement>('figure img');
    expect(demo?.getAttribute('src')).toMatch(/^store-assets\/screenshots\//);
    expect(demo?.getAttribute('width')).toBe('1280');
    expect(demo?.getAttribute('height')).toBe('800');
    expect(demo?.getAttribute('alt')?.length).toBeGreaterThan(20);
    expect([...home.querySelectorAll('#get-started h3')].map((heading) => heading.textContent)).toEqual(['Add', 'Organize', 'Open']);
    expect(home.querySelector('a[hreflang="zh-CN"]')?.getAttribute('href')).toBe('zh/index.html');
    expect(home.body.textContent).toContain('Attachments stay on the device');
    expect(home.body.textContent).toContain('does not guarantee a delivery time');
    expect(home.querySelector('a[href="edge/index.html"]')).not.toBeNull();
    expect(home.body.textContent).toContain('two-device Edge sync acceptance remains pending');
    expect(home.body.textContent).toContain('Safari is not officially supported');
  });

  it.each(['index.html', 'guide.html', 'support.html'])('%s keeps navigation and reading accessible with no external runtime', (name) => {
    const doc = page(name);
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
    expect(doc.querySelector('nav[aria-label="Primary"]')).not.toBeNull();
    expect(doc.querySelector('a[href="changelog.html"]')).not.toBeNull();
    expect(doc.querySelector('a[href="privacy.html"]')).not.toBeNull();
    expect(doc.querySelector('a[href="#main-content"]')).not.toBeNull();
    expect(doc.querySelector('script[src^="http"], link[href^="https://fonts."]')).toBeNull();
    for (const anchor of doc.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      expect(doc.getElementById(anchor.getAttribute('href')!.slice(1)), `${name}: ${anchor.getAttribute('href')}`).not.toBeNull();
    }
  });

  it('makes onboarding and recovery available in both languages', () => {
    const guide = page('guide.html');
    expect(guide.querySelector('#add')).not.toBeNull();
    expect(guide.querySelector('#organize')).not.toBeNull();
    expect(guide.querySelector('#open')).not.toBeNull();
    expect(page('zh/guide.html').querySelector('#keep')?.textContent).toContain('备份');
    const support = page('support.html');
    expect(support.querySelector('details summary')).not.toBeNull();
    expect(support.body.textContent).toContain('does not guarantee a delivery time');
    expect(page('zh/support.html').querySelector('#sync')?.textContent).toContain('固定到达时间');
  });
});
