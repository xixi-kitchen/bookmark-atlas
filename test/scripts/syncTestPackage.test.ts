import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repository = process.cwd();
const roots: string[] = [];
const chromeId = 'hahlaojlpljmfdmjlbpaiamianmndkbo';
const edgeId = 'fmikkfohgeimnehehdijgfmjdmkalnfd';
const version = '0.9.6';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'atlas-packager-test-'));
  roots.push(root);
  mkdirSync(join(root, 'scripts'));
  cpSync(join(repository, 'scripts/create-sync-test-package.mjs'), join(root, 'scripts/create-sync-test-package.mjs'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version }));
  mkdirSync(join(root, 'docs'));
  for (const doc of ['cross-device-sync-test.md', 'edge-acceptance-test.md']) {
    writeFileSync(join(root, 'docs', doc), `${doc}: {{VERSION}} / {{TEST_EXTENSION_ID}}`);
  }
  for (const browser of ['chrome', 'edge']) {
    const source = join(root, 'output', `${browser}-mv3`);
    mkdirSync(join(source, '_locales/en'), { recursive: true });
    writeFileSync(join(source, '_locales/en/messages.json'), '{}');
    writeFileSync(join(source, 'newtab.html'), '<html>test</html>');
    writeFileSync(join(source, 'manifest.json'), JSON.stringify({
      manifest_version: 3, version, name: 'Original',
      chrome_url_overrides: { newtab: 'newtab.html' },
    }));
  }
  return root;
}

function cli(root: string, ...args: string[]) {
  return spawnSync(process.execPath, [join(root, 'scripts/create-sync-test-package.mjs'), ...args, '--root', root], { encoding: 'utf8' });
}

function archive(root: string, browser: string) {
  return join(root, 'output', `bookmark-atlas-${version}-${browser}-sync-test.zip`);
}

function archived(root: string, browser: string, path: string) {
  return execFileSync('unzip', ['-p', archive(root, browser), path], { encoding: 'utf8' });
}

function keyId(key: string) {
  return Array.from(createHash('sha256').update(Buffer.from(key, 'base64')).digest().subarray(0, 16))
    .flatMap((byte) => [byte >> 4, byte & 15]).map((value) => 'abcdefghijklmnop'[value]).join('');
}

afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe('sync-test package CLI', () => {
  it('preserves the default Chrome package name and fixed identity', () => {
    const root = fixture();
    expect(cli(root).status).toBe(0);
    const manifest = JSON.parse(archived(root, 'chrome', 'manifest.json'));
    expect(keyId(manifest.key)).toBe(chromeId);
    expect(manifest.name).toBe('Bookmark Atlas Sync Test');
    expect(archived(root, 'chrome', 'SYNC-TEST.md')).toContain(chromeId);
  });

  it('creates a distinct visible Edge acceptance build with matching ZIP/checklist/identity', () => {
    const root = fixture();
    const result = cli(root, 'edge');
    expect(result.status, result.stderr).toBe(0);
    const manifest = JSON.parse(archived(root, 'edge', 'manifest.json'));
    expect(keyId(manifest.key)).toBe(edgeId);
    expect(manifest.name).toBe('Bookmark Atlas Edge Sync Test');
    expect(manifest.chrome_url_overrides).toEqual({ newtab: 'newtab.html' });
    expect(JSON.parse(readFileSync(join(root, 'output/edge-sync-test-mv3/manifest.json'), 'utf8'))).toEqual(manifest);
    expect(archived(root, 'edge', 'EDGE-ACCEPTANCE-TEST.md')).toContain(`${version} / ${edgeId}`);
    const listing = execFileSync('unzip', ['-Z1', archive(root, 'edge')], { encoding: 'utf8' });
    expect(listing).toContain('_locales/en/messages.json');
    const checksum = createHash('sha256').update(readFileSync(archive(root, 'edge'))).digest('hex');
    expect(readFileSync(`${archive(root, 'edge')}.sha256`, 'utf8')).toContain(`${checksum}  bookmark-atlas-${version}-edge-sync-test.zip`);
    expect(JSON.parse(readFileSync(join(root, 'output/edge-mv3/manifest.json'), 'utf8')).key).toBeUndefined();
  });

  it('honors --root even when the script is launched outside that project', () => {
    const root = fixture();
    const launcher = join(root, 'runner/scripts/package.mjs');
    mkdirSync(dirname(launcher), { recursive: true });
    cpSync(join(repository, 'scripts/create-sync-test-package.mjs'), launcher);
    const result = spawnSync(process.execPath, [launcher, 'edge', '--root', root], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(keyId(JSON.parse(archived(root, 'edge', 'manifest.json')).key)).toBe(edgeId);
  });

  it.each(['firefox', 'EDGE', '--unknown'])('rejects unsupported target/option %s', (target) => {
    const root = fixture();
    writeFileSync(archive(root, 'edge'), 'old ZIP');
    mkdirSync(join(root, 'output/edge-sync-test-mv3'));
    writeFileSync(join(root, 'output/edge-sync-test-mv3/keep.txt'), 'old visible build');
    const result = cli(root, target);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/Unsupported|Unknown/);
    expect(readFileSync(archive(root, 'edge'), 'utf8')).toBe('old ZIP');
    expect(readFileSync(join(root, 'output/edge-sync-test-mv3/keep.txt'), 'utf8')).toBe('old visible build');
  });

  it.each(['version', 'missing-source', 'underscore', 'conflict', 'private-extension', 'private-content', 'symlink'])('preflights %s without clobbering previous Edge artifacts', (problem) => {
    const root = fixture();
    const source = join(root, 'output/edge-mv3');
    const previousZip = archive(root, 'edge');
    const previousDirectory = join(root, 'output/edge-sync-test-mv3');
    mkdirSync(previousDirectory);
    writeFileSync(join(previousDirectory, 'keep.txt'), 'old visible build');
    writeFileSync(previousZip, 'old ZIP');
    writeFileSync(`${previousZip}.sha256`, 'old checksum');
    if (problem === 'version') writeFileSync(join(source, 'manifest.json'), JSON.stringify({ manifest_version: 3, version: '0.9.5' }));
    if (problem === 'missing-source') rmSync(source, { recursive: true });
    if (problem === 'underscore') mkdirSync(join(source, '_secret'));
    if (problem === 'conflict') writeFileSync(join(source, 'manifest.json 2'), '{}');
    if (problem === 'private-extension') writeFileSync(join(source, 'account.pem'), 'test');
    if (problem === 'private-content') writeFileSync(join(source, 'accidental.txt'), '-----BEGIN PRIVATE KEY-----');
    if (problem === 'symlink') symlinkSync(join(root, 'package.json'), join(source, 'linked.json'));
    const result = cli(root, 'edge');
    expect(result.status, result.stdout).not.toBe(0);
    expect(readFileSync(previousZip, 'utf8')).toBe('old ZIP');
    expect(readFileSync(`${previousZip}.sha256`, 'utf8')).toBe('old checksum');
    expect(readFileSync(join(previousDirectory, 'keep.txt'), 'utf8')).toBe('old visible build');
  });
});
