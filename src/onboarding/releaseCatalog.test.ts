import { describe, expect, it, vi } from 'vitest';
import { getReleaseHistory, getReleaseNotes } from './releaseCatalog';

describe('bundled release notes catalogue', () => {
  it('gives the learning update its own introduction without forcing returning users through lessons', () => {
    expect(getReleaseNotes('0.9.6')).toMatchObject({
      version: '0.9.6', date: '2026-10-21',
      education: { level: 'notes', chapters: ['basics'] },
    });
  });
  it('returns the requested release with actionable bilingual details and explicit education', () => {
    const release = getReleaseNotes('0.9.5');
    expect(release).toMatchObject({
      version: '0.9.5', date: '2026-10-20',
      education: { level: 'notes', chapters: ['capture', 'ai'] },
    });
    expect(release?.sections.flatMap((section) => section.items).length).toBeGreaterThanOrEqual(7);
    for (const item of release!.sections.flatMap((section) => section.items)) {
      expect(item.title.en.trim()).not.toBe('');
      expect(item.title['zh-CN'].trim()).not.toBe('');
      expect(item.description.en.trim()).not.toBe('');
      expect(item.description['zh-CN'].trim()).not.toBe('');
      expect(item.where?.en.trim()).toBeTruthy();
      expect(item.where?.['zh-CN'].trim()).toBeTruthy();
    }
  });

  it('does not substitute current release content for an unknown or older release', () => {
    for (const version of ['0.9.4', '1.0.0', 'unknown', '']) expect(getReleaseNotes(version)).toBeUndefined();
    expect(getReleaseHistory().map(({ version }) => version)).toEqual(['0.9.6', '0.9.5']);
  });

  it('orders history by release date, then numeric semver rather than lexical version order', async () => {
    const release = getReleaseNotes('0.9.5')!;
    vi.doMock('./releaseNotes.json', () => ({ default: [
      { ...release, version: '1.9.0', date: '2026-10-20' },
      { ...release, version: '2.0.0', date: '2026-10-19' },
      { ...release, version: '1.0.0', date: '2026-10-21' },
      { ...release, version: '1.10.0', date: '2026-10-20' },
    ] }));
    vi.resetModules();
    try {
      const fixtureCatalogue = await import('./releaseCatalog');
      expect(fixtureCatalogue.getReleaseHistory().map(({ version }) => version))
        .toEqual(['1.0.0', '1.10.0', '1.9.0', '2.0.0']);
    } finally {
      vi.doUnmock('./releaseNotes.json');
      vi.resetModules();
    }
  });
});
