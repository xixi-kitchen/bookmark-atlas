import React from 'react';
import { createRoot } from 'react-dom/client';
import { CapturePopup } from '../../src/capture/CapturePopup';
import { getUiLanguage } from '../../src/i18n';
import { initializeLanguagePreference } from '../../src/i18n/languagePreference';
import { useLanguagePreference } from '../../src/i18n/useLanguagePreference';
import './style.css';

function LocalizedPopup() {
  useLanguagePreference();
  return <CapturePopup />;
}
void initializeLanguagePreference().then(() => {
  document.documentElement.lang = getUiLanguage();
  createRoot(document.getElementById('root')!).render(<LocalizedPopup />);
});
