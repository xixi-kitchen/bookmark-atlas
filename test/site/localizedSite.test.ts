import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const routes = ['index.html', 'guide.html', 'changelog.html', 'privacy.html', 'support.html'];
const load = (path: string) => new DOMParser().parseFromString(readFileSync(resolve('docs', path), 'utf8'), 'text/html');

describe('independent website languages', () => {
  it.each(routes)('%s has complete reciprocal language pages and same-language navigation', (name) => {
    for (const chinese of [false, true]) {
      const route = chinese ? `zh/${name}` : name;
      const doc = load(route);
      expect(doc.documentElement.lang).toBe(chinese ? 'zh-CN' : 'en');
      expect(doc.querySelectorAll('h1')).toHaveLength(1);
      expect(doc.querySelector('main[id="main-content"]')).not.toBeNull();
      expect(doc.querySelector('main [lang]')).toBeNull();
      const switcher = doc.querySelector<HTMLAnchorElement>('a[hreflang]');
      expect(switcher?.getAttribute('href')).toBe(chinese ? `../${name}` : `zh/${name}`);
      expect(switcher?.textContent).toContain(chinese ? 'English' : '中文');
      expect(doc.querySelector('link[rel="alternate"][hreflang="en"]')?.getAttribute('href')).toBe(`https://xixi-kitchen.github.io/bookmark-atlas/${name}`);
      expect(doc.querySelector('link[rel="alternate"][hreflang="zh-CN"]')?.getAttribute('href')).toBe(`https://xixi-kitchen.github.io/bookmark-atlas/zh/${name}`);
      expect(doc.querySelector('a[href="#main-content"]')).not.toBeNull();
      expect(doc.querySelector('main')!.textContent!.length).toBeGreaterThan(450);
      for (const anchor of doc.querySelectorAll<HTMLAnchorElement>('a[href]')) {
        const href = anchor.getAttribute('href')!;
        if (/^https?:/.test(href)) continue;
        const [target, fragment] = href.split('#');
        const local = target ? resolve('docs', dirname(route), target) : resolve('docs', route);
        expect(existsSync(local), `${route} -> ${href}`).toBe(true);
        if (fragment) {
          const dest = new DOMParser().parseFromString(readFileSync(local, 'utf8'), 'text/html');
          expect(dest.getElementById(fragment), `${route} -> ${href}`).not.toBeNull();
        }
        if (anchor !== switcher && target?.endsWith('.html')) {
          expect(local.startsWith(resolve('docs/zh') + '/'), `${route} navigation ${href}`).toBe(chinese);
        }
      }
      for (const asset of doc.querySelectorAll('img[src],link[rel="stylesheet"]')) {
        const path = asset.getAttribute('src') || asset.getAttribute('href')!;
        expect(existsSync(resolve('docs', dirname(route), path)), `${route} asset ${path}`).toBe(true);
      }
      expect(doc.querySelector('script[src^="http"]')).toBeNull();
    }
  });

  it.each(['index.html', 'zh/index.html'])('%s distinguishes embeddings from bookmarks and invites community requests', (route) => {
    const doc = load(route);
    const embeds = doc.getElementById('embeds')!;
    expect(embeds).not.toBeNull();
    expect(embeds.textContent).toContain('YouTube');
    expect(embeds.textContent).toMatch(/Bilibili|哔哩哔哩|B 站/);
    expect(embeds.textContent).toMatch(/webpage|website|网页/i);
    expect(doc.querySelector('a[href="https://github.com/xixi-kitchen/bookmark-atlas"]')).not.toBeNull();
    expect(doc.querySelector('a[href="https://github.com/xixi-kitchen/bookmark-atlas/issues/new/choose"]')).not.toBeNull();
    expect(doc.querySelector('a[href*="github.com/sponsors"],a[href*="buymeacoffee"]')).toBeNull();
    expect(doc.querySelectorAll('[data-release-status]')).toHaveLength(1);
  });

  it.each(['guide.html', 'zh/guide.html'])('%s gives practical embed steps and retains learning, backup and AI instructions', (route) => {
    const doc = load(route);
    for (const id of ['add', 'organize', 'open', 'embeds', 'ai', 'keep']) expect(doc.getElementById(id), `${route} #${id}`).not.toBeNull();
    expect(doc.getElementById('embeds')?.textContent).toMatch(/HTTPS/);
    expect(doc.getElementById('embeds')?.textContent).toMatch(/YouTube/);
    expect(doc.getElementById('ai')?.textContent).toMatch(/preview|预览/);
  });

  it('keeps the full privacy scope in both languages', () => {
    const en = load('privacy.html'); const zh = load('zh/privacy.html');
    expect(en.querySelectorAll('article h2').length).toBe(zh.querySelectorAll('article h2').length);
    expect(en.querySelectorAll('article h2').length).toBeGreaterThanOrEqual(7);
    for (const doc of [en, zh]) {
      expect(doc.body.textContent).toContain('AES-GCM-256');
      expect(doc.body.textContent).toContain('store: false');
      expect(doc.body.textContent).toContain('chrome.storage.local');
      expect(doc.querySelector('h1')).not.toBeNull();
    }
  });
});
