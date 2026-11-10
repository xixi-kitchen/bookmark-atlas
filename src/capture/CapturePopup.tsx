import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, BookmarkPlus, Check, Folder, Globe } from 'lucide-react';
import { CaptureError, captureActiveTab, isCapturableUrl, openCaptureCanvas, type CaptureErrorCode } from './captureQueue';
import { cancelEmbedCapture, captureEmbedActiveTab, EmbedCaptureError, getEmbedCaptureStatus, isEmbeddableCaptureUrl, loadPendingEmbedCaptures, normalizeEmbedCaptureUrl, openEmbedCaptureCanvas, retryEmbedCapture, type EmbedCaptureErrorCode, type EmbedCaptureIntent } from './embedCaptureQueue';
import { loadCaptureOpenAfterSave, loadCaptureOptions, saveCaptureOpenAfterSave, saveCaptureOptions, type CaptureMode } from './capturePreferences';
import { getUiLanguage, t } from '../i18n';
import { advanceLearning } from '../onboarding/learningState';
import { markReleaseFeatureUsed, readReleaseNotice } from '../onboarding/releaseEducation';
import packageMetadata from '../../package.json';

const appVersion = globalThis.chrome?.runtime?.getManifest?.().version ?? packageMetadata.version;

export function CapturePopup() {
  const [tab, setTab] = useState<chrome.tabs.Tab | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<CaptureMode>('bookmark');
  const [saveBookmark, setSaveBookmark] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<CaptureErrorCode | EmbedCaptureErrorCode | null>(null);
  const [partialBookmark, setPartialBookmark] = useState(false);
  const [reviewIds, setReviewIds] = useState<string[]>([]);
  const [attemptStarted, setAttemptStarted] = useState(false);
  const [preparingEditable, setPreparingEditable] = useState(false);
  const [bookmarkRetained, setBookmarkRetained] = useState(false);
  const [resumePending, setResumePending] = useState(false);
  const [openAfterSave, setOpenAfterSave] = useState(true);
  const [preferenceReady, setPreferenceReady] = useState(false);
  const [savingPreference, setSavingPreference] = useState(false);
  const [preferenceError, setPreferenceError] = useState<'load' | 'save' | null>(null);
  const [optionsSaveFailed, setOptionsSaveFailed] = useState(false);
  const [savedWithoutOpening, setSavedWithoutOpening] = useState(false);
  const [newFeature, setNewFeature] = useState(false);
  const pending = useRef(false);
  const preferencePending = useRef(false);
  const capturedIntent = useRef<{ mode: CaptureMode; id: string } | null>(null);
  const embedAttempt = useRef<string | null>(null);
  const canCapture = tab?.id !== undefined && Boolean(tab.active) && !tab.incognito
    && (mode === 'embed' ? isEmbeddableCaptureUrl(tab.url) : isCapturableUrl(tab.url));
  const choicesLocked = !preferenceReady || savingPreference || busy || saved || attemptStarted;

  useEffect(() => {
    let cancelled = false;
    void readReleaseNotice(appVersion).then((notice) => {
      if (!cancelled) setNewFeature(notice.featureChapters?.includes('capture') === true);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([active]) => {
      setTab(active ?? null);
    }).catch(() => setError('unavailable')).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([loadCaptureOpenAfterSave(), loadCaptureOptions()]).then(([navigation, options]) => {
      if (cancelled) return;
      if (options.status === 'fulfilled') {
        setMode(options.value.mode);
        setSaveBookmark(options.value.saveBookmark);
      }
      // Any unconfirmed preference read uses a conservative no-navigation choice.
      const readFailed = navigation.status === 'rejected' || options.status === 'rejected';
      setOpenAfterSave(!readFailed && navigation.status === 'fulfilled' ? navigation.value : false);
      if (readFailed) setPreferenceError('load');
      setPreferenceReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  function offerPendingRecovery(intent: EmbedCaptureIntent) {
    if (intent.phase === 'preparing') {
      embedAttempt.current = intent.id;
      setAttemptStarted(true);
      setSaveBookmark(intent.saveBookmark);
      setPreparingEditable(true);
      setResumePending(true);
      setReviewIds([]);
    } else {
      setReviewIds([intent.id]);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setReviewIds([]);
    if (mode !== 'embed' || !isEmbeddableCaptureUrl(tab?.url)) return;
    const url = normalizeEmbedCaptureUrl(tab.url);
    void loadPendingEmbedCaptures().then((intents) => {
      if (cancelled || pending.current || capturedIntent.current) return;
      const unfinished = intents.filter((intent) => ['preparing', 'needs-review'].includes(intent.phase)
        && normalizeEmbedCaptureUrl(intent.url) === url).sort((a, b) => a.createdAt - b.createdAt)[0];
      if (unfinished) offerPendingRecovery(unfinished);
    }).catch(() => undefined); // Submission rereads; a failed preview lookup cannot authorize a new request.
    return () => { cancelled = true; };
  }, [mode, tab?.url]);

  async function changeOpenAfterSave(value: boolean) {
    if (!preferenceReady || preferencePending.current || pending.current || saved) return;
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

  async function changeSaveBookmark(value: boolean) {
    if (busy || pending.current || !preferenceReady || savingPreference || saved) return;
    if (!embedAttempt.current) { setSaveBookmark(value); return; }
    if (!preparingEditable) return;
    pending.current = true;
    setBusy(true);
    try {
      const id = embedAttempt.current;
      const status = await getEmbedCaptureStatus(id);
      if (!status || !('phase' in status) || status.phase !== 'preparing') {
        setPreparingEditable(false);
        throw new EmbedCaptureError('failed');
      }
      // Cancelling only the non-consumable request never removes a browser bookmark.
      await cancelEmbedCapture(id);
      setBookmarkRetained(partialBookmark || Boolean(status.bookmarkId));
      embedAttempt.current = null;
      capturedIntent.current = null;
      setAttemptStarted(false);
      setPreparingEditable(false);
      setResumePending(false);
      setPartialBookmark(false);
      setError(null);
      setSaveBookmark(value);
      // Changing the choice deliberately ends this request; a new one needs a new click.
    } catch {
      setError('failed');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function addToCanvas() {
    if (!canCapture || !preferenceReady || preferencePending.current || pending.current || savedWithoutOpening || tab?.id === undefined) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setPreferenceError(null);
    setPartialBookmark(false);
    setPreparingEditable(false);
    setResumePending(false);
    let submittingEmbed = false;
    try {
      // Once capture succeeds, a navigation retry only opens the known request.
      if (mode === 'embed' && (reviewIds.length > 0 || error === 'request_ended')) {
        capturedIntent.current = null;
        setSaved(false);
      }
      let completed = capturedIntent.current;
      if (!completed) {
        if (mode === 'bookmark') {
          completed = { mode, id: (await captureActiveTab(tab.id)).id };
        } else {
          const recoverExplicitly = reviewIds.length > 0 || error === 'request_ended';
          const recoveredIds = new Set(reviewIds);
          if (recoverExplicitly) {
            for (const id of reviewIds) await cancelEmbedCapture(id);
            setReviewIds([]);
            embedAttempt.current = null;
          }
          if (!embedAttempt.current) {
            // Check again at submission, including after a failed preview lookup.
            const pendingIntents = await loadPendingEmbedCaptures();
            const unfinished = pendingIntents.filter((intent) => ['preparing', 'needs-review'].includes(intent.phase)
              && !recoveredIds.has(intent.id)
              && normalizeEmbedCaptureUrl(intent.url) === normalizeEmbedCaptureUrl(tab.url!))
              .sort((a, b) => a.createdAt - b.createdAt)[0];
            if (unfinished) {
              offerPendingRecovery(unfinished);
              return;
            }
            embedAttempt.current = crypto.randomUUID();
            setAttemptStarted(true);
            submittingEmbed = true;
            const intent = await captureEmbedActiveTab({ id: embedAttempt.current, tabId: tab.id, expectedUrl: tab.url!, saveBookmark });
            submittingEmbed = false;
            completed = { mode, id: intent.id };
          } else {
            const intent = await retryEmbedCapture(embedAttempt.current);
            completed = { mode, id: intent.id };
          }
        }
        capturedIntent.current = completed;
        setSaved(true);
        // Choices are local and only remembered after a successful capture. A failed
        // preference write must never turn that capture into a duplicate retry.
        try { await saveCaptureOptions({ mode, saveBookmark }); setOptionsSaveFailed(false); } catch { setOptionsSaveFailed(true); }
        if (mode === 'bookmark') {
          // Webpage embedding does not satisfy the existing bookmark-card course.
          await Promise.allSettled([advanceLearning({ type: 'capture-saved' }), markReleaseFeatureUsed(appVersion, 'capture')]);
          setNewFeature(false);
        }
      }
      if (openAfterSave) {
        await (completed.mode === 'embed' ? openEmbedCaptureCanvas(completed.id) : openCaptureCanvas(completed.id));
        window.close();
      } else {
        setSavedWithoutOpening(true);
      }
    } catch (failure) {
      const code = failure instanceof CaptureError || failure instanceof EmbedCaptureError ? failure.code : 'failed';
      const refreshPreview = !capturedIntent.current && (code === 'page_changed' || (submittingEmbed && code === 'unsupported_page'));
      setError(refreshPreview ? 'page_changed' : code);
      if (failure instanceof EmbedCaptureError) setPartialBookmark(failure.bookmarkSaved === true);
      if (code === 'needs_review' && embedAttempt.current) setReviewIds([embedAttempt.current]);
      if (mode === 'embed' && embedAttempt.current && !capturedIntent.current
        && !refreshPreview && code !== 'request_ended' && code !== 'needs_review') {
        try {
          const status = await getEmbedCaptureStatus(embedAttempt.current);
          setPreparingEditable(Boolean(status && 'phase' in status && status.phase === 'preparing'));
        } catch { /* Unconfirmed state keeps request options locked. */ }
      }
      if (refreshPreview) {
        embedAttempt.current = null;
        setAttemptStarted(false);
        setLoading(true);
        try {
          const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
          setTab(active ?? null);
        } catch { setTab(null); setError('unavailable'); }
        finally { setLoading(false); }
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const hostname = isCapturableUrl(tab?.url) ? new URL(tab.url).hostname : '';
  const recovery = mode === 'embed' && (reviewIds.length > 0 || error === 'request_ended');
  const status = error === 'request_ended' ? t('captureEmbedRequestEnded')
    : error && capturedIntent.current?.mode === 'embed' ? t('captureEmbedOpenFailed')
      : error === 'page_changed' ? t('capturePageChanged')
      : reviewIds.length ? t('captureEmbedNeedsReview')
        : partialBookmark ? t('captureEmbedPartial')
          : error === 'queue_full' ? t('captureQueueFull') : error === 'queue_invalid' ? t('captureQueueInvalid')
            : error === 'unavailable' ? t('captureUnavailable')
              : error ? t(mode === 'embed' ? 'captureEmbedFailed' : 'captureFailed')
                : preferenceError === 'load' ? t('captureOpenPreferenceLoadFailed') : preferenceError ? t('captureOpenPreferenceFailed')
                  : savedWithoutOpening ? t(mode === 'embed' ? 'captureEmbedQueued' : 'captureSavedWithoutOpening')
                    : saved ? t(mode === 'embed' ? 'captureEmbedOpening' : 'captureSuccess') : resumePending ? t('captureEmbedPreparing') : '\u00a0';
  const hasAlert = Boolean(error || preferenceError || optionsSaveFailed || reviewIds.length);
  return (
    <main className="capture-popup">
      <header>
        <img src="/icons/icon-32.png" width="28" height="28" alt="" />
        <span>Bookmark Atlas</span>
      </header>
      <h1>{t('captureCurrentPage')}</h1>
      {newFeature && <small className="capture-popup__new">{getUiLanguage() === 'zh-CN' ? '新功能' : 'NEW'}</small>}
      <fieldset className="capture-popup__modes" disabled={choicesLocked}>
        <legend>{t('captureMode')}</legend>
        {(['bookmark', 'embed'] as const).map((value) => <label key={value}>
          <input type="radio" name="capture-mode" value={value} checked={mode === value} onChange={() => { setMode(value); setError(null); }} />
          <span>{t(value === 'bookmark' ? 'captureModeBookmark' : 'captureModeEmbed')}</span>
        </label>)}
      </fieldset>
      <p className="capture-popup__intro">{t(mode === 'embed' ? 'captureEmbedDescription' : 'captureDescription')}</p>
      <section className="capture-popup__page" aria-busy={loading}>
        <strong>{loading ? t('capturePageLoading') : tab?.title || hostname || t('captureUnavailable')}</strong>
        {hostname && <span>{hostname}</span>}
      </section>
      {mode === 'embed' && <>
        <label className="capture-popup__option">
          <input type="checkbox" checked={saveBookmark} disabled={choicesLocked && (!preparingEditable || busy || savingPreference)} aria-describedby="capture-bookmark-help"
            onChange={(event) => void changeSaveBookmark(event.currentTarget.checked)} />
          <span>{t('captureEmbedSaveBookmark')}</span>
        </label>
        <p id="capture-bookmark-help" className="capture-popup__hint">{t('captureEmbedBookmarkIndependent')}</p>
      </>}
      {(mode === 'bookmark' || saveBookmark) && <p className="capture-popup__destination"><Folder size={15} aria-hidden="true" /><span>{t('captureDestination')}: {t('captureDestinationValue')}</span></p>}
      {mode === 'embed' && <p className="capture-popup__hint">{t('captureEmbedPrivacy')}</p>}
      <label className="capture-popup__option">
        <input type="checkbox" checked={openAfterSave} disabled={!preferenceReady || savingPreference || busy || saved}
          onChange={(event) => void changeOpenAfterSave(event.currentTarget.checked)} />
        <span>{t('captureOpenAfterSave')}</span>
      </label>
      {!loading && !canCapture && <p className="capture-popup__notice">{t(mode === 'embed' ? 'captureEmbedUnsupported' : 'captureUnsupportedPage')}</p>}
      <p className={`capture-popup__status${hasAlert ? ' is-error' : ''}`} role={hasAlert ? 'alert' : 'status'} aria-live="polite">
        {status}{bookmarkRetained && <> {t('captureEmbedBookmarkRetained')}</>}{optionsSaveFailed && <> {t('captureOptionsSaveFailed')}</>}
      </p>
      <button type="button" className="capture-popup__submit" disabled={loading || !preferenceReady || savingPreference || !canCapture || busy || savedWithoutOpening} onClick={() => void addToCanvas()}>
        {saved ? <Check size={18} aria-hidden="true" /> : mode === 'embed' ? <Globe size={18} aria-hidden="true" /> : <BookmarkPlus size={18} aria-hidden="true" />}
        {busy ? t(saved ? 'captureOpening' : 'captureAdding') : recovery ? t('captureEmbedReadd') : resumePending ? t('captureEmbedResume') : error && (error !== 'page_changed' || capturedIntent.current) ? t('retry') : t(mode === 'embed' ? 'captureEmbedSubmit' : 'captureAddToCanvas')}
        {!busy && openAfterSave && <ArrowUpRight size={16} aria-hidden="true" />}
      </button>
    </main>
  );
}
