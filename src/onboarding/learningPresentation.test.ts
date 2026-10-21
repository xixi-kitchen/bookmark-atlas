import { afterEach, describe, expect, it, vi } from 'vitest';
import { acquireLearningPresentation } from './learningPresentation';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('learning presentation ownership', () => {
  it('allows only one active presentation and releases it for another tab', async () => {
    const first = await acquireLearningPresentation();
    expect(first).not.toBeNull();
    expect(await acquireLearningPresentation()).toBeNull();
    first?.();
    const next = await acquireLearningPresentation();
    expect(next).not.toBeNull();
    next?.();
  });

  it('does not present when another tab owns the browser lock', async () => {
    vi.stubGlobal('navigator', { locks: {
      request: async (_name: string, _options: unknown, callback: (lock: null) => unknown) => callback(null),
    } });
    expect(await acquireLearningPresentation()).toBeNull();
  });
});
