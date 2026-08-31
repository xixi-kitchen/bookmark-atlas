import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../output/chrome-mv3/manifest.json', import.meta.url), 'utf8'));
const permissions = [...(manifest.permissions ?? [])].sort();

if (manifest.manifest_version !== 3) throw new Error('Expected Manifest V3.');
if (manifest.chrome_url_overrides?.newtab !== 'newtab.html') throw new Error('Missing new tab override.');
if (JSON.stringify(permissions) !== JSON.stringify(['bookmarks', 'declarativeNetRequestWithHostAccess', 'favicon', 'history', 'search', 'storage', 'tabs'])) throw new Error(`Unexpected permissions: ${permissions.join(', ')}`);
const expectedSuggestionHosts = [
  'https://api.bing.com/*',
  'https://suggestion.baidu.com/*',
  'https://suggestqueries.google.com/*',
  'https://www.youtube.com/*',
];
if (JSON.stringify([...(manifest.host_permissions ?? [])].sort()) !== JSON.stringify(expectedSuggestionHosts)) {
  throw new Error(`Unexpected host permissions: ${(manifest.host_permissions ?? []).join(', ')}`);
}
if (manifest.optional_host_permissions?.length) throw new Error('Store build must not request broad optional host permissions.');
if (!manifest.icons?.['128']) throw new Error('Missing 128px store icon.');
if (!manifest.content_security_policy?.extension_pages?.includes('frame-src https: http://localhost:* http://127.0.0.1:*')) {
  throw new Error('The extension CSP must allow HTTPS and local-development web embeds only.');
}
if (!manifest.content_security_policy?.extension_pages?.includes('connect-src https: http://localhost:* http://127.0.0.1:*')) {
  throw new Error('The extension CSP must allow remote suggestion requests.');
}

console.log('Manifest verified: MV3, unified search permissions, remote suggestions, web embeds, icons present.');
