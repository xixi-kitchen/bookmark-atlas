import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = resolve('scripts/generate-support-pages.mjs');
const settings = { enabled: false, pageUrl: 'https://example.com/project/support-project.html', wechatQrUrl: '', alipayQrUrl: '' };
const qr = { wechatQrUrl: 'https://example.com/public-wechat.jpg', alipayQrUrl: 'https://example.com/public-alipay.jpg' };
const parse = (text: string) => new DOMParser().parseFromString(text, 'text/html');
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'atlas-support-'));
  mkdirSync(join(root, 'src/support'), { recursive: true }); mkdirSync(join(root, 'docs/zh'), { recursive: true });
  writeFileSync(join(root, 'src/support/support.config.json'), JSON.stringify(settings));
  for (const [path, locale] of [['docs/index.html', 'en'], ['docs/zh/index.html', 'zh-CN']] as const) {
    writeFileSync(join(root, path), `<main><h1>Preserve home</h1><div data-project-support="${locale}"></div></main>`);
  }
  return { root,
    configure: (value: unknown) => writeFileSync(join(root, 'src/support/support.config.json'), JSON.stringify(value)),
    run: (...args: string[]) => spawnSync(process.execPath, [script, '--root', root, ...args], { encoding: 'utf8' }),
    read: (path: string) => readFileSync(join(root, path), 'utf8'),
    done: () => rmSync(root, { recursive: true, force: true }),
  };
}

describe('maintainer voluntary support generation', () => {
  it('defaults off without links, code images or retained configured payment URLs in output', () => {
    const f = fixture(); f.configure({ ...settings, ...qr });
    try {
      const result = f.run(); expect(result.status, result.stderr).toBe(0);
      for (const prefix of ['docs/', 'docs/zh/']) {
        const home = parse(f.read(`${prefix}index.html`)); const page = parse(f.read(`${prefix}support-project.html`));
        expect(home.querySelector('[data-project-support] a')).toBeNull();
        expect(page.querySelector('[data-payment-code]')).toBeNull();
        expect(page.body.textContent).toMatch(/not enabled|尚未启用/);
        expect(f.read(`${prefix}support-project.html`)).not.toContain(qr.wechatQrUrl);
        expect(f.read(`${prefix}support-project.html`)).not.toContain(qr.alipayQrUrl);
      }
    } finally { f.done(); }
  });

  it('renders only configured channels with independent language pages and safe relative links', () => {
    const f = fixture(); f.configure({ ...settings, enabled: true, wechatQrUrl: qr.wechatQrUrl });
    try {
      const result = f.run(); expect(result.status, result.stderr).toBe(0);
      for (const [prefix, locale, peer] of [['docs/', 'en', 'zh/support-project.html'], ['docs/zh/', 'zh-CN', '../support-project.html']]) {
        const page = parse(f.read(`${prefix}support-project.html`));
        expect(page.documentElement.lang).toBe(locale);
        expect(page.querySelectorAll('[data-payment-code]')).toHaveLength(1);
        expect(page.querySelector('[data-payment-code="wechat"]')?.getAttribute('src')).toBe(qr.wechatQrUrl);
        expect(page.querySelector('[data-payment-code="alipay"]')).toBeNull();
        expect(page.querySelector('a[hreflang]')?.getAttribute('href')).toBe(peer);
        expect(page.querySelector('script')).toBeNull();
        expect(page.body.textContent).toMatch(/does not unlock|不解锁/);
        expect(parse(f.read(`${prefix}index.html`)).querySelector('[data-project-support] a')?.getAttribute('href')).toBe('support-project.html');
      }
    } finally { f.done(); }
  });

  it('removes visible support and all code URLs when turned off after being enabled', () => {
    const f = fixture();
    try {
      f.configure({ ...settings, ...qr, enabled: true }); expect(f.run().status).toBe(0);
      expect(parse(f.read('docs/support-project.html')).querySelectorAll('[data-payment-code]')).toHaveLength(2);
      f.configure({ ...settings, ...qr, enabled: false }); expect(f.run().status).toBe(0);
      expect(parse(f.read('docs/index.html')).querySelector('[data-project-support] a')).toBeNull();
      expect(f.read('docs/support-project.html')).not.toContain(qr.wechatQrUrl);
      expect(f.read('docs/zh/support-project.html')).not.toContain(qr.alipayQrUrl);
    } finally { f.done(); }
  });

  it('escapes allowed image URL characters rather than creating markup or event handlers', () => {
    const f = fixture();
    const imageUrl = 'https://example.com/code.jpg?label="quoted"&value=<tag>';
    f.configure({ ...settings, enabled: true, wechatQrUrl: imageUrl });
    try {
      const result = f.run(); expect(result.status, result.stderr).toBe(0);
      const page = parse(f.read('docs/support-project.html'));
      expect(page.querySelector('[data-payment-code]')?.getAttribute('src')).toBe(imageUrl);
      expect(page.querySelector('script, [onerror], tag')).toBeNull();
      expect(page.querySelectorAll('img')).toHaveLength(2);
    } finally { f.done(); }
  });

  it('checks all outputs without writing any stale homepage or page', () => {
    const f = fixture();
    try {
      expect(f.run().status).toBe(0);
      writeFileSync(join(f.root, 'docs/zh/support-project.html'), 'stale');
      const home = f.read('docs/index.html');
      const check = f.run('--check'); expect(check.status).not.toBe(0); expect(check.stderr).toMatch(/stale/i);
      expect(f.read('docs/zh/support-project.html')).toBe('stale'); expect(f.read('docs/index.html')).toBe(home);
    } finally { f.done(); }
  });

  it('rejects missing or duplicated slots and malformed enabled config before writing files', () => {
    const f = fixture();
    try {
      f.configure({ ...settings, enabled: true }); const before = f.read('docs/index.html');
      expect(f.run().status).not.toBe(0); expect(f.read('docs/index.html')).toBe(before);
      expect(existsSync(join(f.root, 'docs/support-project.html'))).toBe(false);
      f.configure(settings);
      writeFileSync(join(f.root, 'docs/zh/index.html'), '<div>No support slot</div>');
      expect(f.run().status).not.toBe(0); expect(f.read('docs/index.html')).toBe(before);
      expect(existsSync(join(f.root, 'docs/support-project.html'))).toBe(false);
      writeFileSync(join(f.root, 'docs/zh/index.html'), '<div data-project-support="zh-CN"></div><div data-project-support="zh-CN"></div>');
      expect(f.run().status).not.toBe(0); expect(existsSync(join(f.root, 'docs/support-project.html'))).toBe(false);
      writeFileSync(join(f.root, 'docs/zh/index.html'), '<div data-project-support="zh-CN"></div><div data-project-support="en"><a href="support-project.html">Stale support</a></div>');
      expect(f.run().status).not.toBe(0); expect(existsSync(join(f.root, 'docs/support-project.html'))).toBe(false);
    } finally { f.done(); }
  });

  it('does not read, copy or publish private original files', () => {
    const f = fixture();
    try {
      mkdirSync(join(f.root, 'output/private-support-assets'), { recursive: true });
      writeFileSync(join(f.root, 'output/private-support-assets/wechat-original.jpg'), 'PRIVATE-QR-ORIGINAL');
      expect(f.run().status).toBe(0);
      expect(f.read('output/private-support-assets/wechat-original.jpg')).toBe('PRIVATE-QR-ORIGINAL');
      for (const prefix of ['docs/', 'docs/zh/']) expect(f.read(`${prefix}support-project.html`)).not.toContain('PRIVATE-QR-ORIGINAL');
      expect(existsSync(join(f.root, 'docs/store-assets/support'))).toBe(false);
    } finally { f.done(); }
  });
});
