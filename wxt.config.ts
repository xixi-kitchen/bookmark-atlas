import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  outDir: 'output',
  manifest: ({ browser }) => ({
    name: '__MSG_appName__',
    short_name: '__MSG_appShortName__',
    description: '__MSG_appDescription__',
    default_locale: 'en',
    permissions: [
      'bookmarks',
      'storage',
      ...(browser === 'safari' ? [] : ['favicon']),
      'history',
      'tabs',
      'search',
      ...(browser === 'safari' ? [] : ['declarativeNetRequestWithHostAccess']),
    ],
    host_permissions: [
      'https://suggestion.baidu.com/*',
      'https://api.bing.com/*',
      'https://suggestqueries.google.com/*',
      ...(browser === 'safari' ? [] : ['https://www.youtube.com/*']),
    ],
    ...(browser === 'safari'
      ? { browser_specific_settings: { safari: { strict_min_version: '17.0' } } }
      : { minimum_chrome_version: '114' }),
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'; frame-src https: http://localhost:* http://127.0.0.1:*; connect-src https: http://localhost:* http://127.0.0.1:*",
    },
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  }),
});
