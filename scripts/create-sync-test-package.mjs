import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const TEST_PUBLIC_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Ccz2SzmMB79FDwlV4yl+La1nGR+3FneldBDVDu96Z4eEsnFXUfswwhXDjz9JOns2irQX6sxp3VHy2gndJj8z2oMDTZsc+FtkMwqMpAN1omjlOIfyTqaCTGEdf60EqqobM3pDgW7ZkicmjeNYYMQn7PBej8FChpjbClnizkFArihljoXgpz8hqtNdS3JVgtnyZ1biml+OLFElMCf9qz6+HMJqpZbASK82Rt2oLIhedJHAmK1Du9vjq4aWQmDTel1rilab34EyH0NH3Po6KSJZD7AiksHXWVxzQFxUW4OwbhGpCCWXBBtmgGlyHI3zUZD3BU1gv6ysbSWlU26mMd0LwIDAQAB';
const EXPECTED_TEST_EXTENSION_ID = 'hahlaojlpljmfdmjlbpaiamianmndkbo';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const outputRoot = join(projectRoot, 'output');
const sourceRoot = join(outputRoot, 'chrome-mv3');
const targetRoot = await mkdtemp(join(tmpdir(), 'bookmark-atlas-sync-test-'));
const packageMetadata = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'));
const zipName = `bookmark-atlas-${packageMetadata.version}-chrome-sync-test.zip`;
const zipPath = join(outputRoot, zipName);
const checksumPath = `${zipPath}.sha256`;

await rm(zipPath, { force: true });
await rm(checksumPath, { force: true });
await mkdir(outputRoot, { recursive: true });
await cp(sourceRoot, targetRoot, { recursive: true });

const manifestPath = join(targetRoot, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest.version !== packageMetadata.version) {
  throw new Error(`Built manifest is ${manifest.version}; package version is ${packageMetadata.version}.`);
}

manifest.name = 'Bookmark Atlas Sync Test';
manifest.short_name = 'Atlas Sync Test';
manifest.description = 'Development-only Bookmark Atlas build for cross-device Chrome Sync acceptance testing.';
manifest.key = TEST_PUBLIC_KEY;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const extensionId = extensionIdFromPublicKey(TEST_PUBLIC_KEY);
if (extensionId !== EXPECTED_TEST_EXTENSION_ID) {
  throw new Error(`Unexpected test extension ID: ${extensionId}.`);
}

const checklist = await readFile(join(projectRoot, 'docs', 'cross-device-sync-test.md'), 'utf8');
await writeFile(
  join(targetRoot, 'SYNC-TEST.md'),
  checklist.replaceAll('{{TEST_EXTENSION_ID}}', extensionId).replaceAll('{{VERSION}}', packageMetadata.version),
);

await assertSafePackageContents(targetRoot);
await run('zip', ['-qr', zipPath, '.'], targetRoot);
await run('unzip', ['-tq', zipPath], outputRoot);
const archive = await readFile(zipPath);
const checksum = createHash('sha256').update(archive).digest('hex');
await writeFile(checksumPath, `${checksum}  ${zipName}\n`);

const packagedManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (packagedManifest.key !== TEST_PUBLIC_KEY || packagedManifest.version !== packageMetadata.version) {
  throw new Error('Sync-test manifest verification failed.');
}
console.log(`Sync-test package created: output/${zipName}`);
console.log(`Fixed test extension ID: ${extensionId}`);
console.log(`SHA-256: ${checksum}`);
await rm(targetRoot, { recursive: true, force: true });

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
      || (/^_/.test(entry.name) && entry.name !== '_locales')
      || / \d+$/.test(entry.name)
    ) {
      throw new Error(`Refusing to ship reserved or conflict-copy path: ${entry.name}`);
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
