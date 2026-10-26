export type ReleaseStatus = {
  storeVersion: string;
  candidateVersion: string;
  stage: 'preparing' | 'submitted' | 'published';
  preparedAt: string;
  submittedAt: string | null;
  publishedAt: string | null;
};
export type EdgeReleaseStatus = Omit<ReleaseStatus, 'storeVersion'> & {
  browser: 'edge';
  storeVersion: string | null;
  draftId: string | null;
};
export function validateEdgeReleaseStatus(status: unknown): asserts status is EdgeReleaseStatus;
export function validateReleaseStatus(status: unknown): asserts status is ReleaseStatus;
export function formatReleaseStatus(status: ReleaseStatus, locale: 'en' | 'zh-CN'): string;
export function renderPublicReleases(entries: unknown, status: ReleaseStatus, locale?: 'en' | 'zh-CN'): string;
export function updateHomepageReleaseStatus(html: string, status: ReleaseStatus, locale?: 'en' | 'zh-CN'): string;
