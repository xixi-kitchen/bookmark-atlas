const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const sectionTypes = new Set(['added', 'changed', 'fixed', 'security', 'deprecated', 'removed']);
const browsers = new Set(['chrome', 'edge', 'safari']);
const chapterTypes = new Set(['basics', 'capture', 'ai']);

/** Validate the bundled catalogue before releasing; never borrow another version's notes. */
export function validateReleaseNotes(entries, currentVersion, browser) {
  requireValue(typeof currentVersion === 'string' && stableVersion.test(currentVersion), 'package version must be stable semver');
  requireValue(browser === undefined || browsers.has(browser), 'release browser is unknown');
  requireValue(Array.isArray(entries) && entries.length > 0, 'catalogue must be a non-empty array');
  const versions = new Set();
  for (const [index, entry] of entries.entries()) {
    const path = `releaseNotes[${index}]`;
    requireValue(isObject(entry), `${path} must be an object`);
    requireValue(typeof entry.version === 'string' && stableVersion.test(entry.version), `${path}.version must be stable semver`);
    requireValue(!versions.has(entry.version), `${path}.version is duplicate: ${entry.version}`);
    if ('browsers' in entry) {
      requireValue(Array.isArray(entry.browsers) && entry.browsers.length > 0
        && entry.browsers.every((name) => browsers.has(name))
        && new Set(entry.browsers).size === entry.browsers.length, `${path}.browsers must be non-empty, valid and unique`);
    }
    versions.add(entry.version);
    const date = typeof entry.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)
      ? new Date(`${entry.date}T00:00:00.000Z`) : null;
    requireValue(date && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === entry.date, `${path}.date must be a real ISO calendar date`);
    localized(entry.title, `${path}.title`);
    localized(entry.summary, `${path}.summary`);
    nonEmptyList(entry.sections, `${path}.sections`);
    const categories = new Set();
    for (const [sectionIndex, section] of entry.sections.entries()) {
      const sectionPath = `${path}.sections[${sectionIndex}]`;
      requireValue(isObject(section) && sectionTypes.has(section.type), `${sectionPath}.type is unknown`);
      requireValue(!categories.has(section.type), `${sectionPath}.type is duplicate`);
      categories.add(section.type);
      nonEmptyList(section.items, `${sectionPath}.items`);
      for (const [itemIndex, item] of section.items.entries()) {
        const itemPath = `${sectionPath}.items[${itemIndex}]`;
        requireValue(isObject(item), `${itemPath} must be an object`);
        localized(item.title, `${itemPath}.title`);
        localized(item.description, `${itemPath}.description`);
        if ('where' in item) localized(item.where, `${itemPath}.where`);
      }
    }
    for (const key of ['gettingStarted', 'notices']) {
      nonEmptyList(entry[key], `${path}.${key}`);
      entry[key].forEach((item, itemIndex) => localized(item, `${path}.${key}[${itemIndex}]`));
    }
    const education = entry.education;
    requireValue(isObject(education) && ['notes', 'feature-tour'].includes(education.level), `${path}.education.level must be explicit notes or feature-tour`);
    requireValue(Array.isArray(education.chapters) && education.chapters.every((chapter) => chapterTypes.has(chapter))
      && new Set(education.chapters).size === education.chapters.length, `${path}.education.chapters must be valid and unique`);
    requireValue(education.level !== 'feature-tour' || education.chapters.length > 0, `${path}.education feature-tour requires chapters`);
  }
  requireValue(entries.some((entry) => entry.version === currentVersion
    && (browser === undefined || !entry.browsers || entry.browsers.includes(browser))), `Missing bundled release notes for package version ${currentVersion}${browser ? ` (${browser})` : ''}`);
}

function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function requireValue(condition, message) { if (!condition) throw new Error(message); }
function nonEmptyList(value, path) { requireValue(Array.isArray(value) && value.length > 0, `${path} must be a non-empty array`); }
function localized(value, path) {
  requireValue(isObject(value) && ['en', 'zh-CN'].every((locale) => typeof value[locale] === 'string' && value[locale].trim().length > 0), `${path} requires non-empty en and zh-CN text`);
}
