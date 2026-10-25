import { describe, expect, it } from 'vitest';
import { getProjectSupportUrl, parseProjectSupportConfig } from './config.mjs';

const disabled = {
  enabled: false,
  pageUrl: 'https://support.example/project/support-project.html',
  wechatQrUrl: '',
  alipayQrUrl: '',
};
const enabled = { ...disabled, enabled: true, wechatQrUrl: 'https://assets.example/synthetic-wechat.png' };

describe('project support configuration', () => {
  it('hides disabled support even when valid channel destinations are retained', () => {
    expect(getProjectSupportUrl(disabled)).toBeNull();
    expect(getProjectSupportUrl({ ...enabled, enabled: false })).toBeNull();
    expect(getProjectSupportUrl({ ...enabled, enabled: false }, 'zh-CN')).toBeNull();
  });

  it('returns an independent four-field object for valid optional channels', () => {
    const parsed = parseProjectSupportConfig(enabled);
    expect(parsed).toEqual(enabled);
    expect(parsed).not.toBe(enabled);
    expect(parseProjectSupportConfig({ ...disabled, enabled: true, alipayQrUrl: 'https://assets.example/synthetic-alipay.png' }))
      .toEqual({ ...disabled, enabled: true, alipayQrUrl: 'https://assets.example/synthetic-alipay.png' });
    expect(parseProjectSupportConfig({ ...enabled, alipayQrUrl: 'https://assets.example/synthetic-alipay.png?size=original' }))
      .toHaveProperty('alipayQrUrl', 'https://assets.example/synthetic-alipay.png?size=original');
  });

  it.each([null, undefined, [], true, '', {}, { ...disabled, enabled: 'true' },
    { ...disabled, enabled: 1 }, { ...disabled, enabled: null },
    { ...disabled, pageUrl: null }, { ...disabled, wechatQrUrl: null },
    { ...disabled, alipayQrUrl: false }, { ...disabled, extra: true },
    { enabled: false, pageUrl: disabled.pageUrl, wechatQrUrl: '' },
    { ...disabled, enabled: true }])('rejects malformed configuration %#', (input) => {
    expect(() => parseProjectSupportConfig(input)).toThrow();
    expect(getProjectSupportUrl(input)).toBeNull();
  });

  it.each([
    '', 'http://assets.example/synthetic.png', 'file:///private/synthetic.png',
    'data:image/png;base64,c3ludGhldGlj', 'javascript:alert(1)',
    'output/private-support-assets/synthetic.png', '/private/synthetic.png',
    '//assets.example/synthetic.png', 'https://user:secret@assets.example/synthetic.png',
    'https://user@assets.example/synthetic.png', ' https://assets.example/synthetic.png',
    'https://assets.example/synthetic.png\n', 'https:\\assets.example\\synthetic.png',
    'https:assets.example/synthetic.png', 'https://assets.example/\tsynthetic.png',
  ])('rejects unsafe page destinations %#', (pageUrl) => {
    expect(() => parseProjectSupportConfig({ ...disabled, pageUrl })).toThrow();
    expect(getProjectSupportUrl({ ...enabled, pageUrl })).toBeNull();
  });

  it.each(['http://assets.example/synthetic.png', 'file:///private/synthetic.png',
    'data:image/png;base64,c3ludGhldGlj', 'javascript:alert(1)',
    'output/private-support-assets/synthetic.png', '/private/synthetic.png',
    'https://user:secret@assets.example/synthetic.png', 'https://user@assets.example/synthetic.png',
    ' https://assets.example/synthetic.png', 'https://assets.example/synthetic.png\n'])
  ('rejects unsafe channel destinations even while disabled %#', (url) => {
    for (const key of ['wechatQrUrl', 'alipayQrUrl']) {
      expect(() => parseProjectSupportConfig({ ...disabled, [key]: url })).toThrow();
      expect(getProjectSupportUrl({ ...enabled, [key]: url })).toBeNull();
    }
  });

  it.each(['?recipient=synthetic', '#synthetic', '?', '#'])('rejects page query and fragment suffixes %s', (suffix) => {
    expect(() => parseProjectSupportConfig({ ...enabled, pageUrl: disabled.pageUrl + suffix })).toThrow();
    expect(getProjectSupportUrl({ ...enabled, pageUrl: disabled.pageUrl + suffix }, 'zh-CN')).toBeNull();
  });

  it('maps English and Chinese pages within the configured page directory', () => {
    expect(getProjectSupportUrl(enabled)).toBe('https://support.example/project/support-project.html');
    expect(getProjectSupportUrl(enabled, 'en')).toBe('https://support.example/project/support-project.html');
    expect(getProjectSupportUrl(enabled, 'zh-CN')).toBe('https://support.example/project/zh/support-project.html');
    expect(getProjectSupportUrl({ ...enabled, pageUrl: 'https://support.example/nested/site/support-project.html' }, 'zh-CN'))
      .toBe('https://support.example/nested/site/zh/support-project.html');
  });

  it.each(['https://support.example/project/', 'https://support.example/project/custom.html',
    'https://support.example/project/zh/support-project.html'])
  ('rejects a page outside the generated English canonical filename %#', (pageUrl) => {
    expect(() => parseProjectSupportConfig({ ...enabled, pageUrl })).toThrow();
    expect(getProjectSupportUrl({ ...enabled, pageUrl }, 'zh-CN')).toBeNull();
  });

  it.each(['zh', 'zh_CN', 'en-US', '', 'fr', null, 1])('fails closed for unsupported locale %#', (locale) => {
    expect(getProjectSupportUrl(enabled, locale as string)).toBeNull();
  });

  it('hides retained public URLs when the maintainer turns support off', () => {
    expect(getProjectSupportUrl({ ...enabled, enabled: false }, 'en')).toBeNull();
    expect(getProjectSupportUrl({ ...enabled, enabled: false }, 'zh-CN')).toBeNull();
  });
});
