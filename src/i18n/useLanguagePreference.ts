import { useEffect, useSyncExternalStore } from 'react';
import { getUiLanguage } from './index';
import { getLanguagePreference, initializeLanguagePreference, subscribeLanguagePreference } from './languagePreference';

/** Rerender in place: changing language must not reload or remount the canvas. */
export function useLanguagePreference() {
  const preference = useSyncExternalStore(subscribeLanguagePreference, getLanguagePreference, () => 'auto' as const);
  const language = getUiLanguage();
  useEffect(() => { void initializeLanguagePreference(); }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  return { preference, language };
}
