import catalogue from './compatibility-catalogue.js';
import { createCompatibilityMatcher } from './compatibility-matcher.js';

const getCompatibility = createCompatibilityMatcher(catalogue);
const filters = document.querySelector('[data-compatibility-filters]');
const query = document.querySelector('#compatibility-query');
const mode = document.querySelector('#compatibility-mode');
const browser = document.querySelector('#compatibility-browser');
const lookup = document.querySelector('.compatibility-lookup');
const empty = document.querySelector('.compatibility-empty');
const language = document.querySelector('[data-language-switch]');
const entries = [...document.querySelectorAll('.compatibility-entry')].map((entry) => ({
  entry,
  search: entry.textContent.toLowerCase().replace(/\s+/g, ' '),
  mode: entry.dataset.mode,
  browsers: entry.dataset.browsers.split(' '),
}));

function parseSearchUrl(search) {
  try {
    const url = new URL(search);
    if (url.protocol === 'https:' && !url.port && !url.username && !url.password) return url;
  } catch {
    // Plain labels and domains are searched as text.
  }
  return null;
}

function applyFilters() {
  const search = query.value.trim();
  const url = parseSearchUrl(search);
  const compatibility = url && getCompatibility(url.href);
  let visible = 0;
  for (const row of entries) {
    const matches = (url ? row.entry.id === compatibility?.id : row.search.includes(search.toLowerCase()))
      && (!mode.value || (url ? compatibility?.mode : row.mode) === mode.value)
      && (!browser.value || row.browsers.includes(browser.value));
    row.entry.hidden = !matches;
    if (matches) visible += 1;
  }
  const documentLanguage = document.documentElement.lang;
  const reason = compatibility?.reason?.[documentLanguage];
  const displayMode = compatibility && [...mode.options].find((option) => option.value === compatibility.mode)?.textContent;
  lookup.hidden = !reason || !visible;
  lookup.textContent = reason && displayMode ? `${displayMode} · ${reason}` : '';
  empty.hidden = visible > 0;
}

function showAnchor() {
  const linked = entries.find((row) => `#${row.entry.id}` === location.hash);
  const languageUrl = new URL(language.getAttribute('href'), location.href);
  languageUrl.hash = linked ? location.hash : '';
  language.href = languageUrl.href;
  if (!linked || !linked.entry.hidden) return;
  query.value = '';
  mode.value = '';
  browser.value = '';
  applyFilters();
  linked.entry.scrollIntoView();
}

if (filters && query && mode && browser && lookup && empty && language) {
  filters.hidden = false;
  query.addEventListener('input', applyFilters);
  mode.addEventListener('change', applyFilters);
  browser.addEventListener('change', applyFilters);
  window.addEventListener('hashchange', showAnchor);
  applyFilters();
  showAnchor();
}
