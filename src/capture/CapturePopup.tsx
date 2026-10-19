import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, BookmarkPlus, Check, Folder } from 'lucide-react';
import { CaptureError, captureActiveTab, isCapturableUrl, openCaptureCanvas, type CaptureErrorCode, type CaptureIntent } from './captureQueue';
import { loadCaptureOpenAfterSave, saveCaptureOpenAfterSave } from './capturePreferences';
import { t } from '../i18n';

export function CapturePopup() {
  const [tab, setTab] = useState<chrome.tabs.Tab | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<CaptureErrorCode | null>(null);
  const [openAfterSave, setOpenAfterSave] = useState(true);
  const [preferenceReady, setPreferenceReady] = useState(false);
  const [savingPreference, setSavingPreference] = useState(false);
  const [preferenceError, setPreferenceError] = useState<'load' | 'save' | null>(null);
  const [savedWithoutOpening, setSavedWithoutOpening] = useState(false);
  const pending = useRef(false);
  const preferencePending = useRef(false);
  const capturedIntent = useRef<CaptureIntent | null>(null);
  const canCapture = tab?.id !== undefined && Boolean(tab.active) && !tab.incognito && isCapturableUrl(tab.url);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([active]) => {
      setTab(active ?? null);
    }).catch(() => setError('unavailable')).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadCaptureOpenAfterSave().then((value) => {
      if (!cancelled) setOpenAfterSave(value);
    }).catch(() => {
      if (!cancelled) {
        // A missing read must not navigate based on an unconfirmed default.
        setOpenAfterSave(false);
        setPreferenceError('load');
      }
    }).finally(() => { if (!cancelled) setPreferenceReady(true); });
    return () => { cancelled = true; };
  }, []);

  async function changeOpenAfterSave(value: boolean) {
    if (!preferenceReady || preferencePending.current || pending.current || savedWithoutOpening) return;
    const previous = openAfterSave;
    preferencePending.current = true;
    setSavingPreference(true);
    setOpenAfterSave(value);
    setPreferenceError(null);
    try {
      await saveCaptureOpenAfterSave(value);
    } catch {
      setOpenAfterSave(previous);
      setPreferenceError('save');
    } finally {
      preferencePending.current = false;
      setSavingPreference(false);
    }
  }

  async function addToCanvas() {
    if (!canCapture || !preferenceReady || preferencePending.current || pending.current || savedWithoutOpening || tab?.id === undefined) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setPreferenceError(null);
    try {
      // Retrying a navigation failure should not create a second capture.
      const intent = capturedIntent.current ?? await captureActiveTab(tab.id);
      capturedIntent.current = intent;
      setSaved(true);
      if (openAfterSave) {
        await openCaptureCanvas(intent.id);
        window.close();
      } else {
        // The background queue remains pending for the normal canvas consumer.
        setSavedWithoutOpening(true);
      }
    } catch (failure) {
      setError(failure instanceof CaptureError ? failure.code : 'failed');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const hostname = isCapturableUrl(tab?.url) ? new URL(tab.url).hostname : '';
  return (
    <main className="capture-popup">
      <header>
        <img src="/icons/icon-32.png" width="28" height="28" alt="" />
        <span>Bookmark Atlas</span>
      </header>
      <h1>{t('captureCurrentPage')}</h1>
      <p className="capture-popup__intro">{t('captureDescription')}</p>
      <section className="capture-popup__page" aria-busy={loading}>
        <strong>{loading ? t('capturePageLoading') : tab?.title || hostname || t('captureUnavailable')}</strong>
        {hostname && <span>{hostname}</span>}
      </section>
      <p className="capture-popup__destination"><Folder size={15} aria-hidden="true" /><span>{t('captureDestination')}: {t('captureDestinationValue')}</span></p>
      <label className="capture-popup__option">
        <input type="checkbox" checked={openAfterSave} disabled={!preferenceReady || savingPreference || busy || savedWithoutOpening}
          onChange={(event) => void changeOpenAfterSave(event.currentTarget.checked)} />
        <span>{t('captureOpenAfterSave')}</span>
      </label>
      {!loading && !canCapture && <p className="capture-popup__notice">{t('captureUnsupportedPage')}</p>}
      <p className={`capture-popup__status${error || preferenceError ? ' is-error' : ''}`} role={error || preferenceError ? 'alert' : 'status'} aria-live="polite">
        {error === 'queue_full' ? t('captureQueueFull') : error === 'queue_invalid' ? t('captureQueueInvalid')
          : error === 'unavailable' ? t('captureUnavailable') : error ? t('captureFailed')
            : preferenceError === 'load' ? t('captureOpenPreferenceLoadFailed') : preferenceError ? t('captureOpenPreferenceFailed')
              : savedWithoutOpening ? t('captureSavedWithoutOpening') : saved ? t('captureSuccess') : '\u00a0'}
      </p>
      <button type="button" className="capture-popup__submit" disabled={loading || !preferenceReady || savingPreference || !canCapture || busy || savedWithoutOpening} onClick={() => void addToCanvas()}>
        {saved ? <Check size={18} aria-hidden="true" /> : <BookmarkPlus size={18} aria-hidden="true" />}
        {busy ? t(saved ? 'captureOpening' : 'captureAdding') : error ? t('retry') : t('captureAddToCanvas')}
        {!busy && openAfterSave && <ArrowUpRight size={16} aria-hidden="true" />}
      </button>
    </main>
  );
}
