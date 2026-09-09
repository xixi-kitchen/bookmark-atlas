import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completeOnboarding,
  dismissWhatsNew,
  getGuideStartup,
  readOnboardingState,
  recordInstallationEvent,
  skipOnboarding,
  subscribeToGuideState,
} from './onboardingState';

const originalChrome = globalThis.chrome;

describe('onboarding state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(globalThis, 'chrome', { value: originalChrome, configurable: true });
  });

  it('marks first install for a pending optional guide', async () => {
    await recordInstallationEvent({ reason: 'install', version: '1.0.0' });

    expect(await getGuideStartup('1.0.0')).toEqual({ surface: 'onboarding', source: 'pending' });

    await completeOnboarding();
    expect(await getGuideStartup('1.0.0')).toBeNull();
  });

  it('does not force onboarding for existing installs on update', async () => {
    await recordInstallationEvent({ reason: 'update', previousVersion: '0.9.1', version: '0.9.2' });

    expect(await getGuideStartup('0.9.2')).toEqual({ surface: 'whats-new', source: 'pending' });
    expect((await readOnboardingState()).pendingOnboarding).toBe(false);

    await dismissWhatsNew('0.9.2');
    expect(await getGuideStartup('0.9.2')).toBeNull();
  });

  it('respects skipped onboarding', async () => {
    await recordInstallationEvent({ reason: 'install', version: '1.0.0' });
    await skipOnboarding();
    await recordInstallationEvent({ reason: 'install', version: '1.0.0' });

    expect(await getGuideStartup('1.0.0')).toBeNull();
  });

  it('uses chrome.storage.local when available', async () => {
    const memory = new Map<string, unknown>();
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: memory.get(key) })),
          set: vi.fn(async (value: Record<string, unknown>) => {
            Object.entries(value).forEach(([key, item]) => memory.set(key, item));
          }),
        },
      },
    });

    await recordInstallationEvent({ reason: 'install', version: '1.0.0' });

    expect(await getGuideStartup('1.0.0')).toEqual({ surface: 'onboarding', source: 'pending' });
  });

  it('notifies the active page when the local fallback state changes', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToGuideState(listener);

    await recordInstallationEvent({ reason: 'install', version: '1.0.0' });

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
