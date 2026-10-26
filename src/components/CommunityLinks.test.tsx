import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguagePreference } from '../i18n/languagePreference';
import { SettingsMenu } from './SettingsMenu';

// Pin this regression's disabled scenario, not the maintainer's editable setting.
// Enabled and malformed settings are exercised by CommunityLinks.support.test.tsx.
vi.mock('../support/support.config.json', () => ({ default: {
  enabled: false,
  pageUrl: 'https://support.example/support-project.html',
  wechatQrUrl: '',
  alipayQrUrl: '',
} }));

beforeEach(async () => {
  await setLanguagePreference('en');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function renderSettings() {
  render(<SettingsMenu version="0.9.6" onManageEngines={() => undefined}
    onOpenGuide={() => undefined} onWhatsNew={() => undefined} />);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  return screen.getByRole('dialog', { name: 'Settings' });
}

describe('settings community links', () => {
  it('uses the Edge-specific guide in each interface language for an Edge build', async () => {
    vi.stubEnv('BROWSER', 'edge');
    renderSettings();
    expect(screen.getByRole('link', { name: 'Web embed guide' }))
      .toHaveAttribute('href', 'https://xixi-kitchen.github.io/bookmark-atlas/edge/guide.html#embeds');
    fireEvent.change(screen.getByRole('combobox', { name: 'Language / 语言' }), { target: { value: 'zh-CN' } });
    await waitFor(() => expect(screen.getByRole('link', { name: '网页嵌入教程' }))
      .toHaveAttribute('href', 'https://xixi-kitchen.github.io/bookmark-atlas/zh/edge/guide.html#embeds'));
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });
  it('keeps three safe external links inside the settings help section', () => {
    const dialog = renderSettings();
    const help = within(dialog).getByRole('region', { name: 'Help' });
    const links = within(help).getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(within(help).getByRole('link', { name: 'Web embed guide' }))
      .toHaveAttribute('href', 'https://xixi-kitchen.github.io/bookmark-atlas/guide.html#embeds');
    expect(within(help).getByRole('link', { name: 'Star on GitHub' }))
      .toHaveAttribute('href', 'https://github.com/xixi-kitchen/bookmark-atlas');
    expect(within(help).getByRole('link', { name: 'Report an issue / request site support' }))
      .toHaveAttribute('href', 'https://github.com/xixi-kitchen/bookmark-atlas/issues/new/choose');
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expect(within(help).getByText(/Bilibili and YouTube/)).toHaveTextContent(/site restrictions may still apply/i);
    expect(within(dialog).queryByText(/sponsor|donate|payment/i)).not.toBeInTheDocument();
  });

  it('switches help labels and the guide destination when the settings language changes', async () => {
    renderSettings();
    fireEvent.change(screen.getByRole('combobox', { name: 'Language / 语言' }), { target: { value: 'zh-CN' } });
    await waitFor(() => expect(screen.getByRole('link', { name: '网页嵌入教程' }))
      .toHaveAttribute('href', 'https://xixi-kitchen.github.io/bookmark-atlas/zh/guide.html#embeds'));
    expect(screen.getByRole('link', { name: '在 GitHub 收藏' })).toHaveAttribute('href', 'https://github.com/xixi-kitchen/bookmark-atlas');
    expect(screen.getByRole('link', { name: '反馈问题 / 申请网站适配' }))
      .toHaveAttribute('href', 'https://github.com/xixi-kitchen/bookmark-atlas/issues/new/choose');
    expect(screen.getByText(/B站和 YouTube/)).toHaveTextContent(/并非所有网站都能嵌入/);
    expect(screen.queryByRole('link', { name: 'Web embed guide' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Language / 语言' }), { target: { value: 'en' } });
    await waitFor(() => expect(screen.getByRole('link', { name: 'Web embed guide' }))
      .toHaveAttribute('href', 'https://xixi-kitchen.github.io/bookmark-atlas/guide.html#embeds'));
  });

  it('does not open pages or request network data when settings or language changes', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    renderSettings();
    expect(screen.getAllByRole('link')).toHaveLength(3);
    await act(() => setLanguagePreference('zh-CN'));
    fireEvent.keyDown(screen.getByRole('dialog', { name: '设置' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
