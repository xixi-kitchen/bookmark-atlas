import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const names = ['index.html', 'guide.html', 'privacy.html'];
const routes = names.flatMap((name) => [`edge/${name}`, `zh/edge/${name}`]);
const load = (route: string) => new DOMParser().parseFromString(readFileSync(resolve('docs', route), 'utf8'), 'text/html');
const base = 'https://xixi-kitchen.github.io/bookmark-atlas/';

describe('Edge public documentation', () => {
  it.each(routes)('%s is an accessible, complete, independent localized route', (route) => {
    const doc = load(route);
    const chinese = route.startsWith('zh/');
    const name = route.split('/').at(-1)!;
    expect(doc.documentElement.lang).toBe(chinese ? 'zh-CN' : 'en');
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
    expect(doc.querySelector('main#main-content')).not.toBeNull();
    expect(doc.querySelector('a[href="#main-content"]')).not.toBeNull();
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(base + route);
    expect(doc.querySelector('link[rel="alternate"][hreflang="en"]')?.getAttribute('href')).toBe(`${base}edge/${name}`);
    expect(doc.querySelector('link[rel="alternate"][hreflang="zh-CN"]')?.getAttribute('href')).toBe(`${base}zh/edge/${name}`);
    const switcher = doc.querySelector('a[hreflang]');
    expect(switcher?.getAttribute('href')).toBe(chinese ? `../../edge/${name}` : `../zh/edge/${name}`);
    expect(switcher?.textContent).toContain(chinese ? 'English' : '中文');
    expect(doc.querySelector('script')).toBeNull();
    expect(doc.querySelector('style')).toBeNull();
    expect(doc.querySelector('link[rel="stylesheet"]')?.getAttribute('href')).toBe(chinese ? '../../site.css' : '../site.css');
    expect(doc.querySelector('.site-brand img')?.getAttribute('src')).toBe(chinese ? '../../store-assets/icon-128.png' : '../store-assets/icon-128.png');
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
        expect(local.startsWith(resolve('docs', chinese ? 'zh/edge' : 'edge') + '/')).toBe(true);
      }
    }
    for (const asset of doc.querySelectorAll('img[src],link[rel="stylesheet"]')) {
      const assetPath = asset.getAttribute('src') || asset.getAttribute('href')!;
      expect(existsSync(resolve('docs', dirname(route), assetPath)), `${route} asset ${assetPath}`).toBe(true);
    }
    expect(doc.querySelector('a[href*="microsoftedge.microsoft.com/addons/detail"],a[href*="chromewebstore"],a[href*="sponsors"],a[href*="buymeacoffee"]')).toBeNull();
    expect(doc.body.textContent).not.toMatch(/chrome-extension:\/\/|[a-p]{32}|donat|赞赏|打赏|收款/i);
    expect(doc.querySelector('a[href="https://github.com/xixi-kitchen/bookmark-atlas/issues/new/choose"]')).not.toBeNull();
    expect(doc.querySelector('main')!.textContent!.length).toBeGreaterThan(700);
  });

  it.each(['edge/index.html', 'zh/edge/index.html'])('%s distinguishes submission from publication and retains pending sync acceptance', (route) => {
    const doc = load(route);
    const status = doc.querySelector('[data-edge-release-status]')?.textContent;
    expect(status).toContain('0.9.7');
    expect(status).toMatch(/submitted for review|已于.*提交商店审核/i);
    expect(status).toContain('2026-10-26');
    expect(status).toMatch(/two-device.*pending|两设备.*待验证/i);
    expect(doc.querySelector('[data-edge-availability]')?.textContent).toMatch(/not yet available|尚未提供/);
    expect(doc.querySelector('[data-edge-availability] a')).toBeNull();
    expect(doc.body.textContent).toMatch(/Chrome.*0\.9\.6/);
    const screenshot = doc.querySelector('figure img');
    expect(screenshot?.getAttribute('src')).toBe(route.startsWith('zh/')
      ? '../../store-assets/edge/screenshots/01-canvas-zh-CN-1280x800.png'
      : '../store-assets/edge/screenshots/01-canvas-en-1280x800.png');
    expect(screenshot?.getAttribute('width')).toBe('1280');
    expect(screenshot?.getAttribute('height')).toBe('800');
  });

  it.each(['edge/guide.html', 'zh/edge/guide.html'])('%s explains actual capture, canvas, embeds, AI and backups', (route) => {
    const doc = load(route);
    for (const id of ['add', 'organize', 'open', 'embeds', 'ai', 'keep']) expect(doc.getElementById(id)).not.toBeNull();
    expect(doc.getElementById('add')?.textContent).toMatch(/native favorite|原生收藏/);
    expect(doc.getElementById('add')?.textContent).toMatch(/queues the card locally|queued locally|本机.*队列/);
    expect(doc.getElementById('organize')?.textContent).toMatch(/icon, compact or detailed|图标、(?:紧凑|简洁)或详细/);
    expect(doc.getElementById('open')?.textContent).toMatch(/favicon|网站图标/);
    expect(doc.getElementById('embeds')?.textContent).toContain('YouTube');
    expect(doc.getElementById('embeds')?.textContent).toContain('Bilibili');
    expect(doc.getElementById('ai')?.textContent).toMatch(/preview|预览/i);
    expect(doc.getElementById('keep')?.textContent).toMatch(/same.*Edge account|相同.*Edge 账号/i);
    expect(doc.getElementById('keep')?.textContent).toMatch(/same.*extension identity|相同.*扩展身份/i);
    expect(doc.getElementById('keep')?.textContent).toMatch(/does not prove remote delivery|不能证明远端送达/);
  });

  it.each(['edge/privacy.html', 'zh/edge/privacy.html'])('%s retains the seven privacy topics and precise AI boundaries', (route) => {
    const doc = load(route);
    expect(doc.querySelectorAll('article h2')).toHaveLength(7);
    const text = doc.querySelector('article')!.textContent!;
    for (const term of ['AES-GCM-256', '96', 'IndexedDB', 'chrome.storage.local', 'chrome.storage.sync', 'GET /models', 'POST /chat/completions', 'store: false', 'YouTube', '/embed/']) expect(text).toContain(term);
    expect(text).toMatch(/cookies|Cookie/);
    expect(text).toMatch(/selected card IDs|所选卡片 ID/);
    expect(text).toMatch(/titles, domains,.*descriptions|标题、域名、.*备注/);
    expect(text).toMatch(/organization instruction|整理要求/);
    expect(text).toMatch(/not an OS keychain|不是操作系统钥匙串/);
    expect(text).toMatch(/authentication header|认证请求头/);
    expect(text).toMatch(/revoke.*Edge.*extension settings|Edge.*扩展设置.*撤销/);
    expect(text).toMatch(/not executed as code|不执行代码/);
    expect(text).toMatch(/two-device.*pending|两设备.*待验证/i);
    expect(text).toMatch(/Limited Use|受限使用/);
    expect(text).toMatch(/not telemetry|不是遥测/);
    expect(text).toMatch(/not.*included in extension backups|不进入扩展备份/);
    expect(text).not.toMatch(/near-real-time|近实时/);
  });
});
