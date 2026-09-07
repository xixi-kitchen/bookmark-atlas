import React from 'react';
import ReactDOM from 'react-dom/client';
import '@excalidraw/excalidraw/index.css';
import './style.css';
import { App } from '../../src/App';
import { getUiLanguage } from '../../src/i18n';
import { isStoreScreenshotMode } from '../../src/storeScreenshot';

document.documentElement.lang = getUiLanguage();

if (isStoreScreenshotMode()) {
  document.body.dataset.storeScreenshot = 'true';
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
