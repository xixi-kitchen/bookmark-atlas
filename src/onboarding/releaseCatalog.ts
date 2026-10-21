import catalogue from './releaseNotes.json';
import type { LearningChapter } from './learningState';

export type Localized = { en: string; 'zh-CN': string };
export type ReleaseChapter = LearningChapter;
export type ReleaseNotesEntry = {
  version: string;
  date: string;
  title: Localized;
  summary: Localized;
  sections: {
    type: 'added' | 'changed' | 'fixed' | 'security' | 'deprecated' | 'removed';
    items: { title: Localized; description: Localized; where?: Localized }[];
  }[];
  gettingStarted: Localized[];
  notices: Localized[];
  education: { level: 'notes' | 'feature-tour'; chapters: LearningChapter[] };
};

// The release gate validates this bundled JSON against the catalogue contract.
const history: readonly ReleaseNotesEntry[] = (catalogue as ReleaseNotesEntry[]).slice().sort((a, b) => {
  const byDate = b.date.localeCompare(a.date);
  if (byDate) return byDate;
  const left = a.version.split('.').map(Number);
  const right = b.version.split('.').map(Number);
  return right[0]! - left[0]! || right[1]! - left[1]! || right[2]! - left[2]!;
});

export function getReleaseNotes(version: string): ReleaseNotesEntry | undefined {
  return history.find((release) => release.version === version);
}

export function getReleaseHistory(): readonly ReleaseNotesEntry[] {
  return history;
}
