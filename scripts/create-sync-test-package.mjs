import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, link, lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, parse, relative, resolve, sep } from 'node:path';

const TEST_PUBLIC_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Ccz2SzmMB79FDwlV4yl+La1nGR+3FneldBDVDu96Z4eEsnFXUfswwhXDjz9JOns2irQX6sxp3VHy2gndJj8z2oMDTZsc+FtkMwqMpAN1omjlOIfyTqaCTGEdf60EqqobM3pDgW7ZkicmjeNYYMQn7PBej8FChpjbClnizkFArihljoXgpz8hqtNdS3JVgtnyZ1biml+OLFElMCf9qz6+HMJqpZbASK82Rt2oLIhedJHAmK1Du9vjq4aWQmDTel1rilab34EyH0NH3Po6KSJZD7AiksHXWVxzQFxUW4OwbhGpCCWXBBtmgGlyHI3zUZD3BU1gv6ysbSWlU26mMd0LwIDAQAB';
const EXPECTED_TEST_EXTENSION_ID = 'hahlaojlpljmfdmjlbpaiamianmndkbo';
const EDGE_TEST_PUBLIC_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvUICOiJLR0kvRJB8YghXe0av9f8jtCT5f0lZin8Pgo64ATZAfoyrwcfpQ/me7Y/BjE5E4aUuU0CgGds5MEewocSsEqEfqzAbm1zwJgFHgA/r6cRAcQkOQ1lzHTRdWE4EnJ96A9Kcm+whfvCguIT20a8zSJrpftqHqqN6AELhsupfTpFmN/CxWJIcSGq4tYLc7yG3a8AcPBhRXh84sYc0KOAtdwBv0Rd8bV3PM7ua7iNgihWSU48/RR92oDVPWmNEOVNkbhsEby5bMY5CMs0eWyDo9MutLw0am6foZbW3m+SB8AeT0iVo1KjcdVUTuQqOUmnn3HWmaZnimZOKsoV8DwIDAQAB';
const EDGE_TEST_EXTENSION_ID = 'fmikkfohgeimnehehdijgfmjdmkalnfd';

const STANDARD_TEST_PUBLIC_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs9jOMU/kg0nI3wOTFs8rmFksxpAcixK2c1yc/1fmIbv9lbiNxGw1zWuxosWJ/v7/pQXIjTl8a3QUZbMKUcIgzLkwVSabWa6ponn0oOoYawevo2TnRyKwQpdGZSH73us8Yxk5PKpXfe0uPlDugo94bEiboINqjWGCFRjUklSxeJRpwltLjGW5Jj3axgIDiGHkHKBW1cSB+jvTknnQfRiVIWBsOb/hmzqkQ3FvJ0hXjOzN9EF5N0wZCgsL/L5TI2Es1ZfU9l8jtnDcl5iHnE7378vVrzo0+FjJfM+Ht5/TixXKbz2bQK0qf1DrHNEJSLBRQ3eoG7g8Dn8EQy4a5fJAowIDAQAB';
const STANDARD_TEST_EXTENSION_ID = 'jnncnppadioiabiahlkjkfhkjjbpjjda';

const { browser, projectRoot, channel, buildId, task } = parseArguments(process.argv.slice(2));
const outputRoot = join(projectRoot, 'output');
const sourceRoot = join(outputRoot, `${browser}-mv3`);
const packageMetadata = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'));
if (typeof packageMetadata.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(packageMetadata.version)) {
  throw new Error('Package version must be a stable semantic version.');
}
await assertDirectory(outputRoot);
await assertDirectory(sourceRoot);
await assertSafePackageContents(sourceRoot);
const sourceManifest = JSON.parse(await readFile(join(sourceRoot, 'manifest.json'), 'utf8'));
assertManifest(sourceManifest);

const publicKey = channel === 'test' ? STANDARD_TEST_PUBLIC_KEY : browser === 'edge' ? EDGE_TEST_PUBLIC_KEY : TEST_PUBLIC_KEY;
const extensionId = extensionIdFromPublicKey(publicKey);
if (extensionId !== (channel === 'test' ? STANDARD_TEST_EXTENSION_ID : browser === 'edge' ? EDGE_TEST_EXTENSION_ID : EXPECTED_TEST_EXTENSION_ID)) {
  throw new Error(`Unexpected test extension ID: ${extensionId}.`);
}
const checklistSource = channel === 'test' ? 'local-test-checklist.md' : browser === 'edge' ? 'edge-acceptance-test.md' : 'cross-device-sync-test.md';
const checklistName = channel === 'test' ? 'LOCAL-TEST.md' : browser === 'edge' ? 'EDGE-ACCEPTANCE-TEST.md' : 'SYNC-TEST.md';
const checklist = await readFile(join(projectRoot, 'docs', checklistSource), 'utf8');
const versionName = channel ? `${packageMetadata.version}-${channel}.${buildId}` : undefined;
const zipName = channel ? `${versionName}.zip` : `bookmark-atlas-${packageMetadata.version}-${browser}-sync-test.zip`;
const archiveRoot = channel ? join(outputRoot, 'test-archives', browser, channel) : outputRoot;
const currentRoot = channel ? join(outputRoot, 'test-current', browser, channel)
  : browser === 'edge' ? join(outputRoot, 'edge-sync-test-mv3') : undefined;
const archiveDestinations = [join(archiveRoot, zipName), join(archiveRoot, `${zipName}.sha256`),
  ...(channel ? [join(archiveRoot, `${zipName}.json`)] : [])];
for (const destination of [...archiveDestinations, ...(currentRoot ? [currentRoot] : [])]) {
  await assertDestinationPath(destination);
}
if (channel) {
  for (const destination of archiveDestinations) {
    if (await pathEntry(destination)) throw new Error(`Immutable archive already exists: ${destination}`);
  }
  await assertCurrentBuild(currentRoot);
}
// Stage on the same filesystem; preflight and ZIP validation finish before any
// prior artifact is replaced. Backups permit rollback if publication fails.
const stage = await mkdtemp(join(outputRoot, 'sync-test-stage-'));
try {
  const targetRoot = join(stage, 'package');
  await cp(sourceRoot, targetRoot, { recursive: true, dereference: false });
  // Digest the actual isolated input copy, before packaging edits. Live build
  // output may change while copying, so it cannot serve as the receipt source.
  await assertSafePackageContents(targetRoot);
  const manifest = JSON.parse(await readFile(join(targetRoot, 'manifest.json'), 'utf8'));
  assertManifest(manifest);
  if (JSON.stringify(manifest) !== JSON.stringify(sourceManifest)) {
    throw new Error('Source manifest changed while staging; rebuild and retry.');
  }
  const sourceFiles = channel ? await sourceFileHashes(targetRoot) : undefined;
  const receipt = channel ? {
    schemaVersion: 1, browser, channel, task, buildId, sourceVersion: packageMetadata.version,
    versionName, extensionId, sourceDigest: digestFileManifest(sourceFiles), sourceFiles,
  } : undefined;
  manifest.name = `Bookmark Atlas [${(channel || 'sync').toUpperCase()}] - ${browser === 'edge' ? 'Edge' : 'Chrome'}`;
  manifest.short_name = `Atlas [${(channel || 'sync').toUpperCase()}]`;
  if (channel) manifest.version_name = versionName;
  manifest.description = `Development-only Bookmark Atlas ${(channel || 'sync').toUpperCase()} build for ${browser === 'edge' ? 'Edge' : 'Chrome'} testing.`;
  manifest.key = publicKey;
  await writeFile(join(targetRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(targetRoot, checklistName), checklist
    .replaceAll('{{TEST_EXTENSION_ID}}', extensionId).replaceAll('{{VERSION}}', packageMetadata.version)
    .replaceAll('{{BROWSER}}', browser === 'edge' ? 'Edge' : 'Chrome')
    .replaceAll('{{VERSION_NAME}}', versionName || packageMetadata.version)
    .replaceAll('{{TASK}}', task || '').replaceAll('{{CURRENT_DIRECTORY}}', currentRoot ? relative(projectRoot, currentRoot).split(sep).join('/') : ''));
  if (receipt) await writeFile(join(targetRoot, 'TEST-BUILD.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  await assertSafePackageContents(targetRoot);
  const stagedZip = join(stage, zipName);
  await run('zip', ['-qr', stagedZip, '.'], targetRoot);
  await run('unzip', ['-tq', stagedZip], stage);
  const checksum = createHash('sha256').update(await readFile(stagedZip)).digest('hex');
  const stagedChecksum = `${stagedZip}.sha256`;
  await writeFile(stagedChecksum, `${checksum}  ${zipName}\n`);
  const artifacts = [
    { source: stagedZip, destination: archiveDestinations[0], immutable: Boolean(channel) },
    { source: stagedChecksum, destination: archiveDestinations[1], immutable: Boolean(channel) },
  ];
  if (receipt) {
    const stagedReceipt = join(stage, `${zipName}.json`);
    await writeFile(stagedReceipt, `${JSON.stringify(receipt, null, 2)}\n`);
    artifacts.push({ source: stagedReceipt, destination: archiveDestinations[2], immutable: true });
  }
  if (currentRoot) artifacts.push({ source: targetRoot, destination: currentRoot, immutable: false });
  // Serialize final validation, publication, and rollback by browser/channel.
  // Exclusive archive links also protect against unrelated competing writers.
  await withPublicationLock(async () => {
    for (const artifact of artifacts) await assertDestinationPath(artifact.destination);
    if (channel) await assertCurrentBuild(currentRoot);
    for (const artifact of artifacts) await mkdir(dirname(artifact.destination), { recursive: true });
    await replaceArtifacts(artifacts, stage);
  });
  console.log(`Test package created: ${relative(projectRoot, archiveDestinations[0])}`);
  if (currentRoot) console.log(`Visible test build: ${relative(projectRoot, currentRoot)} (reload the same folder).`);
  console.log(`Fixed test extension ID: ${extensionId}`);
  console.log(`SHA-256: ${checksum}`);
} finally {
  await rm(stage, { recursive: true, force: true });
}

function assertManifest(manifest) {
  if (manifest.version !== packageMetadata.version) {
    throw new Error(`Built manifest is ${manifest.version}; package version is ${packageMetadata.version}.`);
  }
  if (manifest.manifest_version !== 3) throw new Error('Test source must be a Manifest V3 build.');
}

async function withPublicationLock(publish) {
  if (!channel) return publish();
  const lockPath = join(outputRoot, `.test-package-${browser}-${channel}.lock`);
  await assertDestinationPath(lockPath);
  let lock;
  try {
    lock = await open(lockPath, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(`Packaging lock already exists: ${lockPath}. Another writer may be active; this command will not remove its lock.`);
    }
    throw error;
  }
  const owned = await lock.stat();
  try {
    await lock.writeFile(`${JSON.stringify({ pid: process.pid, browser, channel, buildId })}\n`);
    return await publish();
  } finally {
    await lock.close();
    const entry = await pathEntry(lockPath);
    // Never remove a lock replaced by another actor, including a symlink.
    if (entry && !entry.isSymbolicLink() && entry.dev === owned.dev && entry.ino === owned.ino) {
      await rm(lockPath);
    }
  }
}

function parseArguments(args) {
  let browser = 'chrome';
  let selectedTarget = false;
  let projectRoot = fileURLToPath(new URL('../', import.meta.url));
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (['--root', '--channel', '--build', '--task'].includes(arg)) {
      if (Object.hasOwn(options, arg)) throw new Error(`Duplicate option: ${arg}`);
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value.`);
      options[arg] = value;
      if (arg === '--root') projectRoot = resolve(value);
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      if (selectedTarget || !['chrome', 'edge'].includes(arg)) throw new Error(`Unsupported browser target: ${arg}`);
      browser = arg;
      selectedTarget = true;
    }
  }
  const channel = options['--channel'];
  const buildId = options['--build'];
  const task = options['--task'];
  if (channel || buildId || task) {
    if (!['test', 'sync'].includes(channel) || !validBuildId(buildId) || !/^PLAN-\d{3}$/.test(task || '')) {
      throw new Error('Standard packaging requires --channel test|sync --build YYYYMMDD.N (valid date and positive revision) --task PLAN-NNN.');
    }
  }
  return { browser, projectRoot, channel, buildId, task };
}

function validBuildId(value) {
  if (typeof value !== 'string' || !/^\d{8}\.[1-9]\d*$/.test(value)) return false;
  const [date, revision] = value.split('.');
  const parsed = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00Z`);
  return Number.isSafeInteger(Number(revision)) && !Number.isNaN(parsed.valueOf())
    && parsed.toISOString().slice(0, 10).replaceAll('-', '') === date;
}

function compareBuilds(left, right) {
  const [leftDate, leftRevision] = left.split('.');
  const [rightDate, rightRevision] = right.split('.');
  return leftDate.localeCompare(rightDate) || Number(leftRevision) - Number(rightRevision);
}

async function pathEntry(path) {
  try { return await lstat(path); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}

async function assertDestinationPath(destination) {
  // Check all absolute ancestors and the leaf without following symlinks.
  const { root } = parse(destination);
  const components = relative(root, destination).split(sep);
  let path = root;
  for (const component of ['', ...components]) {
    path = join(path, component);
    const entry = await pathEntry(path);
    if (entry?.isSymbolicLink()) throw new Error(`Refusing destination symlink: ${path}`);
    if (entry && path !== destination && !entry.isDirectory()) throw new Error(`Destination parent is not a directory: ${path}`);
  }
}

async function assertCurrentBuild(directory) {
  const entry = await pathEntry(directory);
  if (!entry) return;
  try {
    if (!entry.isDirectory()) throw new Error('not a directory');
    await assertSafePackageContents(directory);
    for (const filename of ['TEST-BUILD.json', 'manifest.json']) {
      const file = await lstat(join(directory, filename));
      if (!file.isFile() || file.isSymbolicLink()) throw new Error('metadata must be regular files');
    }
    const previous = JSON.parse(await readFile(join(directory, 'TEST-BUILD.json'), 'utf8'));
    const previousManifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
    if (previous.schemaVersion !== 1 || previous.browser !== browser || previous.channel !== channel
      || previous.extensionId !== extensionId || !validBuildId(previous.buildId)
      || !/^PLAN-\d{3}$/.test(previous.task || '') || !/^\d+\.\d+\.\d+$/.test(previous.sourceVersion || '')
      || previous.versionName !== `${previous.sourceVersion}-${channel}.${previous.buildId}`
      || !/^[a-f0-9]{64}$/.test(previous.sourceDigest || '')
      || !previous.sourceFiles || typeof previous.sourceFiles !== 'object' || Array.isArray(previous.sourceFiles)
      || !Object.keys(previous.sourceFiles).length
      || !Object.entries(previous.sourceFiles).every(([path, hash]) => path && !path.startsWith('/') && !path.split('/').includes('..') && /^[a-f0-9]{64}$/.test(hash))
      || previous.sourceDigest !== digestFileManifest(previous.sourceFiles)
      || previousManifest.version !== previous.sourceVersion || previousManifest.version_name !== previous.versionName
      || previousManifest.key !== publicKey) throw new Error('unrecognized or corrupt receipt');
    const incomingVersion = packageMetadata.version.split('.').map(Number);
    const previousVersion = previous.sourceVersion.split('.').map(Number);
    const versionOrder = incomingVersion.map((part, index) => part - previousVersion[index]).find((part) => part !== 0) || 0;
    if (versionOrder < 0 || compareBuilds(buildId, previous.buildId) <= 0) throw new Error('current build downgrade or repeated build');
  } catch (error) {
    throw new Error(`Refusing to replace current build with unknown/corrupt metadata or downgrade: ${error.message}`);
  }
}

async function sourceFileHashes(directory, prefix = '') {
  const files = {};
  const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(files, await sourceFileHashes(path, name));
    else files[name] = createHash('sha256').update(await readFile(path)).digest('hex');
  }
  return files;
}

function digestFileManifest(files) {
  return createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(files).sort(([left], [right]) => left.localeCompare(right))))).digest('hex');
}

async function assertDirectory(path) {
  const entry = await lstat(path);
  if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error(`Expected a non-symlink build directory: ${path}`);
}

async function replaceArtifacts(artifacts, stage) {
  const backups = [];
  const installed = [];
  try {
    for (const [index, artifact] of artifacts.entries()) {
      if (artifact.immutable) continue;
      try {
        await lstat(artifact.destination);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        continue;
      }
      const backup = join(stage, `previous-${index}`);
      await rename(artifact.destination, backup);
      backups.push({ backup, destination: artifact.destination });
    }
    for (const artifact of artifacts) {
      if (artifact.immutable) await link(artifact.source, artifact.destination);
      else await rename(artifact.source, artifact.destination);
      installed.push(artifact.destination);
    }
  } catch (error) {
    for (const destination of installed.reverse()) await rm(destination, { recursive: true, force: true });
    for (const { backup, destination } of backups.reverse()) await rename(backup, destination);
    throw error;
  }
}

function extensionIdFromPublicKey(publicKey) {
  const digest = createHash('sha256').update(Buffer.from(publicKey, 'base64')).digest().subarray(0, 16);
  return Array.from(digest)
    .flatMap((byte) => [byte >> 4, byte & 0x0f])
    .map((value) => 'abcdefghijklmnop'[value])
    .join('');
}

async function assertSafePackageContents(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (
      entry.name === '.DS_Store'
      || entry.name === '__MACOSX'
      || (/^_/.test(entry.name) && !(entry.name === '_locales' && entry.isDirectory()))
      || /(?: \d+| \(\d+\))(?:\.[^.]+)?$/.test(entry.name)
    ) {
      throw new Error(`Refusing to ship reserved or conflict-copy path: ${entry.name}`);
    }
    if (entry.isSymbolicLink() || !entry.isDirectory() && !entry.isFile()) {
      throw new Error(`Refusing to ship symlink or special file: ${entry.name}`);
    }
    if (entry.isDirectory()) {
      await assertSafePackageContents(path);
      continue;
    }
    if (/\.(?:pem|key|p12|pfx)$/i.test(entry.name)) {
      throw new Error(`Refusing to ship possible private-key file: ${entry.name}`);
    }
    if ((await readFile(path)).includes(Buffer.from('PRIVATE KEY'))) {
      throw new Error(`Refusing to ship private-key material in: ${entry.name}`);
    }
  }
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}.`));
    });
  });
}
