import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RELEASE_EDUCATION_STORAGE_KEY, claimReleaseInvitation, dismissReleaseInvitation, dismissReleaseNotice,
  getReleaseEducation, markReleaseFeatureUsed, markReleaseNotesRead, readReleaseNotice, recordReleaseEducation, subscribeReleaseEducation,
} from './releaseEducation';

describe('release education policy', () => {
  beforeEach(() => { localStorage.clear(); vi.stubGlobal('chrome', undefined); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('keeps bundled and unknown semver releases as quiet notes unless explicitly classified', async () => {
    expect(getReleaseEducation('0.9.5')).toMatchObject({ level: 'notes' });
    expect(getReleaseEducation('99.0.0')).toEqual({ version: '99.0.0', level: 'notes', chapters: [] });
    await recordReleaseEducation(getReleaseEducation('99.0.0'), 1000);
    expect(await readReleaseNotice('99.0.0', 1000)).toMatchObject({ version: '99.0.0', unread: true, invitationChapter: null });
    expect(await claimReleaseInvitation('99.0.0')).toBeNull();
  });

  it('expires unread exactly seven days after first discovery without renewing on refresh', async () => {
    await recordReleaseEducation({ version: '1.2.0', level: 'notes', chapters: ['capture'] }, 1000);
    await recordReleaseEducation({ version: '1.2.0', level: 'notes', chapters: ['capture'] }, 2000);
    expect((await readReleaseNotice('1.2.0', 604_800_999)).unread).toBe(true);
    expect((await readReleaseNotice('1.2.0', 604_801_000)).unread).toBe(false);
  });

  it('exposes the original unread deadline so an open page can clear its marker exactly at expiry', async () => {
    await recordReleaseEducation({ version: '1.2.0', level: 'notes', chapters: [] }, 1000);
    await recordReleaseEducation({ version: '1.2.0', level: 'notes', chapters: [] }, 2000);
    expect(await readReleaseNotice('1.2.0', 604_800_999)).toEqual({
      version: '1.2.0', unread: true, invitationChapter: null, expiresAt: 604_801_000,
    });
    expect(await readReleaseNotice('1.2.0', 604_801_000)).toEqual({ version: '1.2.0', unread: false, invitationChapter: null });
    expect(await readReleaseNotice('unknown', 1000)).not.toHaveProperty('expiresAt');
    await markReleaseNotesRead('1.2.0');
    expect(await readReleaseNotice('1.2.0', 2000)).not.toHaveProperty('expiresAt');
  });

  it('clears only the used feature while keeping notes unread and tutorial state intact', async () => {
    localStorage.setItem('bookmark-atlas:learning-progress:v1', 'tutorial sentinel');
    await recordReleaseEducation({ version: '1.2.0', level: 'notes', chapters: ['ai', 'capture'] }, 1000);
    expect(await readReleaseNotice('1.2.0', 2000)).toMatchObject({ unread: true, featureChapters: ['ai', 'capture'] });
    await markReleaseFeatureUsed('1.2.0', 'ai');
    expect(await readReleaseNotice('1.2.0', 2000)).toMatchObject({
      unread: true, featureChapters: ['capture'], invitationChapter: null, expiresAt: 604_801_000,
    });
    expect(localStorage.getItem('bookmark-atlas:learning-progress:v1')).toBe('tutorial sentinel');
    await markReleaseFeatureUsed('1.2.0', 'capture');
    expect(await readReleaseNotice('1.2.0', 2000)).not.toHaveProperty('featureChapters');
    expect((await readReleaseNotice('1.2.0', 2000)).unread).toBe(true);
  });

  it('hides all feature markers after notes are read or exactly at expiry and has none for plain notes', async () => {
    await recordReleaseEducation({ version: '1.2.0', level: 'notes', chapters: ['ai', 'capture'] }, 1000);
    expect(await readReleaseNotice('1.2.0', 604_800_999)).toHaveProperty('featureChapters', ['ai', 'capture']);
    expect(await readReleaseNotice('1.2.0', 604_801_000)).not.toHaveProperty('featureChapters');
    await markReleaseNotesRead('1.2.0');
    expect(await readReleaseNotice('1.2.0', 2000)).not.toHaveProperty('featureChapters');
    await recordReleaseEducation({ version: '1.2.1', level: 'notes', chapters: [] }, 1000);
    expect(await readReleaseNotice('1.2.1', 2000)).not.toHaveProperty('featureChapters');
  });

  it('records a feature once without dismissing a heavy invitation and ignores invalid or unrelated chapters', async () => {
    await recordReleaseEducation({ version: '1.2.0', level: 'feature-tour', chapters: ['ai'] });
    const writes = vi.spyOn(localStorage, 'setItem');
    await markReleaseFeatureUsed('1.2.0', 'ai');
    expect(await readReleaseNotice('1.2.0')).toMatchObject({ unread: true, invitationChapter: 'ai' });
    await markReleaseFeatureUsed('1.2.0', 'ai');
    await markReleaseFeatureUsed('1.2.0', 'capture');
    await markReleaseFeatureUsed('1.2.0', 'invalid' as never);
    await markReleaseFeatureUsed('unknown', 'ai');
    expect(writes).toHaveBeenCalledTimes(1);
  });

  it('validates stored used chapters and clips them to the release definition without losing older records', async () => {
    const record = {
      version: '1.2.0', level: 'notes', chapters: ['ai'], firstSeenAt: 1000,
      notesRead: false, invitationDismissed: false, invitationClaimed: false,
    };
    localStorage.setItem(RELEASE_EDUCATION_STORAGE_KEY, JSON.stringify([record]));
    expect(await readReleaseNotice('1.2.0', 2000)).toHaveProperty('featureChapters', ['ai']);
    localStorage.setItem(RELEASE_EDUCATION_STORAGE_KEY, JSON.stringify([{ ...record, usedChapters: ['ai', 'capture', 'ai'] }]));
    expect(await readReleaseNotice('1.2.0', 2000)).not.toHaveProperty('featureChapters');
    await markReleaseNotesRead('1.2.0');
    expect(JSON.parse(localStorage.getItem(RELEASE_EDUCATION_STORAGE_KEY)!)[0].usedChapters).toEqual(['ai']);
    for (const usedChapters of [['private'], 'ai', [null]]) {
      localStorage.setItem(RELEASE_EDUCATION_STORAGE_KEY, JSON.stringify([{ ...record, usedChapters }]));
      expect(await readReleaseNotice('1.2.0', 2000)).toEqual({ version: '1.2.0', unread: false, invitationChapter: null });
    }
  });

  it('reading notes does not dismiss the explicit feature invitation', async () => {
    await recordReleaseEducation({ version: '1.0.0', level: 'feature-tour', chapters: ['ai'] });
    await markReleaseNotesRead('1.0.0');
    expect(await readReleaseNotice('1.0.0')).toEqual({ version: '1.0.0', unread: false, invitationChapter: 'ai' });
    expect(await claimReleaseInvitation('1.0.0')).toBe('ai');
    expect(await claimReleaseInvitation('1.0.0')).toBeNull();
    expect((await readReleaseNotice('1.0.0')).invitationChapter).toBeNull();
  });

  it('dismisses an invitation per version independently from notes and future versions', async () => {
    await recordReleaseEducation({ version: '1.0.0', level: 'feature-tour', chapters: ['capture'] });
    await dismissReleaseInvitation('1.0.0');
    expect(await readReleaseNotice('1.0.0')).toMatchObject({ version: '1.0.0', unread: true, invitationChapter: null });
    await recordReleaseEducation({ version: '1.1.0', level: 'feature-tour', chapters: ['ai'] });
    await dismissReleaseNotice('1.1.0');
    expect(await readReleaseNotice('1.1.0')).toEqual({ version: '1.1.0', unread: false, invitationChapter: 'ai' });
    expect(await readReleaseNotice('1.0.0')).toMatchObject({ invitationChapter: null });
  });

  it('claims an invitation once for competing callers', async () => {
    await recordReleaseEducation({ version: '1.0.0', level: 'feature-tour', chapters: ['ai'] });
    expect(await Promise.all([claimReleaseInvitation('1.0.0'), claimReleaseInvitation('1.0.0')])).toEqual(['ai', null]);
  });

  it('claims an invitation once across document instances using the shared Web Lock', async () => {
    let lockQueue: Promise<unknown> = Promise.resolve();
    vi.stubGlobal('navigator', { locks: { request: (_name: string, run: () => Promise<unknown>) => {
      const result = lockQueue.then(run, run); lockQueue = result.catch(() => undefined); return result;
    } } });
    vi.resetModules();
    const anotherDocument = await import('./releaseEducation');
    await recordReleaseEducation({ version: '1.0.0', level: 'feature-tour', chapters: ['ai'] });
    expect(await Promise.all([claimReleaseInvitation('1.0.0'), anotherDocument.claimReleaseInvitation('1.0.0')])).toEqual(['ai', null]);
  });

  it('keeps expired notes independent of a pending explicit invitation and tutorial progress', async () => {
    localStorage.setItem('bookmark-atlas:learning-progress:v1', 'tutorial sentinel');
    await recordReleaseEducation({ version: '1.0.0', level: 'feature-tour', chapters: ['ai'] }, 1000);
    expect(await readReleaseNotice('1.0.0', 604_801_000)).toEqual({ version: '1.0.0', unread: false, invitationChapter: 'ai' });
    await markReleaseNotesRead('1.0.0');
    await dismissReleaseInvitation('1.0.0');
    expect(localStorage.getItem('bookmark-atlas:learning-progress:v1')).toBe('tutorial sentinel');
  });

  it('notifies the writer and other Chrome documents and releases its listeners', async () => {
    const handlers = new Set<(changes: Record<string, unknown>, area: string) => void>();
    const memory = new Map<string, unknown>();
    vi.stubGlobal('chrome', { storage: { local: {
      get: async (key: string) => ({ [key]: memory.get(key) }),
      set: async (items: Record<string, unknown>) => { Object.entries(items).forEach(([key, value]) => memory.set(key, structuredClone(value))); },
    }, onChanged: { addListener: (handler: typeof handlers extends Set<infer H> ? H : never) => handlers.add(handler), removeListener: (handler: typeof handlers extends Set<infer H> ? H : never) => handlers.delete(handler) } } });
    const listener = vi.fn(); const unsubscribe = subscribeReleaseEducation(listener);
    await recordReleaseEducation({ version: '1.0.0', level: 'notes', chapters: [] });
    handlers.forEach((handler) => handler({ [RELEASE_EDUCATION_STORAGE_KEY]: {} }, 'local'));
    handlers.forEach((handler) => handler({ [RELEASE_EDUCATION_STORAGE_KEY]: {} }, 'sync'));
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    expect(handlers.size).toBe(0);
  });

  it('ignores malformed stored notices and rejects private or invalid release definitions', async () => {
    localStorage.setItem(RELEASE_EDUCATION_STORAGE_KEY, JSON.stringify({ releases: { '1.0.0': { level: 'feature-tour', chapters: ['secret'], firstSeenAt: 0 } } }));
    expect(await readReleaseNotice('1.0.0')).toEqual({ version: '1.0.0', unread: false, invitationChapter: null });
    await expect(recordReleaseEducation({ version: '2.0.0', level: 'feature-tour', chapters: [] })).rejects.toThrow();
    await expect(recordReleaseEducation({ version: '2.0.0', level: 'notes', chapters: [], prompt: 'secret' } as never)).rejects.toThrow();
  });

  it('notifies same document and browser tabs but never reports a rejected write as read', async () => {
    await recordReleaseEducation({ version: '0.9.5', level: 'notes', chapters: [] });
    const listener = vi.fn(); const unsubscribe = subscribeReleaseEducation(listener);
    vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
    await expect(markReleaseNotesRead('0.9.5')).rejects.toThrow('quota');
    expect((await readReleaseNotice('0.9.5')).unread).toBe(true);
    expect(listener).not.toHaveBeenCalled();
    await markReleaseNotesRead('0.9.5');
    window.dispatchEvent(new StorageEvent('storage', { key: RELEASE_EDUCATION_STORAGE_KEY }));
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    window.dispatchEvent(new StorageEvent('storage', { key: RELEASE_EDUCATION_STORAGE_KEY }));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
