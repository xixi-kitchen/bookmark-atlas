import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguagePreference } from '../i18n/languagePreference';
import { SettingsMenu } from './SettingsMenu';

// Only the build-time data is replaceable; SettingsMenu, CommunityLinks and the
// shared parser/helper remain real so unsafe settings must fail at the UI edge.
const fixture = vi.hoisted(() => ({
  enabled: true as unknown,
  pageUrl: 'https://support.example/project/support-project.html',
  wechatQrUrl: 'https://assets.example/synthetic-wechat.png',
  alipayQrUrl: '',
}));
vi.mock('../support/support.config.json', () => ({ default: fixture }));

beforeEach(async () => {
  fixture.enabled = true;
  fixture.pageUrl = 'https://support.example/project/support-project.html';
  fixture.wechatQrUrl = 'https://assets.example/synthetic-wechat.png';
  fixture.alipayQrUrl = '';
  await setLanguagePreference('en');
});

afterEach(() => {
  cleanup();
  fixture.enabled = false;
  fixture.pageUrl = 'https://support.example/project/support-project.html';
  fixture.wechatQrUrl = '';
  fixture.alipayQrUrl = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderHelp() {
  render(<SettingsMenu version="0.9.6" onManageEngines={() => undefined}
    onOpenGuide={() => undefined} onWhatsNew={() => undefined} />);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  return screen.getByRole('region', { name: 'Help' });
}

describe('optional project support in Settings Help', () => {
  it('adds a safe ordinary external link only after maintainer configuration', () => {
    const help = renderHelp();
    expect(within(help).getAllByRole('link')).toHaveLength(4);
    const link = within(help).getByRole('link', { name: 'Support this project' });
    expect(link).toHaveAttribute('href', 'https://support.example/project/support-project.html');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(help).getByRole('link', { name: 'Web embed guide' })).toBeInTheDocument();
    expect(within(help).getByRole('link', { name: 'Star on GitHub' })).toBeInTheDocument();
    expect(within(help).getByRole('link', { name: 'Report an issue / request site support' })).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText(/synthetic-wechat/)).not.toBeInTheDocument();
  });

  it('updates the support label and destination with the real settings language selector', async () => {
    renderHelp();
    fireEvent.change(screen.getByRole('combobox', { name: 'Language / 语言' }), { target: { value: 'zh-CN' } });
    await waitFor(() => expect(screen.getByRole('link', { name: '支持项目' }))
      .toHaveAttribute('href', 'https://support.example/project/zh/support-project.html'));
    expect(screen.queryByRole('link', { name: 'Support this project' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Language / 语言' }), { target: { value: 'en' } });
    await waitFor(() => expect(screen.getByRole('link', { name: 'Support this project' }))
      .toHaveAttribute('href', 'https://support.example/project/support-project.html'));
  });

  it('hides retained channel URLs when disabled and preserves the existing three links', () => {
    fixture.enabled = false;
    const help = renderHelp();
    expect(within(help).getAllByRole('link')).toHaveLength(3);
    expect(within(help).queryByRole('link', { name: /Support this project/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it.each([
    { enabled: 'true' },
    { pageUrl: 'https://user:secret@support.example/project/support-project.html' },
    { pageUrl: 'javascript:alert(1)' },
    { pageUrl: 'https://support.example/project/support-project.html?recipient=synthetic' },
    { wechatQrUrl: '/private/synthetic.png' },
    { wechatQrUrl: '' },
  ])('keeps Settings usable and hides invalid support configuration %#', (change) => {
    Object.assign(fixture, change);
    const help = renderHelp();
    expect(within(help).getAllByRole('link')).toHaveLength(3);
    expect(within(help).queryByRole('link', { name: /Support this project/ })).not.toBeInTheDocument();
  });

  it('makes no request or page opening when settings opens, changes language, or closes', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const fetch = vi.fn();
    const xhrOpen = vi.spyOn(XMLHttpRequest.prototype, 'open');
    vi.stubGlobal('fetch', fetch);
    renderHelp();
    expect(screen.getAllByRole('link')).toHaveLength(4);
    await act(() => setLanguagePreference('zh-CN'));
    fireEvent.keyDown(screen.getByRole('dialog', { name: '设置' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(xhrOpen).not.toHaveBeenCalled();
  });
});
