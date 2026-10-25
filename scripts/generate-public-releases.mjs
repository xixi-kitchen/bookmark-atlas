import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { renderPublicReleases, updateHomepageReleaseStatus } from './lib/public-releases.mjs';
import { validateReleaseNotes } from './lib/validate-release-notes.mjs';

const args = process.argv.slice(2);
let root = fileURLToPath(new URL('../', import.meta.url));
let check = false;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--check') check = true;
  else if (args[index] === '--root' && args[index + 1] && !args[index + 1].startsWith('--')) root = resolve(args[++index]);
  else throw new Error(`Unknown or incomplete option: ${args[index]}`);
}
const read = (path) => readFile(resolve(root, path), 'utf8');
const [packageSource, catalogueSource, statusSource, homepage, chineseHomepage] = await Promise.all([
  read('package.json'), read('src/onboarding/releaseNotes.json'), read('docs/release-status.json'), read('docs/index.html'), read('docs/zh/index.html'),
]);
const { version } = JSON.parse(packageSource);
const entries = JSON.parse(catalogueSource);
const status = JSON.parse(statusSource);
validateReleaseNotes(entries, version);
if (status.candidateVersion !== version) throw new Error(`Release status candidate ${status.candidateVersion} does not match package version ${version}`);
const outputs = [
  ['docs/changelog.html', renderPublicReleases(entries, status)],
  ['docs/index.html', updateHomepageReleaseStatus(homepage, status)],
  ['docs/zh/changelog.html', renderPublicReleases(entries, status, 'zh-CN')],
  ['docs/zh/index.html', updateHomepageReleaseStatus(chineseHomepage, status, 'zh-CN')],
];

// Compute and preflight all four outputs before making any changes.
const pending = [];
for (const [path, expected] of outputs) {
  let actual;
  try { actual = await read(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (actual !== expected) pending.push([path, expected]);
}
if (check && pending.length) {
  throw new Error(`Stale generated release content: ${pending[0][0]}. Run npm run docs:release.`);
}
for (const [path, expected] of pending) {
  await mkdir(dirname(resolve(root, path)), { recursive: true });
  await writeFile(resolve(root, path), expected, 'utf8');
}
console.log(check ? 'Public release content is current.' : 'Public release content generated.');
