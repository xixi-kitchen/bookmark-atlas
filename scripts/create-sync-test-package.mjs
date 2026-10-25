import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, lstat, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const TEST_PUBLIC_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Ccz2SzmMB79FDwlV4yl+La1nGR+3FneldBDVDu96Z4eEsnFXUfswwhXDjz9JOns2irQX6sxp3VHy2gndJj8z2oMDTZsc+FtkMwqMpAN1omjlOIfyTqaCTGEdf60EqqobM3pDgW7ZkicmjeNYYMQn7PBej8FChpjbClnizkFArihljoXgpz8hqtNdS3JVgtnyZ1biml+OLFElMCf9qz6+HMJqpZbASK82Rt2oLIhedJHAmK1Du9vjq4aWQmDTel1rilab34EyH0NH3Po6KSJZD7AiksHXWVxzQFxUW4OwbhGpCCWXBBtmgGlyHI3zUZD3BU1gv6ysbSWlU26mMd0LwIDAQAB';
const EXPECTED_TEST_EXTENSION_ID = 'hahlaojlpljmfdmjlbpaiamianmndkbo';
const EDGE_TEST_PUBLIC_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvUICOiJLR0kvRJB8YghXe0av9f8jtCT5f0lZin8Pgo64ATZAfoyrwcfpQ/me7Y/BjE5E4aUuU0CgGds5MEewocSsEqEfqzAbm1zwJgFHgA/r6cRAcQkOQ1lzHTRdWE4EnJ96A9Kcm+whfvCguIT20a8zSJrpftqHqqN6AELhsupfTpFmN/CxWJIcSGq4tYLc7yG3a8AcPBhRXh84sYc0KOAtdwBv0Rd8bV3PM7ua7iNgihWSU48/RR92oDVPWmNEOVNkbhsEby5bMY5CMs0eWyDo9MutLw0am6foZbW3m+SB8AeT0iVo1KjcdVUTuQqOUmnn3HWmaZnimZOKsoV8DwIDAQAB';
const EDGE_TEST_EXTENSION_ID = 'fmikkfohgeimnehehdijgfmjdmkalnfd';

const { browser, projectRoot } = parseArguments(process.argv.slice(2));
const outputRoot = join(projectRoot, 'output');
const sourceRoot = join(outputRoot, `${browser}-mv3`);
const packageMetadata = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'));
if (typeof packageMetadata.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(packageMetadata.version)) {
  throw new Error('Package version must be a stable semantic version.');
}
await assertDirectory(outputRoot);
await assertDirectory(sourceRoot);
await assertSafePackageContents(sourceRoot);
const manifest = JSON.parse(await readFile(join(sourceRoot, 'manifest.json'), 'utf8'));
if (manifest.version !== packageMetadata.version) {
  throw new Error(`Built manifest is ${manifest.version}; package version is ${packageMetadata.version}.`);
}
if (manifest.manifest_version !== 3) throw new Error('Sync-test source must be a Manifest V3 build.');

const publicKey = browser === 'edge' ? EDGE_TEST_PUBLIC_KEY : TEST_PUBLIC_KEY;
const extensionId = extensionIdFromPublicKey(publicKey);
if (extensionId !== (browser === 'edge' ? EDGE_TEST_EXTENSION_ID : EXPECTED_TEST_EXTENSION_ID)) {
  throw new Error(`Unexpected test extension ID: ${extensionId}.`);
}
const checklistSource = browser === 'edge' ? 'edge-acceptance-test.md' : 'cross-device-sync-test.md';
const checklistName = browser === 'edge' ? 'EDGE-ACCEPTANCE-TEST.md' : 'SYNC-TEST.md';
const checklist = await readFile(join(projectRoot, 'docs', checklistSource), 'utf8');
const zipName = `bookmark-atlas-${packageMetadata.version}-${browser}-sync-test.zip`;

// Stage on the same filesystem; preflight and ZIP validation finish before any
// prior artifact is replaced. Backups permit rollback if publication fails.
const stage = await mkdtemp(join(outputRoot, 'sync-test-stage-'));
try {
  const targetRoot = join(stage, 'package');
  await cp(sourceRoot, targetRoot, { recursive: true, dereference: false });
  manifest.name = browser === 'edge' ? 'Bookmark Atlas Edge Sync Test' : 'Bookmark Atlas Sync Test';
  manifest.short_name = browser === 'edge' ? 'Atlas Edge Sync Test' : 'Atlas Sync Test';
  manifest.description = `Development-only Bookmark Atlas build for cross-device ${browser === 'edge' ? 'Edge' : 'Chrome'} Sync acceptance testing.`;
  manifest.key = publicKey;
  await writeFile(join(targetRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(targetRoot, checklistName), checklist
    .replaceAll('{{TEST_EXTENSION_ID}}', extensionId).replaceAll('{{VERSION}}', packageMetadata.version));
  await assertSafePackageContents(targetRoot);
  const stagedZip = join(stage, zipName);
  await run('zip', ['-qr', stagedZip, '.'], targetRoot);
  await run('unzip', ['-tq', stagedZip], stage);
  const checksum = createHash('sha256').update(await readFile(stagedZip)).digest('hex');
  const stagedChecksum = `${stagedZip}.sha256`;
  await writeFile(stagedChecksum, `${checksum}  ${zipName}\n`);
  const artifacts = [
    { source: stagedZip, destination: join(outputRoot, zipName) },
    { source: stagedChecksum, destination: join(outputRoot, `${zipName}.sha256`) },
    ...(browser === 'edge' ? [{ source: targetRoot, destination: join(outputRoot, 'edge-sync-test-mv3') }] : []),
  ];
  await replaceArtifacts(artifacts, stage);
  console.log(`Sync-test package created: output/${zipName}`);
  if (browser === 'edge') console.log('Visible acceptance build: output/edge-sync-test-mv3 (new-tab override retained).');
  console.log(`Fixed test extension ID: ${extensionId}`);
  console.log(`SHA-256: ${checksum}`);
} finally {
  await rm(stage, { recursive: true, force: true });
}

function parseArguments(args) {
  let browser = 'chrome';
  let selectedTarget = false;
  let projectRoot = fileURLToPath(new URL('../', import.meta.url));
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--root') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error('--root requires a project directory.');
      projectRoot = resolve(value);
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      if (selectedTarget || !['chrome', 'edge'].includes(arg)) throw new Error(`Unsupported browser target: ${arg}`);
      browser = arg;
      selectedTarget = true;
    }
  }
  return { browser, projectRoot };
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
      await rename(artifact.source, artifact.destination);
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
