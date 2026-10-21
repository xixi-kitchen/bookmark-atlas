import { describe, expect, it } from 'vitest';
import { validateReleaseNotes } from './validate-release-notes.mjs';

const text = { en: 'Useful release text', 'zh-CN': '实用版本说明' };
function entry(version = '1.2.3') {
  return {
    version, date: '2026-10-20', title: { ...text }, summary: { ...text },
    sections: [{ type: 'added', items: [{ title: { ...text }, description: { ...text }, where: { ...text } }] }],
    gettingStarted: [{ ...text }], notices: [{ ...text }], education: { level: 'notes', chapters: [] },
  };
}

describe('release notes release gate', () => {
  it('accepts every supported change category and both explicit education levels', () => {
    const release = entry();
    release.sections = ['added', 'changed', 'fixed', 'security', 'deprecated', 'removed']
      .map((type) => ({ type, items: [{ title: { ...text }, description: { ...text } }] }));
    expect(() => validateReleaseNotes([release, entry('1.2.2')], '1.2.3')).not.toThrow();
    release.education = { level: 'feature-tour', chapters: ['basics', 'capture', 'ai'] };
    expect(() => validateReleaseNotes([release], '1.2.3')).not.toThrow();
  });

  it('requires a catalogue entry for the package version, never a fallback release', () => {
    expect(() => validateReleaseNotes([entry()], '1.2.4')).toThrow(/1\.2\.4/);
    expect(() => validateReleaseNotes([], '1.2.3')).toThrow();
    expect(() => validateReleaseNotes({}, '1.2.3')).toThrow();
  });

  it.each(['01.2.3', '1.2', 'v1.2.3', '1.2.3-beta.1', '1.2.3+build', '1.2.03'])('rejects non-stable or noncanonical semver %s', (version) => {
    expect(() => validateReleaseNotes([entry(version)], version)).toThrow(/version/i);
  });

  it('rejects duplicate version identities', () => {
    expect(() => validateReleaseNotes([entry(), entry()], '1.2.3')).toThrow(/duplicate/i);
  });

  it.each(['2026-02-29', '2026-04-31', '2026-13-01', '2026-10-00', '2026-1-01', '20 October 2026'])('rejects impossible or non-ISO release date %s', (date) => {
    expect(() => validateReleaseNotes([{ ...entry(), date }], '1.2.3')).toThrow(/date/i);
  });

  it.each(['title', 'summary', 'gettingStarted', 'notices'])('rejects missing bilingual %s', (key) => {
    const release = entry();
    release[key] = ['gettingStarted', 'notices'].includes(key) ? [{ en: 'English only' }] : { en: 'English only' };
    expect(() => validateReleaseNotes([release], '1.2.3')).toThrow(new RegExp(key));
  });

  it.each(['gettingStarted', 'notices', 'sections'])('rejects empty %s', (key) => {
    expect(() => validateReleaseNotes([{ ...entry(), [key]: [] }], '1.2.3')).toThrow(new RegExp(key));
  });

  it.each(['title', 'description', 'where'])('rejects empty item %s translations', (key) => {
    const release = entry();
    release.sections[0].items[0][key] = { en: '   ', 'zh-CN': '中文' };
    expect(() => validateReleaseNotes([release], '1.2.3')).toThrow(new RegExp(key));
  });

  it('rejects unknown or repeated categories and empty item lists', () => {
    for (const sections of [
      [{ type: 'other', items: entry().sections[0].items }],
      [entry().sections[0], entry().sections[0]],
      [{ type: 'fixed', items: [] }],
    ]) expect(() => validateReleaseNotes([{ ...entry(), sections }], '1.2.3')).toThrow(/sections/i);
  });

  it.each([
    undefined, { chapters: [] }, { level: 'automatic', chapters: [] },
    { level: 'notes' }, { level: 'feature-tour', chapters: [] },
    { level: 'notes', chapters: ['private'] }, { level: 'notes', chapters: ['ai', 'ai'] },
  ])('requires explicit valid education metadata: %j', (education) => {
    expect(() => validateReleaseNotes([{ ...entry(), education }], '1.2.3')).toThrow(/education/i);
  });
});
