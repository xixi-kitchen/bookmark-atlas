import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureYoutubeEmbedIdentityRule } from './youtubeIdentity';

const originalChrome = globalThis.chrome;

afterEach(() => {
  Object.defineProperty(globalThis, 'chrome', { value: originalChrome, configurable: true });
});

describe('YouTube embed identity rule', () => {
  it('limits the Referer rule to YouTube embeds initiated by this extension', async () => {
    const updateDynamicRules = vi.fn(async () => undefined);
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        runtime: { id: 'bookmark-atlas-extension' },
        declarativeNetRequest: { updateDynamicRules },
      },
    });

    await ensureYoutubeEmbedIdentityRule();

    expect(updateDynamicRules).toHaveBeenCalledWith(expect.objectContaining({
      addRules: [expect.objectContaining({
        action: expect.objectContaining({
          requestHeaders: [{ header: 'Referer', operation: 'set', value: 'https://bookmark-atlas.invalid/' }],
        }),
        condition: expect.objectContaining({
          initiatorDomains: ['bookmark-atlas-extension'],
          requestDomains: ['www.youtube.com'],
          resourceTypes: ['sub_frame'],
        }),
      })],
    }));
  });
});
