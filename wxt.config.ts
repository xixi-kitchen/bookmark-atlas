import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  outDir: 'output',
  manifest: {
    name: 'Bookmark Atlas',
    description: 'An Excalidraw-powered new tab with persistent web embeds and Chrome bookmark cards.',
    permissions: ['bookmarks', 'storage', 'favicon', 'history', 'tabs', 'search', 'declarativeNetRequestWithHostAccess'],
    host_permissions: [
      'https://suggestion.baidu.com/*',
      'https://api.bing.com/*',
      'https://suggestqueries.google.com/*',
      'https://www.youtube.com/*',
    ],
    minimum_chrome_version: '114',
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'; frame-src https: http://localhost:* http://127.0.0.1:*; connect-src https: http://localhost:* http://127.0.0.1:*",
    },
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
});
