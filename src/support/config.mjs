const CONFIG_FIELDS = ['enabled', 'pageUrl', 'wechatQrUrl', 'alipayQrUrl'];

function validateHttpsUrl(value, field, optional = false) {
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string.`);
  if (optional && value === '') return;
  // Reject syntax that URL() would silently repair before checking the scheme.
  if (!/^https:\/\//i.test(value) || /[\s\\\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError(`${field} must be an absolute HTTPS URL.`);
  }
  const url = new URL(value);
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw new TypeError(`${field} must be a credential-free HTTPS URL.`);
  }
}

/** Validate the shared build-time configuration without coercing values. */
export function parseProjectSupportConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Reflect.ownKeys(input).length !== CONFIG_FIELDS.length
    || !CONFIG_FIELDS.every((key) => Object.hasOwn(input, key))) {
    throw new TypeError('Project support configuration must contain exactly four supported fields.');
  }
  const { enabled, pageUrl, wechatQrUrl, alipayQrUrl } = input;
  if (typeof enabled !== 'boolean') throw new TypeError('enabled must be a boolean.');
  validateHttpsUrl(pageUrl, 'pageUrl');
  if (/[?#]/u.test(pageUrl)) throw new TypeError('pageUrl must not contain a query or fragment.');
  const pagePath = new URL(pageUrl).pathname;
  if (!pagePath.endsWith('/support-project.html') || pagePath.endsWith('/zh/support-project.html')) {
    throw new TypeError('pageUrl must point to the generated English support-project.html page.');
  }
  validateHttpsUrl(wechatQrUrl, 'wechatQrUrl', true);
  validateHttpsUrl(alipayQrUrl, 'alipayQrUrl', true);
  if (enabled && !wechatQrUrl && !alipayQrUrl) {
    throw new TypeError('Enabled project support requires at least one public channel URL.');
  }
  return { enabled, pageUrl, wechatQrUrl, alipayQrUrl };
}

/** Return an optional localized external link; malformed settings fail closed. */
export function getProjectSupportUrl(input, locale = 'en') {
  if (locale !== 'en' && locale !== 'zh-CN') return null;
  try {
    const config = parseProjectSupportConfig(input);
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
