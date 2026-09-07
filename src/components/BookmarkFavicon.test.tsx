import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookmarkFavicon, buildChromeFaviconUrl } from './BookmarkFavicon';

const originalChrome = globalThis.chrome;

afterEach(() => {
  cleanup();
  Object.defineProperty(globalThis, 'chrome', {
    value: originalChrome,
    configurable: true,
  });
});

describe('BookmarkFavicon', () => {
  it('builds a Chrome MV3 favicon URL with encoded pageUrl and size', () => {
    const getURL = vi.fn((path: string) => `chrome-extension://abc/${path}`);
    installChromeGetURL(getURL);

    const result = buildChromeFaviconUrl('https://example.com/a page?q=1', 32);

    expect(getURL).toHaveBeenCalledWith(
      '_favicon/?pageUrl=https%3A%2F%2Fexample.com%2Fa+page%3Fq%3D1&size=32',
    );
    expect(result).toBe(
      'chrome-extension://abc/_favicon/?pageUrl=https%3A%2F%2Fexample.com%2Fa+page%3Fq%3D1&size=32',
    );
  });

  it('renders the favicon image in a Chrome extension environment', () => {
    installChromeGetURL((path: string) => `chrome-extension://abc/${path}`);

    render(
      <BookmarkFavicon
        node={{ title: 'Example Docs', url: 'https://example.com/docs' }}
        size={20}
      />,
    );

    const icon = screen.getByRole('img', { name: 'Site icon for Example Docs' });
    expect(icon).toHaveAttribute(
      'src',
      'chrome-extension://abc/_favicon/?pageUrl=https%3A%2F%2Fexample.com%2Fdocs&size=20',
    );
    expect(icon).toHaveAttribute('width', '20');
    expect(icon).toHaveAttribute('height', '20');
  });

  it('falls back to a hostname initial outside Chrome extension runtime', () => {
    installChromeGetURL(undefined);

    render(<BookmarkFavicon title="Example Docs" url="https://docs.example.com" />);

    expect(screen.getByRole('img', { name: 'Site icon for Example Docs' })).toHaveTextContent('D');
  });

  it('falls back when the favicon image fails to load', () => {
    installChromeGetURL((path: string) => `chrome-extension://abc/${path}`);

    render(<BookmarkFavicon title="Example Docs" url="https://example.com/docs" />);

    fireEvent.error(screen.getByRole('img', { name: 'Site icon for Example Docs' }));

    expect(screen.getByRole('img', { name: 'Site icon for Example Docs' })).toHaveTextContent('E');
  });
});

function installChromeGetURL(getURL: ((path: string) => string) | undefined) {
  Object.defineProperty(globalThis, 'chrome', {
    value: getURL ? { runtime: { getURL } } : undefined,
    configurable: true,
  });
}
