import type { LearningChapter } from './learningState';
import { getReleaseNotes } from './releaseCatalog';

export type ReleaseEducation = { version: string; level: 'notes' | 'feature-tour'; chapters: LearningChapter[] };
export type ReleaseNotice = {
  version: string;
  unread: boolean;
  invitationChapter: LearningChapter | null;
  expiresAt?: number;
  featureChapters?: LearningChapter[];
};
type StoredRelease = ReleaseEducation & {
  firstSeenAt: number;
  notesRead: boolean;
  invitationDismissed: boolean;
  invitationClaimed: boolean;
  usedChapters: LearningChapter[];
};

export const RELEASE_EDUCATION_STORAGE_KEY = 'bookmark-atlas:release-education:v1';
const localEvent = 'bookmark-atlas:release-education-changed';
const unreadLifetime = 7 * 24 * 60 * 60 * 1000;
const chapters: LearningChapter[] = ['basics', 'capture', 'ai'];
let queue: Promise<unknown> = Promise.resolve();

/** Education weight is bundled release metadata, never inferred from semver. */
export function getReleaseEducation(version: string): ReleaseEducation {
  const education = getReleaseNotes(version)?.education;
  return { version, level: education?.level ?? 'notes', chapters: [...education?.chapters ?? []] };
}

export function recordReleaseEducation(release: ReleaseEducation, now = Date.now()): Promise<void> {
  return update(async (releases) => {
    if (!validDefinition(release) || !Number.isFinite(now) || now < 0) throw new Error('Invalid release education');
    if (!releases.some((item) => item.version === release.version)) {
      releases.push({ ...release, chapters: [...release.chapters], firstSeenAt: now, notesRead: false, invitationDismissed: false, invitationClaimed: false, usedChapters: [] });
      return true;
    }
    return false;
  });
}

export async function readReleaseNotice(version: string, now = Date.now()): Promise<ReleaseNotice> {
  const release = (await readReleases()).find((item) => item.version === version);
  if (!release) return { version, unread: false, invitationChapter: null };
  const unread = !release.notesRead && Number.isFinite(now) && now >= release.firstSeenAt && now - release.firstSeenAt < unreadLifetime;
  const featureChapters = unread ? release.chapters.filter((chapter) => !release.usedChapters.includes(chapter)) : [];
  return {
    version,
    unread,
    invitationChapter: invitation(release),
    ...(unread ? { expiresAt: release.firstSeenAt + unreadLifetime } : {}),
    ...(featureChapters.length > 0 ? { featureChapters } : {}),
  };
}

/** Actual feature use clears that entry's marker independently of release notes. */
export function markReleaseFeatureUsed(version: string, chapter: LearningChapter): Promise<void> {
  return update(async (releases) => {
    const release = releases.find((item) => item.version === version);
    if (!release || !release.chapters.includes(chapter) || release.usedChapters.includes(chapter)) return false;
    release.usedChapters.push(chapter);
    return true;
  });
}

export function markReleaseNotesRead(version: string): Promise<void> {
  return mark(version, 'notesRead');
}

export function dismissReleaseNotice(version: string): Promise<void> {
  return markReleaseNotesRead(version);
}

export function dismissReleaseInvitation(version: string): Promise<void> {
  return mark(version, 'invitationDismissed');
}

/** Claim before displaying so two pages cannot auto-invite the same release. */
export async function claimReleaseInvitation(version: string): Promise<LearningChapter | null> {
  let chapter: LearningChapter | null = null;
  await update(async (releases) => {
    const release = releases.find((item) => item.version === version);
    chapter = release ? invitation(release) : null;
    if (!chapter || !release) return false;
    release.invitationClaimed = true;
    return true;
  });
  return chapter;
}

export function subscribeReleaseEducation(listener: () => void): () => void {
  const storage = globalThis.chrome?.storage?.onChanged;
  const onChrome = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[RELEASE_EDUCATION_STORAGE_KEY]) listener();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === RELEASE_EDUCATION_STORAGE_KEY || event.key === null) listener();
  };
  storage?.addListener(onChrome);
  globalThis.window?.addEventListener(localEvent, listener);
  globalThis.window?.addEventListener('storage', onStorage);
  return () => {
    storage?.removeListener(onChrome);
    globalThis.window?.removeEventListener(localEvent, listener);
    globalThis.window?.removeEventListener('storage', onStorage);
  };
}

function invitation(release: StoredRelease): LearningChapter | null {
  return release.level === 'feature-tour' && !release.invitationDismissed && !release.invitationClaimed
    ? release.chapters[0] ?? null : null;
}

function mark(version: string, key: 'notesRead' | 'invitationDismissed'): Promise<void> {
  return update(async (releases) => {
    const release = releases.find((item) => item.version === version);
    if (!release || release[key]) return false;
    release[key] = true;
    return true;
  });
}

function update(mutate: (releases: StoredRelease[]) => Promise<boolean>): Promise<void> {
  const operation = async () => {
    const releases = await readReleases();
    if (!await mutate(releases)) return;
    if (globalThis.chrome?.storage?.local) await chrome.storage.local.set({ [RELEASE_EDUCATION_STORAGE_KEY]: releases });
    else {
      if (!globalThis.localStorage) throw new Error('Local learning storage is unavailable');
      localStorage.setItem(RELEASE_EDUCATION_STORAGE_KEY, JSON.stringify(releases));
    }
    globalThis.window?.dispatchEvent(new Event(localEvent));
  };
  const run = async (): Promise<void> => globalThis.navigator?.locks
    ? await navigator.locks.request(RELEASE_EDUCATION_STORAGE_KEY, operation) : await operation();
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

async function readReleases(): Promise<StoredRelease[]> {
  let value: unknown;
  if (globalThis.chrome?.storage?.local) value = (await chrome.storage.local.get(RELEASE_EDUCATION_STORAGE_KEY))[RELEASE_EDUCATION_STORAGE_KEY];
  else {
    if (!globalThis.localStorage) throw new Error('Local learning storage is unavailable');
    const raw = localStorage.getItem(RELEASE_EDUCATION_STORAGE_KEY);
    if (!raw) return [];
    try { value = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is StoredRelease => {
    if (!item || typeof item !== 'object') return false;
    const { version, level, chapters: releaseChapters, firstSeenAt, notesRead, invitationDismissed, invitationClaimed, usedChapters } = item;
    return validDefinition({ version, level, chapters: releaseChapters })
      && Number.isFinite(firstSeenAt) && firstSeenAt >= 0 && typeof notesRead === 'boolean'
      && typeof invitationDismissed === 'boolean' && typeof invitationClaimed === 'boolean'
      && (usedChapters === undefined || (Array.isArray(usedChapters) && usedChapters.every((chapter) => chapters.includes(chapter))));
  }).map(({ version, level, chapters: releaseChapters, firstSeenAt, notesRead, invitationDismissed, invitationClaimed, usedChapters }) => ({
    version, level, chapters: [...releaseChapters], firstSeenAt, notesRead, invitationDismissed, invitationClaimed,
    usedChapters: [...new Set((usedChapters ?? []).filter((chapter) => releaseChapters.includes(chapter)))],
  }));
}

function validDefinition(value: unknown): value is ReleaseEducation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const release = value as ReleaseEducation;
  return Object.keys(release).every((key) => ['version', 'level', 'chapters'].includes(key))
    && typeof release.version === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,63}$/.test(release.version)
    && (release.level === 'notes' || release.level === 'feature-tour')
    && Array.isArray(release.chapters) && release.chapters.every((chapter) => chapters.includes(chapter))
    && new Set(release.chapters).size === release.chapters.length
    && (release.level !== 'feature-tour' || release.chapters.length > 0);
}
