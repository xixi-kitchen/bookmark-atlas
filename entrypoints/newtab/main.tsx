import React from 'react';
import ReactDOM from 'react-dom/client';
import '@excalidraw/excalidraw/index.css';
import './style.css';
import { App } from '../../src/App';
import { getUiLanguage } from '../../src/i18n';
import { initializeLanguagePreference } from '../../src/i18n/languagePreference';
import { isStoreScreenshotMode } from '../../src/storeScreenshot';
import { applyTheme, DEFAULT_THEME_ID } from '../../src/themes';

applyTheme(DEFAULT_THEME_ID);

if (isStoreScreenshotMode()) {
  document.body.dataset.storeScreenshot = 'true';
}

void initializeLanguagePreference().then(() => {
  document.documentElement.lang = getUiLanguage();
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
