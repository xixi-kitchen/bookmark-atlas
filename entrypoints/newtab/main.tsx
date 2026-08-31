import React from 'react';
import ReactDOM from 'react-dom/client';
import '@excalidraw/excalidraw/index.css';
import './style.css';
import { App } from '../../src/App';

if (new URLSearchParams(window.location.search).has('store-screenshot')) {
  document.body.dataset.storeScreenshot = 'true';
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
