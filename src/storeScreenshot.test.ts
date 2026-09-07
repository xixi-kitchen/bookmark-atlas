import { describe, expect, it } from 'vitest';
import { isStoreScreenshotMode } from './storeScreenshot';

describe('store screenshot mode', () => {
  it('is available for local preview URLs', () => {
    expect(isStoreScreenshotMode({
      protocol: 'http:',
      search: '?store-screenshot&lang=zh-CN',
    })).toBe(true);
  });

  it('never activates inside the installed extension', () => {
    expect(isStoreScreenshotMode({
      protocol: 'chrome-extension:',
      search: '?store-screenshot&lang=zh-CN',
    })).toBe(false);
  });
});
