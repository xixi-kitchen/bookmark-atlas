import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, BookmarkPlus, Check, Folder, Globe } from 'lucide-react';
import { CaptureError, captureActiveTab, isCapturableUrl, openCaptureCanvas, type CaptureErrorCode } from './captureQueue';
import { cancelEmbedCapture, captureEmbedActiveTab, EmbedCaptureError, getEmbedCaptureStatus, isEmbeddableCaptureUrl, loadPendingEmbedCaptures, normalizeEmbedCaptureUrl, openEmbedCaptureCanvas, retryEmbedCapture, type EmbedCaptureErrorCode, type EmbedCaptureIntent } from './embedCaptureQueue';
import { loadCaptureOpenAfterSave, loadCaptureOptions, saveCaptureOpenAfterSave, saveCaptureOptions, type CaptureMode } from './capturePreferences';
import { getUiLanguage, t } from '../i18n';
import { advanceLearning } from '../onboarding/learningState';
import { markReleaseFeatureUsed, readReleaseNotice } from '../onboarding/releaseEducation';
import { normalizeBookmarkTree } from '../bookmarks/normalize';
import type { BookmarkTree } from '../bookmarks/types';
import { loadLocalAISettings, requestAIOriginPermission, type LocalAISettings } from '../ai/client';
import { nativeFolderChoices, recommendNativeFolders } from '../bookmarks/organization/ai';
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
  const [bookmarkTree, setBookmarkTree] = useState<BookmarkTree | null>(null);
  const [parentId, setParentId] = useState('');
  const [folderSearch, setFolderSearch] = useState('');
  const [foldersFailed, setFoldersFailed] = useState(false);
  const [recommendationInput, setRecommendationInput] = useState<{ title: string; domain: string; folders: { id: string; title: string; path: string }[] } | null>(null);
  const [recommendations, setRecommendations] = useState<{ folderId: string; reason: string; confidence: 'high' | 'low' }[]>([]);
  const [recommendationConsent, setRecommendationConsent] = useState(false);
  const [recommendationBusy, setRecommendationBusy] = useState(false);
  const [recommendationError, setRecommendationError] = useState('');
  const [aiSettings, setAISettings] = useState<LocalAISettings | null>(null);
  const [aiSettingsLoaded, setAISettingsLoaded] = useState(false);
  const recommendationController = useRef<AbortController | null>(null);
  const chinese = getUiLanguage() === 'zh-CN';
  const folderLabel = chinese ? '保存到' : 'Save to';
  const folderChoices = bookmarkTree ? nativeFolderChoices(bookmarkTree) : [];
  const showFolders = typeof globalThis.chrome?.bookmarks?.getTree === 'function';
  const isDefaultInbox = (id: string) => {
    const node = bookmarkTree?.nodes[id];
    const parent = node?.parentId ? bookmarkTree?.nodes[node.parentId] : undefined;
    return node?.title === 'Bookmark Atlas' && (parent?.folderType === 'other' || parent?.id === '2');
  };
  const filteredFolders = folderChoices.filter((folder) => folder.id === parentId
    || (!isDefaultInbox(folder.id) && folder.path.toLocaleLowerCase().includes(folderSearch.toLocaleLowerCase())));
  const pending = useRef(false);
  const preferencePending = useRef(false);
  const capturedIntent = useRef<{ mode: CaptureMode; id: string } | null>(null);
  const embedAttempt = useRef<string | null>(null);
  const canCapture = tab?.id !== undefined && Boolean(tab.active) && !tab.incognito
    && (mode === 'embed' ? isEmbeddableCaptureUrl(tab.url) : isCapturableUrl(tab.url));
  const choicesLocked = !preferenceReady || savingPreference || busy || saved || attemptStarted;
  const destinationUnavailable = Boolean(showFolders && bookmarkTree && parentId && (mode === 'bookmark' || saveBookmark)
    && !capturedIntent.current && !folderChoices.some(folder => folder.id === parentId));

  useEffect(() => {
    if (!showFolders) return;
    let stopped = false;
    let refreshSequence = 0;
    const refresh = () => {
      const sequence = ++refreshSequence;
      void chrome.bookmarks.getTree().then((tree) => {
        if (!stopped && sequence === refreshSequence) { setBookmarkTree(normalizeBookmarkTree(tree)); setFoldersFailed(false); }
      }).catch(() => { if (!stopped && sequence === refreshSequence) setFoldersFailed(true); });
    };
    refresh();
    const changes = chrome.bookmarks;
    const events = [changes.onCreated, changes.onChanged, changes.onMoved, changes.onRemoved, changes.onChildrenReordered];
    events.forEach((event) => event?.addListener(refresh));
    return () => { stopped = true; events.forEach((event) => event?.removeListener(refresh)); };
  }, [showFolders]);

  useEffect(() => {
    recommendationController.current?.abort();
    recommendationController.current = null;
    setRecommendationBusy(false);
    setRecommendationInput(null); setRecommendations([]); setRecommendationConsent(false); setRecommendationError('');
    return () => recommendationController.current?.abort();
  }, [bookmarkTree, tab?.title, tab?.url, mode, saveBookmark, parentId]);

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
    setParentId(intent.parentId ?? '');
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
    if (!canCapture || destinationUnavailable || !preferenceReady || preferencePending.current || pending.current || savedWithoutOpening || tab?.id === undefined) return;
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
          completed = { mode, id: (await (parentId ? captureActiveTab(tab.id, parentId) : captureActiveTab(tab.id))).id };
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
            const intent = await captureEmbedActiveTab({ id: embedAttempt.current, tabId: tab.id, expectedUrl: tab.url!, saveBookmark, ...(parentId ? { parentId } : {}) });
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

  async function changeDestination(value: string) {
    if (pending.current || busy || saved || (attemptStarted && !preparingEditable)) return;
    if (embedAttempt.current) await changeSaveBookmark(saveBookmark);
    if (!embedAttempt.current) { setParentId(isDefaultInbox(value) ? '' : value); setError(null); }
  }

  async function openRecommendations() {
    if (!bookmarkTree || !isCapturableUrl(tab?.url) || choicesLocked) return;
    setRecommendationInput({ title: (tab.title?.trim() || new URL(tab.url).hostname).replace(/https?:\/\/[^\s<>"']+/gi, '[web address]'),
      domain: new URL(tab.url).hostname, folders: nativeFolderChoices(bookmarkTree) });
    setRecommendationConsent(false); setRecommendations([]); setRecommendationError('');
    setAISettingsLoaded(false);
    try { setAISettings(await loadLocalAISettings()); }
    catch { setAISettings(null); }
    finally { setAISettingsLoaded(true); }
  }

  async function generateRecommendations() {
    if (!recommendationInput || !recommendationConsent || !aiSettings?.apiKey || recommendationBusy || choicesLocked) return;
    const controller = new AbortController();
    recommendationController.current = controller;
    const permission = requestAIOriginPermission(aiSettings);
    setRecommendationBusy(true); setRecommendationError('');
    try {
      if (!await permission) throw new Error('permission');
      const result = await recommendNativeFolders(aiSettings, recommendationInput, controller.signal);
      if (!controller.signal.aborted) {
        setRecommendations(result.slice(0, 3));
        if (result.length === 0) setRecommendationError(chinese ? '没有合适建议，请手动选择文件夹。' : 'No suitable suggestions. Choose a folder manually.');
      }
    } catch {
      if (!controller.signal.aborted) setRecommendationError(chinese ? '暂时无法获取建议，请检查 AI 设置或手动选择。' : 'Suggestions unavailable. Check AI settings or choose a folder manually.');
    } finally { if (recommendationController.current === controller) setRecommendationBusy(false); }
  }

  const hostname = isCapturableUrl(tab?.url) ? new URL(tab.url).hostname : '';
  const recovery = mode === 'embed' && (reviewIds.length > 0 || error === 'request_ended');
  const status = destinationUnavailable ? (chinese ? '所选文件夹已删除或不可用，请选择其他文件夹或默认收件目录。' : 'The selected folder was deleted or is unavailable. Choose another folder or the default inbox.') : error === 'request_ended' ? t('captureEmbedRequestEnded')
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
  const hasAlert = Boolean(destinationUnavailable || error || preferenceError || optionsSaveFailed || reviewIds.length);
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
      {(mode === 'bookmark' || saveBookmark) && (showFolders ? <section className="capture-popup__folders" aria-label={folderLabel}>
        <label htmlFor="capture-folder-search">{chinese ? '搜索文件夹' : 'Search folders'}</label>
        <input id="capture-folder-search" type="search" value={folderSearch} disabled={choicesLocked && !preparingEditable}
          onChange={(event) => setFolderSearch(event.currentTarget.value)} />
        <label htmlFor="capture-folder">{folderLabel}</label>
        <select id="capture-folder" value={parentId} disabled={(choicesLocked && !preparingEditable) || busy}
          onChange={(event) => void changeDestination(event.currentTarget.value)}>
          <option value="">{t('captureDestinationValue')}</option>
          {filteredFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.path}</option>)}
          {parentId && !folderChoices.some((folder) => folder.id === parentId) && <option value={parentId}>{chinese ? '所选文件夹已不可用' : 'Selected folder unavailable'}</option>}
        </select>
        {foldersFailed && <p className="capture-popup__hint" role="status">{chinese ? '目录暂时无法读取，添加时会重新检查目标。' : 'Folders could not be loaded. The destination will be checked when adding.'}</p>}
        <button type="button" className="capture-popup__secondary" disabled={!bookmarkTree || choicesLocked || !canCapture}
          onClick={() => void openRecommendations()}>{chinese ? 'AI 推荐' : 'AI recommendations'}</button>
        {recommendationInput && <div className="capture-popup__recommendations">
          <strong>{chinese ? '将发送给所配置 AI 的内容' : 'Data sent to your configured AI'}</strong>
          <p>{recommendationInput.title}<br />{recommendationInput.domain}</p>
          <details><summary>{chinese ? `候选目录（${recommendationInput.folders.length}）` : `Candidate folders (${recommendationInput.folders.length})`}</summary>
            <ul>{recommendationInput.folders.map((folder) => <li key={folder.id}>{folder.path}</li>)}</ul>
          </details>
          <p className="capture-popup__hint">{chinese ? '标题、域名和以上目录名称与层级会发送至你配置的服务，适用服务商费用。' : 'The title, domain and listed folder names and hierarchy are sent to your provider. Provider fees apply.'}</p>
          {aiSettingsLoaded && !aiSettings?.apiKey ? <p className="capture-popup__hint">{chinese ? '请先保存本机 AI 配置。' : 'Save local AI settings first.'} <a target="_blank" rel="noreferrer" href={chrome.runtime?.getURL?.('newtab.html?settings=ai')}>{chinese ? '打开 AI 设置' : 'Open AI settings'}</a></p> : <>
            <label className="capture-popup__option"><input type="checkbox" checked={recommendationConsent} disabled={recommendationBusy}
              onChange={(event) => setRecommendationConsent(event.currentTarget.checked)} /><span>{chinese ? '同意发送以上内容' : 'Allow sending the listed data'}</span></label>
            <button type="button" className="capture-popup__secondary" disabled={!aiSettingsLoaded || !recommendationConsent || recommendationBusy || choicesLocked}
              onClick={() => void generateRecommendations()}>{recommendationBusy ? (chinese ? '正在推荐…' : 'Getting suggestions…') : (chinese ? '生成目录建议' : 'Get folder suggestions')}</button>
          </>}
          {recommendationError && <p role="alert" className="capture-popup__hint">{recommendationError}</p>}
          {recommendations.map((item) => <button type="button" className="capture-popup__recommendation" key={item.folderId}
            disabled={choicesLocked} onClick={() => void changeDestination(item.folderId)}>
            <strong>{folderChoices.find((folder) => folder.id === item.folderId)?.path}</strong><span>{item.reason}</span>
            {item.confidence === 'low' && <small>{chinese ? '需要确认' : 'Review suggested'}</small>}
          </button>)}
        </div>}
      </section> : <p className="capture-popup__destination"><Folder size={15} aria-hidden="true" /><span>{t('captureDestination')}: {t('captureDestinationValue')}</span></p>)}
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
      <button type="button" className="capture-popup__submit" disabled={loading || !preferenceReady || savingPreference || !canCapture || destinationUnavailable || busy || savedWithoutOpening} onClick={() => void addToCanvas()}>
        {saved ? <Check size={18} aria-hidden="true" /> : mode === 'embed' ? <Globe size={18} aria-hidden="true" /> : <BookmarkPlus size={18} aria-hidden="true" />}
        {busy ? t(saved ? 'captureOpening' : 'captureAdding') : recovery ? t('captureEmbedReadd') : resumePending ? t('captureEmbedResume') : error && (error !== 'page_changed' || capturedIntent.current) ? t('retry') : t(mode === 'embed' ? 'captureEmbedSubmit' : 'captureAddToCanvas')}
        {!busy && openAfterSave && <ArrowUpRight size={16} aria-hidden="true" />}
      </button>
    </main>
  );
}
