import { StrictMode, type PropsWithChildren } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLearningController } from './useLearningController';
import { advanceLearning, LEARNING_PROGRESS_STORAGE_KEY, readLearningProgress, startLearning } from './learningState';
import { completeOnboarding, readOnboardingState, recordInstallationEvent, skipOnboarding } from './onboardingState';
import { readReleaseNotice, recordReleaseEducation } from './releaseEducation';
import { acquireLearningPresentation } from './learningPresentation';

const version = '0.9.5';
const strict = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;
// Let storage promises and the resulting React updates settle before asserting
// that a presentation did not open. A null initial state alone proves nothing.
const settle = async () => {
  await act(async () => { await new Promise<void>((resolve) => { window.setTimeout(resolve, 0); }); });
};

beforeEach(() => {
  vi.stubGlobal('chrome', undefined);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('useLearningController storage integration', () => {
  it('offers exactly one first-install guide under StrictMode without starting a lesson', async () => {
    await recordInstallationEvent({ reason: 'install', version });
    const { result } = renderHook(() => [
      useLearningController(version, false),
      useLearningController(version, false),
    ], { wrapper: strict });

    await waitFor(() => expect(result.current.filter((controller) => controller.open)).toHaveLength(1));
    await settle();
    expect(result.current.filter((controller) => controller.open)).toHaveLength(1);
    expect(result.current.every((controller) => controller.invitation === null)).toBe(true);
    expect(await readLearningProgress()).toBeNull();
    expect(await acquireLearningPresentation()).toBeNull();
  });

  it('automatically restores the active chapter at its persisted step', async () => {
    await startLearning('basics');
    await advanceLearning({ type: 'bookmark-added' });
    await advanceLearning({ type: 'bookmark-opened' });
    const persisted = await readLearningProgress();
    expect(persisted?.step).toBe('move');

    const { result } = renderHook(() => useLearningController(version, false));
    await waitFor(() => expect(result.current.open).toBe(true));
    expect(result.current.progress).toEqual(persisted);
    expect(await readLearningProgress()).toEqual(persisted);
  });

  it('keeps paused progress and does not reopen automatically after a reload', async () => {
    await recordInstallationEvent({ reason: 'install', version });
    await startLearning('basics');
    await advanceLearning({ type: 'bookmark-added' });
    const first = renderHook(() => useLearningController(version, false));
    await waitFor(() => expect(first.result.current.open).toBe(true));
    await act(async () => { await first.result.current.pause(); });
    const paused = await readLearningProgress();
    expect(paused).toMatchObject({ step: 'open', status: 'paused' });
    expect(first.result.current.open).toBe(false);
    expect((await readOnboardingState()).pendingOnboarding).toBe(false);
    first.unmount();

    const reloaded = renderHook(() => useLearningController(version, false));
    await waitFor(() => expect(reloaded.result.current.progress).toEqual(paused));
    await settle();
    expect(reloaded.result.current.open).toBe(false);
    expect(await readLearningProgress()).toEqual(paused);
    const release = await acquireLearningPresentation();
    expect(release).not.toBeNull();
    release?.();
  });

  it.each([
    ['completed', completeOnboarding],
    ['skipped', skipOnboarding],
  ] as const)('does not force a new lesson on legacy %s users', async (_state, finish) => {
    await recordInstallationEvent({ reason: 'install', version: '0.9.4' });
    await finish();
    await recordInstallationEvent({ reason: 'update', version, previousVersion: '0.9.4' });
    const { result } = renderHook(() => useLearningController(version, false));
    // The update notice confirms the asynchronous startup read has completed.
    await waitFor(() => expect(result.current.unread).toBe(true));
    await settle();
    expect(result.current.open).toBe(false);
    expect(result.current.invitation).toBeNull();
    expect(await readLearningProgress()).toBeNull();
  });

  it('expires unread release notes while the same page remains open', async () => {
    vi.useFakeTimers();
    const firstSeen = Date.UTC(2026, 9, 1);
    await recordReleaseEducation({ version, level: 'notes', chapters: [] }, firstSeen);
    const notice = await readReleaseNotice(version, firstSeen);
    expect(notice.expiresAt).toBeDefined();
    vi.setSystemTime(notice.expiresAt! - 100);
    const { result } = renderHook(() => useLearningController(version, false));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.unread).toBe(true);

    await act(async () => { await vi.advanceTimersByTimeAsync(99); });
    expect(result.current.unread).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(result.current.unread).toBe(false);
    expect(result.current.open).toBe(false);
  });

  it('releases the visible guide presentation when its owner unmounts', async () => {
    await startLearning('ai');
    const first = renderHook(() => useLearningController(version, false));
    await waitFor(() => expect(first.result.current.open).toBe(true));
    expect(await acquireLearningPresentation()).toBeNull();
    first.unmount();

    const next = renderHook(() => useLearningController(version, false));
    await waitFor(() => expect(next.result.current.open).toBe(true));
    expect(next.result.current.progress).toMatchObject({ chapter: 'ai', step: 'ai-start' });
  });

  it('reports an automatic storage failure without leaking presentation ownership or rejecting unhandled', async () => {
    await startLearning('basics');
    let held = false;
    // Model browser lock availability so the external storage fault occurs
    // specifically while a presentation is owned, without mocking the hook.
    const request = async (name: string, options: LockOptions | LockGrantedCallback<unknown>, callback?: LockGrantedCallback<unknown>) => {
      const lock = { name, mode: 'exclusive' as const };
      if (typeof options === 'function') return options(lock);
      if (held) return callback!(null);
      held = true;
      try { return await callback!(lock); }
      finally { held = false; }
    };
    vi.stubGlobal('navigator', { locks: { request } });
    const getItem = localStorage.getItem;
    vi.spyOn(localStorage, 'getItem').mockImplementation((key) => {
      if (held && key === LEARNING_PROGRESS_STORAGE_KEY) throw new Error('Storage unavailable');
      return getItem.call(localStorage, key);
    });
    const unhandled = vi.fn();
    window.addEventListener('unhandledrejection', unhandled);
    try {
      const { result } = renderHook(() => useLearningController(version, false));
      await waitFor(() => expect(result.current.error).toBe(true));
      await settle();
      expect(result.current.open).toBe(false);
      expect(result.current.invitation).toBeNull();
      const release = await acquireLearningPresentation();
      expect(release).not.toBeNull();
      release?.();
      await settle();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('unhandledrejection', unhandled);
    }
  });
});
