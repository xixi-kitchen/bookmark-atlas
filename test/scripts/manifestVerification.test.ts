import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = resolve('scripts/verify-manifest.mjs');

function fixture(run: (root: string, manifest: Record<string, unknown>) => void) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-manifest-test-'));
  const out = join(root, 'output', 'edge-mv3');
  const manifest = {
    manifest_version: 3, version: '0.9.6', default_locale: 'en',
    name: '__MSG_appName__', short_name: '__MSG_appShortName__', description: '__MSG_appDescription__',
    chrome_url_overrides: { newtab: 'newtab.html' }, action: { default_popup: 'popup.html' },
    permissions: ['bookmarks', 'storage', 'favicon', 'history', 'tabs', 'search', 'declarativeNetRequestWithHostAccess'],
    host_permissions: ['https://api.bing.com/*', 'https://suggestion.baidu.com/*', 'https://suggestqueries.google.com/*', 'https://www.youtube.com/*'],
    optional_host_permissions: ['https://*/*'], icons: { 128: 'icon.png' },
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'; frame-src https: http://localhost:* http://127.0.0.1:*; connect-src https: http://localhost:* http://127.0.0.1:*" },
  };
  try {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '0.9.6' }));
    mkdirSync(join(root, 'node_modules', 'driver.js'), { recursive: true });
    cpSync('node_modules/driver.js/license', join(root, 'node_modules', 'driver.js', 'license'));
    cpSync('public/THIRD_PARTY_NOTICES.txt', join(out, 'THIRD_PARTY_NOTICES.txt'));
    writeFileSync(join(out, 'popup.html'), '<html></html>');
    for (const locale of ['en', 'zh_CN']) {
      const dir = join(out, '_locales', locale);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'messages.json'), JSON.stringify({ appName: { message: 'Atlas' }, appShortName: { message: 'Atlas' }, appDescription: { message: 'Description' } }));
    }
    run(root, manifest);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function verify(root: string, manifest: Record<string, unknown>) {
  writeFileSync(join(root, 'output/edge-mv3/manifest.json'), JSON.stringify(manifest));
  return spawnSync(process.execPath, [script, 'edge', '--root', root], { encoding: 'utf8' });
}

describe('selected browser manifest verification', () => {
  it('rejects a stale Edge manifest even when a Chrome build has the current version', () => fixture((root, manifest) => {
    mkdirSync(join(root, 'output/chrome-mv3'), { recursive: true });
    writeFileSync(join(root, 'output/chrome-mv3/manifest.json'), JSON.stringify({ version: '0.9.6' }));
    const result = verify(root, { ...manifest, version: '0.9.3' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/edge.*0\.9\.3.*0\.9\.6/i);
  }));

  it('accepts the selected current Edge build independently of an old Chrome build', () => fixture((root, manifest) => {
    mkdirSync(join(root, 'output/chrome-mv3'), { recursive: true });
    writeFileSync(join(root, 'output/chrome-mv3/manifest.json'), JSON.stringify({ version: '0.9.3' }));
    const result = verify(root, manifest);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('edge manifest verified');
  }));

  it('rejects an imported update service in an Edge submission build', () => fixture((root, manifest) => {
    const result = verify(root, { ...manifest, update_url: 'https://clients2.google.com/service/update2/crx' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('update_url');
  }));
});
