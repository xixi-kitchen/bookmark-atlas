import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repository = process.cwd();
const roots: string[] = [];
const chromeId = 'hahlaojlpljmfdmjlbpaiamianmndkbo';
const edgeId = 'fmikkfohgeimnehehdijgfmjdmkalnfd';
const version = '0.9.6';

function fixture() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'atlas-packager-test-'));
  roots.push(root);
  mkdirSync(join(root, 'scripts'));
  cpSync(join(repository, 'scripts/create-sync-test-package.mjs'), join(root, 'scripts/create-sync-test-package.mjs'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version }));
  mkdirSync(join(root, 'docs'));
  for (const doc of ['cross-device-sync-test.md', 'edge-acceptance-test.md', 'local-test-checklist.md']) {
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
    expect(manifest.name).toBe('Bookmark Atlas [SYNC] - Chrome');
    expect(archived(root, 'chrome', 'SYNC-TEST.md')).toContain(chromeId);
  });

  it('creates a distinct visible Edge acceptance build with matching ZIP/checklist/identity', () => {
    const root = fixture();
    const result = cli(root, 'edge');
    expect(result.status, result.stderr).toBe(0);
    const manifest = JSON.parse(archived(root, 'edge', 'manifest.json'));
    expect(keyId(manifest.key)).toBe(edgeId);
    expect(manifest.name).toBe('Bookmark Atlas [SYNC] - Edge');
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


const testId = 'jnncnppadioiabiahlkjkfhkjjbpjjda';
function standard(root: string, browser = 'chrome', channel = 'test', build = '20261102.1') {
  return cli(root, browser, '--channel', channel, '--build', build, '--task', 'PLAN-010');
}
function current(root: string, browser = 'chrome', channel = 'test') {
  return join(root, 'output/test-current', browser, channel);
}
function standardArchive(root: string, browser = 'chrome', channel = 'test', build = '20261102.1') {
  return join(root, 'output/test-archives', browser, channel, `${version}-${channel}.${build}.zip`);
}
function snapshot(root: string) {
  return execFileSync('find', [join(root, 'output'), '-type', 'f', '-exec', 'shasum', '-a', '256', '{}', ';'], { encoding: 'utf8' }).split('\n').sort().join('\n');
}

describe('standard test package lifecycle', () => {
  it('includes the local acceptance checklist rather than a two-device sync checklist for TEST', () => {
    const root = fixture();
    writeFileSync(join(root, 'docs/local-test-checklist.md'), 'Local {{BROWSER}} {{VERSION_NAME}} {{TASK}} {{TEST_EXTENSION_ID}} {{CURRENT_DIRECTORY}}');
    expect(standard(root).status).toBe(0);
    const zip = standardArchive(root);
    const checklist = execFileSync('unzip', ['-p', zip, 'LOCAL-TEST.md'], { encoding: 'utf8' });
    expect(checklist).toBe('Local Chrome 0.9.6-test.20261102.1 PLAN-010 jnncnppadioiabiahlkjkfhkjjbpjjda output/test-current/chrome/test');
    const listing = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' });
    expect(listing).not.toContain('SYNC-TEST.md');
    expect(listing).not.toContain('EDGE-ACCEPTANCE-TEST.md');
  });

  it.each(['chrome', 'edge'])('creates stable TEST identity, exact paths and source receipts for %s', (browser) => {
    const root = fixture();
    const before = readFileSync(join(root, 'output', `${browser}-mv3/manifest.json`));
    const result = standard(root, browser);
    expect(result.status, result.stderr).toBe(0);
    const manifest = JSON.parse(readFileSync(join(current(root, browser), 'manifest.json'), 'utf8'));
    expect(manifest.name).toBe(`Bookmark Atlas [TEST] - ${browser === 'chrome' ? 'Chrome' : 'Edge'}`);
    expect(manifest.short_name).toBe('Atlas [TEST]');
    expect(manifest.version).toBe(version);
    expect(manifest.version_name).toBe(`${version}-test.20261102.1`);
    expect(keyId(manifest.key)).toBe(testId);
    const receipt = JSON.parse(readFileSync(join(current(root, browser), 'TEST-BUILD.json'), 'utf8'));
    expect(receipt).toMatchObject({ schemaVersion: 1, browser, channel: 'test', task: 'PLAN-010', buildId: '20261102.1', versionName: manifest.version_name, extensionId: testId });
    expect(receipt.sourceDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.sourceFiles['manifest.json']).toBe(createHash('sha256').update(before).digest('hex'));
    const zip = standardArchive(root, browser);
    expect(JSON.parse(readFileSync(`${zip}.json`, 'utf8'))).toEqual(receipt);
    expect(JSON.parse(execFileSync('unzip', ['-p', zip, 'TEST-BUILD.json'], { encoding: 'utf8' }))).toEqual(receipt);
    expect(readFileSync(`${zip}.sha256`, 'utf8')).toBe(`${createHash('sha256').update(readFileSync(zip)).digest('hex')}  ${version}-test.20261102.1.zip\n`);
    expect(readFileSync(join(root, 'output', `${browser}-mv3/manifest.json`))).toEqual(before);
    expect(standard(root, browser, 'test', '20261102.2').status).toBe(0);
    expect(keyId(JSON.parse(readFileSync(join(current(root, browser), 'manifest.json'), 'utf8')).key)).toBe(testId);
    expect(existsSync(zip)).toBe(true);
  });

  it.each([['chrome', chromeId], ['edge', edgeId]])('keeps standard SYNC identity for %s', (browser, id) => {
    const root = fixture();
    expect(standard(root, browser, 'sync').status).toBe(0);
    const manifest = JSON.parse(readFileSync(join(current(root, browser, 'sync'), 'manifest.json'), 'utf8'));
    expect(manifest.name).toBe(`Bookmark Atlas [SYNC] - ${browser === 'chrome' ? 'Chrome' : 'Edge'}`);
    expect(manifest.short_name).toBe('Atlas [SYNC]');
    expect(manifest.version_name).toBe(`${version}-sync.20261102.1`);
    expect(keyId(manifest.key)).toBe(id);
  });

  it.each([
    ['--channel', 'test'], ['--build', '20261102.1'],
    ['--channel', 'unknown', '--build', '20261102.1', '--task', 'PLAN-010'],
    ...['20260230.1', '20261102.0', '20261102.01', '20261102.-1', '20261102.9007199254740992'].map((build) => ['--channel', 'test', '--build', build, '--task', 'PLAN-010']),
    ['--channel', 'test', '--build', '20261102.1', '--task', '../PLAN-010'],
    ['--channel', 'test', '--channel', 'sync', '--build', '20261102.1', '--task', 'PLAN-010'],
  ])('rejects invalid or incomplete standard arguments %j without mutation', (...args) => {
    const root = fixture();
    const before = snapshot(root);
    expect(cli(root, ...args).status).not.toBe(0);
    expect(snapshot(root)).toBe(before);
  });

  it.each(['collision', 'partial-collision', 'downgrade', 'missing-metadata', 'corrupt-metadata', 'wrong-channel', 'wrong-id'])('preserves current and archives on %s', (problem) => {
    const root = fixture();
    expect(standard(root, 'chrome', 'test', '20261102.2').status).toBe(0);
    let build = '20261102.3';
    const receiptPath = join(current(root), 'TEST-BUILD.json');
    if (problem === 'collision') build = '20261102.2';
    if (problem === 'partial-collision') writeFileSync(`${standardArchive(root, 'chrome', 'test', build)}.sha256`, 'occupied');
    if (problem === 'downgrade') build = '20261102.1';
    if (problem === 'missing-metadata') rmSync(receiptPath);
    if (problem === 'corrupt-metadata') writeFileSync(receiptPath, '{broken');
    if (problem === 'wrong-channel' || problem === 'wrong-id') {
      const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
      receipt[problem === 'wrong-channel' ? 'channel' : 'extensionId'] = 'unknown';
      writeFileSync(receiptPath, JSON.stringify(receipt));
    }
    const before = snapshot(root);
    const result = standard(root, 'chrome', 'test', build);
    expect(result.status, result.stdout).not.toBe(0);
    expect(result.stderr).toMatch(/current|metadata|archive|exists|downgrade/i);
    expect(snapshot(root)).toBe(before);
  });

  it.each(['current-parent', 'current-leaf', 'archive-parent', 'archive-leaf', 'legacy-leaf'])('rejects destination symlink %s before mutation', (problem) => {
    const root = fixture();
    const external = join(root, 'untouched');
    mkdirSync(external);
    writeFileSync(join(external, 'keep.txt'), 'keep');
    const destination = problem === 'current-parent' ? join(root, 'output/test-current')
      : problem === 'current-leaf' ? current(root)
      : problem === 'archive-parent' ? join(root, 'output/test-archives/chrome')
      : problem === 'archive-leaf' ? standardArchive(root) : archive(root, 'chrome');
    mkdirSync(dirname(destination), { recursive: true });
    symlinkSync(external, destination);
    const before = snapshot(root);
    const result = problem === 'legacy-leaf' ? cli(root) : standard(root);
    expect(result.status, result.stdout).not.toBe(0);
    expect(result.stderr).toMatch(/symlink/i);
    expect(snapshot(root)).toBe(before);
    expect(readFileSync(join(external, 'keep.txt'), 'utf8')).toBe('keep');
  });


  it('rejects a symlink above the selected project root before mutation', () => {
    const root = fixture();
    const other = fixture();
    symlinkSync(dirname(other), join(root, 'parent-link'));
    const aliased = join(root, 'parent-link', basename(other));
    const before = snapshot(other);
    const result = cli(aliased, '--channel', 'test', '--build', '20261102.1', '--task', 'PLAN-010');
    expect(result.status, result.stdout).not.toBe(0);
    expect(result.stderr).toMatch(/symlink/i);
    expect(snapshot(other)).toBe(before);
  });

  it.each([
    ['package:test:chrome', 'chrome', 'test'], ['package:test:edge', 'edge', 'test'],
    ['package:sync-test', 'chrome', 'sync'], ['package:edge-test', 'edge', 'sync'],
  ])('packages through npm command %s with explicit build/task arguments', (command, browser, channel) => {
    const root = fixture();
    const scripts = JSON.parse(readFileSync(join(repository, 'package.json'), 'utf8')).scripts;
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version, scripts }));
    const before = snapshot(root);
    const missing = spawnSync('npm', ['run', command], { cwd: root, encoding: 'utf8' });
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toMatch(/requires/);
    expect(snapshot(root)).toBe(before);
    const result = spawnSync('npm', ['run', command, '--', '--build', '20261102.1', '--task', 'PLAN-010'], { cwd: root, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(join(current(root, browser, channel), 'TEST-BUILD.json'), 'utf8'))).toMatchObject({ browser, channel, buildId: '20261102.1', task: 'PLAN-010' });
  });


  it('rolls back current and newly published ZIP if a competing process claims the checksum', () => {
    const root = fixture();
    expect(standard(root).status).toBe(0);
    const previous = snapshot(root);
    const collision = `${standardArchive(root, 'chrome', 'test', '20261102.2')}.sha256`;
    const binary = execFileSync('which', ['unzip'], { encoding: 'utf8' }).trim();
    const bin = join(root, 'bin');
    mkdirSync(bin);
    const wrapper = join(bin, 'unzip');
    // A competing writer claims one archive filename after real CRC validation
    // but before publication, exercising the exclusive-link failure and rollback.
    writeFileSync(wrapper, `#!/usr/bin/env node
const { execFileSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');
execFileSync(${JSON.stringify(binary)}, process.argv.slice(2), { stdio: 'inherit' });
writeFileSync(process.env.ATLAS_COLLISION, 'competing checksum', { flag: 'wx' });
`);
    chmodSync(wrapper, 0o755);
    const result = spawnSync(process.execPath, [join(root, 'scripts/create-sync-test-package.mjs'), 'chrome', '--channel', 'test', '--build', '20261102.2', '--task', 'PLAN-010', '--root', root], {
      encoding: 'utf8', env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}`, ATLAS_COLLISION: collision },
    });
    expect(result.status, result.stdout).not.toBe(0);
    expect(result.stderr).toMatch(/EEXIST/);
    expect(readFileSync(collision, 'utf8')).toBe('competing checksum');
    rmSync(collision);
    expect(snapshot(root)).toBe(previous);
    expect(existsSync(standardArchive(root, 'chrome', 'test', '20261102.2'))).toBe(false);
  });


  it('preserves an existing writer lock and reports its conflict without publishing', () => {
    const root = fixture();
    const lock = join(root, 'output/.test-package-chrome-test.lock');
    writeFileSync(lock, 'another writer');
    const before = snapshot(root);
    const result = standard(root);
    expect(result.status, result.stdout).not.toBe(0);
    expect(result.stderr).toMatch(/lock.*already|already.*lock/i);
    expect(readFileSync(lock, 'utf8')).toBe('another writer');
    expect(snapshot(root)).toBe(before);
  });

  it('serializes final validation and publication against a newer competing build', async () => {
    const root = fixture();
    expect(standard(root).status).toBe(0);
    const signal = join(root, 'paused');
    const release = join(root, 'release');
    const preload = join(root, 'pause-publish.cjs');
    writeFileSync(preload, `
const fs = require('node:fs');
const promises = require('node:fs/promises');
const original = promises.mkdir;
let paused = false;
promises.mkdir = async function(path, ...args) {
  if (!paused && String(path).includes('test-archives')) {
    paused = true;
    fs.writeFileSync(${JSON.stringify(signal)}, 'paused');
    while (!fs.existsSync(${JSON.stringify(release)})) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
  return original.call(this, path, ...args);
};
require('node:module').syncBuiltinESMExports();
`);
    const older = spawn(process.execPath, ['--require', preload, join(root, 'scripts/create-sync-test-package.mjs'), 'chrome', '--channel', 'test', '--build', '20261102.2', '--task', 'PLAN-010', '--root', root], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    older.stderr.on('data', (chunk) => { stderr += chunk; });
    const completion = new Promise<number | null>((resolve, reject) => {
      older.once('error', reject);
      older.once('exit', resolve);
    });
    let competing: ReturnType<typeof standard> | undefined;
    let olderStatus: number | null = null;
    try {
      const deadline = Date.now() + 4000;
      while (!existsSync(signal)) {
        if (Date.now() > deadline) throw new Error(`Older writer did not pause: ${stderr}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      competing = standard(root, 'chrome', 'test', '20261102.3');
    } finally {
      writeFileSync(release, 'resume');
      olderStatus = await completion;
    }
    expect(olderStatus, stderr).toBe(0);
    expect(competing?.status, competing?.stdout).not.toBe(0);
    expect(competing?.stderr).toMatch(/lock.*already|already.*lock/i);
    expect(JSON.parse(readFileSync(join(current(root), 'TEST-BUILD.json'), 'utf8')).buildId).toBe('20261102.2');
    expect(standard(root, 'chrome', 'test', '20261102.3').status).toBe(0);
    expect(JSON.parse(readFileSync(join(current(root), 'TEST-BUILD.json'), 'utf8')).buildId).toBe('20261102.3');
    expect(existsSync(join(root, 'output/.test-package-chrome-test.lock'))).toBe(false);
  }, 15000);

  it('hashes the staged original files when source bytes change immediately before copying', () => {
    const root = fixture();
    const preload = join(root, 'change-source.cjs');
    writeFileSync(preload, `
const fs = require('node:fs');
const promises = require('node:fs/promises');
const original = promises.cp;
promises.cp = async function(...args) {
  fs.writeFileSync(${JSON.stringify(join(root, 'output/chrome-mv3/newtab.html'))}, '<html>after</html>');
  return original.apply(this, args);
};
require('node:module').syncBuiltinESMExports();
`);
    const result = spawnSync(process.execPath, ['--require', preload, join(root, 'scripts/create-sync-test-package.mjs'), 'chrome', '--channel', 'test', '--build', '20261102.1', '--task', 'PLAN-010', '--root', root], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    const receipt = JSON.parse(readFileSync(join(current(root), 'TEST-BUILD.json'), 'utf8'));
    const archivedBytes = execFileSync('unzip', ['-p', standardArchive(root), 'newtab.html']);
    expect(archivedBytes.toString()).toBe('<html>after</html>');
    expect(receipt.sourceFiles['newtab.html']).toBe(createHash('sha256').update(archivedBytes).digest('hex'));
  });

  it('rejects a staged manifest changed after initial source validation and preserves previous artifacts', () => {
    const root = fixture();
    expect(standard(root).status).toBe(0);
    const source = join(root, 'output/chrome-mv3/manifest.json');
    const beforeManifest = readFileSync(source);
    const before = snapshot(root);
    const preload = join(root, 'change-manifest.cjs');
    writeFileSync(preload, `
const fs = require('node:fs');
const promises = require('node:fs/promises');
const original = promises.cp;
promises.cp = async function(...args) {
  const path = ${JSON.stringify(source)};
  const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
  manifest.version = '0.0.1';
  fs.writeFileSync(path, JSON.stringify(manifest));
  return original.apply(this, args);
};
require('node:module').syncBuiltinESMExports();
`);
    const result = spawnSync(process.execPath, ['--require', preload, join(root, 'scripts/create-sync-test-package.mjs'), 'chrome', '--channel', 'test', '--build', '20261102.2', '--task', 'PLAN-010', '--root', root], { encoding: 'utf8' });
    expect(result.status, result.stdout).not.toBe(0);
    expect(result.stderr).toMatch(/manifest|version/i);
    writeFileSync(source, beforeManifest);
    expect(snapshot(root)).toBe(before);
  });

  it.each(['symlink', 'fifo'])('preserves recognized current containing a nested %s', (kind) => {
    const root = fixture();
    expect(standard(root).status).toBe(0);
    const extra = join(current(root), 'nested');
    mkdirSync(extra);
    const entry = join(extra, 'keep');
    if (kind === 'symlink') symlinkSync(join(root, 'package.json'), entry);
    else execFileSync('mkfifo', [entry]);
    const before = snapshot(root);
    const result = standard(root, 'chrome', 'test', '20261102.2');
    expect(result.status, result.stdout).not.toBe(0);
    expect(result.stderr).toMatch(/symlink|special/i);
    expect(snapshot(root)).toBe(before);
    expect(kind === 'symlink' ? lstatSync(entry).isSymbolicLink() : lstatSync(entry).isFIFO()).toBe(true);
  });

  it('orders same-day revision numbers numerically and accepts a leap-day build', () => {
    const root = fixture();
    expect(standard(root, 'chrome', 'test', '20240229.2').status).toBe(0);
    expect(standard(root, 'chrome', 'test', '20240229.10').status).toBe(0);
    const before = snapshot(root);
    expect(standard(root, 'chrome', 'test', '20240229.9').status).not.toBe(0);
    expect(snapshot(root)).toBe(before);
  });

  it.each(['version', 'private', 'conflict', 'source-symlink'])('preserves standard current and archives for invalid source %s', (problem) => {
    const root = fixture();
    expect(standard(root).status).toBe(0);
    const source = join(root, 'output/chrome-mv3');
    if (problem === 'version') writeFileSync(join(source, 'manifest.json'), JSON.stringify({ manifest_version: 3, version: '0.0.1' }));
    if (problem === 'private') writeFileSync(join(source, 'secrets.txt'), 'PRIVATE KEY');
    if (problem === 'conflict') writeFileSync(join(source, 'newtab 2.html'), 'copy');
    if (problem === 'source-symlink') symlinkSync(join(root, 'package.json'), join(source, 'link'));
    const before = snapshot(root);
    expect(standard(root, 'chrome', 'test', '20261102.2').status).not.toBe(0);
    expect(snapshot(root)).toBe(before);
  });
});
