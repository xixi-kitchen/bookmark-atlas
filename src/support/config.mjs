const CONFIG_FIELDS = ['enabled', 'pageUrl', 'wechatQrUrl', 'alipayQrUrl'];
const CHANNEL_FIELDS = { koFi: 'koFiUrl', wechat: 'wechatQrUrl', alipay: 'alipayQrUrl' };

function validateHttpsUrl(value, field, optional = false) {
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string.`);
  if (optional && value === '') return null;
  // Reject syntax that URL() would silently repair before checking the scheme.
  if (!/^https:\/\//i.test(value) || /[\s\\\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError(`${field} must be an absolute HTTPS URL.`);
  }
  const url = new URL(value);
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw new TypeError(`${field} must be a credential-free HTTPS URL.`);
  }
  return url;
}

function validateEntry({ enabled, pageUrl }) {
  if (typeof enabled !== 'boolean') throw new TypeError('enabled must be a boolean.');
  const { pathname } = validateHttpsUrl(pageUrl, 'pageUrl');
  if (/[?#]/u.test(pageUrl)) throw new TypeError('pageUrl must not contain a query or fragment.');
  if (!pathname.endsWith('/support-project.html') || pathname.endsWith('/zh/support-project.html')) {
    throw new TypeError('pageUrl must point to the generated English support-project.html page.');
  }
}

function hasFields(input, required, optional = []) {
  return input && typeof input === 'object' && !Array.isArray(input)
    && required.every((key) => Object.hasOwn(input, key))
    && Reflect.ownKeys(input).every((key) => required.includes(key) || optional.includes(key));
}

/** Validate the build-time website configuration, including existing QR-only files. */
export function parseProjectSupportConfig(input) {
  if (!hasFields(input, CONFIG_FIELDS, ['koFiUrl', 'channelEnabled'])) {
    throw new TypeError('Invalid project support configuration fields.');
  }
  const { enabled, pageUrl, wechatQrUrl, alipayQrUrl, channelEnabled } = input;
  const koFiUrl = Object.hasOwn(input, 'koFiUrl') ? input.koFiUrl : '';
  validateEntry(input);
  validateHttpsUrl(wechatQrUrl, 'wechatQrUrl', true);
  validateHttpsUrl(alipayQrUrl, 'alipayQrUrl', true);
  const koFi = validateHttpsUrl(koFiUrl, 'koFiUrl', true);
  if (koFi && (koFi.hostname !== 'ko-fi.com' || koFi.port || /[?#]/u.test(koFiUrl)
    || !/^\/[a-z0-9_-]+\/?$/i.test(koFi.pathname))) {
    throw new TypeError('koFiUrl must point to a public creator profile on ko-fi.com.');
  }
  const fields = Object.entries(CHANNEL_FIELDS);
  if (Object.hasOwn(input, 'channelEnabled')) {
    if (!hasFields(channelEnabled, Object.keys(CHANNEL_FIELDS)) || fields.some(([channel, key]) =>
      typeof channelEnabled[channel] !== 'boolean' || (channelEnabled[channel] && !input[key]))) {
      throw new TypeError('Each enabled support channel requires its public URL.');
    }
  }
  if (enabled && !fields.some(([channel, key]) => input[key] && channelEnabled?.[channel] !== false)) {
    throw new TypeError('Enabled project support requires at least one public channel URL.');
  }
  return { enabled, pageUrl, wechatQrUrl, alipayQrUrl,
    ...(Object.hasOwn(input, 'koFiUrl') ? { koFiUrl } : {}),
    ...(channelEnabled ? { channelEnabled: { ...channelEnabled } } : {}),
  };
}

/** Return an optional localized external link; malformed settings fail closed. */
export function getProjectSupportUrl(input, locale = 'en') {
  if (locale !== 'en' && locale !== 'zh-CN') return null;
  try {
    const config = hasFields(input, ['enabled', 'pageUrl']) ? input : parseProjectSupportConfig(input);
    validateEntry(config);
    if (!config.enabled) return null;
    if (locale === 'en') return config.pageUrl;
    const url = new URL(config.pageUrl);
    const separator = url.pathname.lastIndexOf('/');
    url.pathname = `${url.pathname.slice(0, separator + 1)}zh/${url.pathname.slice(separator + 1)}`;
    return url.href;
  } catch {
    return null;
  }
}
