import { access, readFile } from 'node:fs/promises';
import { validateReleaseNotes } from './lib/validate-release-notes.mjs';

const root = new URL('../', import.meta.url);
const browser = process.argv[2] ?? 'chrome';
if (!['chrome', 'edge', 'safari'].includes(browser)) throw new Error(`Unsupported browser target: ${browser}`);
const packageMetadata = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const version = packageMetadata.version;
const catalogue = JSON.parse(await readFile(new URL('src/onboarding/releaseNotes.json', root), 'utf8'));
validateReleaseNotes(catalogue, version);
const versionHeading = `## v${version}`;
const changelog = await readFile(new URL('CHANGELOG.md', root), 'utf8');
const releaseNotesUrl = new URL(`docs/releases/v${version}.md`, root);

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Expected a stable semantic version, received ${version}.`);
}
if (!changelog.includes(versionHeading)) {
  throw new Error(`CHANGELOG.md is missing ${versionHeading}.`);
}

await access(releaseNotesUrl).catch(() => {
  throw new Error(`Missing docs/releases/v${version}.md.`);
});

const releaseNotes = await readFile(releaseNotesUrl, 'utf8');
if (!releaseNotes.includes(`v${version}`)) {
  throw new Error(`Release notes do not identify v${version}.`);
}
if (!releaseNotes.includes('## English') || !releaseNotes.includes('## 中文')) {
  throw new Error('Release notes must include English and Chinese sections.');
}

const builtManifestUrl = new URL(`output/${browser}-mv3/manifest.json`, root);
try {
  const manifest = JSON.parse(await readFile(builtManifestUrl, 'utf8'));
  if (manifest.version !== version) {
    throw new Error(`Built ${browser} manifest is ${manifest.version}; package.json is ${version}. Rebuild before release.`);
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

console.log(`Release metadata verified for v${version} (${browser} build; publication status unchanged).`);
