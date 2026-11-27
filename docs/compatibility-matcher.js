function isMatchingHost(host, entry) {
  return entry.startsWith('*.') ? host.endsWith(entry.slice(1)) : entry === host;
}

const githubName = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$/;
const githubNumber = /^[1-9][0-9]{0,15}$/;
const githubGistId = /^[a-f0-9]{5,64}$/i;
const reservedGitHubOwners = new Set(['apps', 'collections', 'discussions', 'events', 'features', 'marketplace', 'organizations', 'orgs', 'search', 'settings', 'topics', 'users', 'enterprise', 'explore', 'security', 'sponsors', 'site']);

function githubPreviewUrl(url) {
  const parts = url.pathname.split('/').slice(1);
  if (parts.at(-1) === '') parts.pop();
  if (parts.some((part) => !part)) return;
  const [first = '', second = '', area, action, detail] = parts;
  if (url.hostname === 'gist.github.com') {
    const id = parts.length === 1 ? first : parts.length === 2 && githubName.test(first) ? second : '';
    return githubGistId.test(id) ? `https://api.github.com/gists/${id}` : undefined;
  }
  if (!githubName.test(first) || !githubName.test(second) || reservedGitHubOwners.has(first.toLowerCase())) return;
  const repo = `https://api.github.com/repos/${first}/${second}`;
  if (parts.length === 2) return repo;
  if (parts.length === 4 && action && githubNumber.test(action)) {
    if (area === 'issues') return `${repo}/issues/${action}`;
    if (area === 'pull') return `${repo}/pulls/${action}`;
  }
  if (area === 'releases' && parts.length === 4 && action === 'latest') return `${repo}/releases/latest`;
  if (area === 'releases' && action === 'tag' && detail && parts.length === 5) {
    try {
      const tag = decodeURIComponent(detail);
      if (!/^[A-Za-z0-9._/-]{1,120}$/.test(tag) || tag.split('/').some((part) => !part || part === '.' || part === '..')) return;
      return `${repo}/releases/tags/${encodeURIComponent(tag)}`;
    } catch {
      return;
    }
  }
}

export function createCompatibilityMatcher(catalogue) {
  const rules = catalogue.map((rule) => ({ ...rule, pathPattern: new RegExp(rule.path) }));
  return function getCompatibility(raw) {
    let url;
    try { url = new URL(raw); } catch { return { mode: 'link', status: 'unverified' }; }
    if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)) return { mode: 'link', status: 'unverified' };
    if (url.protocol === 'https:' && !url.port) {
      const host = url.hostname;
      const match = rules.find((rule) => rule.hosts.some((entry) => isMatchingHost(host, entry)) && rule.pathPattern.test(url.pathname));
      if (match) {
        const { id, title, reason, mode, status, preview } = match;
        if (preview?.kind === 'github') {
          const urlToFetch = githubPreviewUrl(url);
          return urlToFetch
            ? { id, title, reason, mode, status, preview: { kind: 'github', url: urlToFetch } }
            : { id, title, mode: 'link', status: 'blocked', reason: {
              en: 'This GitHub route has no supported preview. Open the original page.',
              'zh-CN': '此类 GitHub 地址暂无预览，请打开原页。',
            } };
        }
        return { id, title, reason, mode, status, ...(preview ? { preview } : {}) };
      }
    }
    const isLocalDevelopment = ['localhost', '127.0.0.1'].includes(url.hostname);
    return { mode: url.protocol === 'https:' || isLocalDevelopment ? 'embed' : 'link', status: 'unverified' };
  };
}
