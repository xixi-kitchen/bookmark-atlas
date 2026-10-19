import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { t } from '../i18n';
import {
  clearLocalAISettings, listAIModels, loadLocalAISettings, normalizeAIConfig,
  requestAIOriginPermission, saveLocalAISettings, testAIConnection,
} from './client';
import { aiErrorMessage } from './errorMessage';
import { AIError } from './plan';
import './AISettings.css';

export function AISettings({ onClose }: { onClose: () => void }) {
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const mounted = useRef(true);
  const trigger = useRef<Element | null>(document.activeElement);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    mounted.current = true;
    heading.current?.focus();
    const startingRevision = revision.current;
    void loadLocalAISettings().then((settings) => {
      if (mounted.current && startingRevision === revision.current && settings) {
        setBaseUrl(settings.baseUrl); setModel(settings.model); setApiKey(settings.apiKey);
      }
    }).catch((cause) => {
      if (mounted.current && startingRevision === revision.current) setError(aiErrorMessage(cause));
    }).finally(() => { if (mounted.current) setLoading(false); });
    return () => {
      mounted.current = false;
      controller.current?.abort();
      if (trigger.current instanceof HTMLElement && trigger.current.isConnected) trigger.current.focus();
    };
  }, []);

  const invalidate = (clearModels = true) => {
    revision.current += 1;
    controller.current?.abort(); controller.current = null;
    setBusy(false); setStatus(''); setError(''); if (clearModels) setModels([]); setDirty(true);
  };
  const close = () => { controller.current?.abort(); setApiKey(''); onClose(); };
  const run = async (operation: 'save' | 'clear' | 'models' | 'test') => {
    if (controller.current || loading) return;
    const abort = new AbortController();
    controller.current = abort;
    const currentRevision = revision.current;
    const current = () => mounted.current && !abort.signal.aborted && currentRevision === revision.current;
    setBusy(true); setError(''); setStatus('');
    try {
      if (operation === 'save') {
        await saveLocalAISettings({ baseUrl, model, apiKey });
        if (current()) { setStatus(t('aiSettingsSaved')); setDirty(false); }
      } else if (operation === 'clear') {
        await clearLocalAISettings();
        if (current()) { setBaseUrl(''); setModel(''); setApiKey(''); setModels([]); setDirty(false); setStatus(t('aiSettingsCleared')); }
      } else {
        const config = normalizeAIConfig({ baseUrl, model: operation === 'models' ? 'model-list' : model });
        // Permission request starts in the button gesture, before any unrelated await.
        const allowed = await requestAIOriginPermission(config);
        if (!current()) return;
        if (!allowed) throw new AIError('permission_required');
        if (operation === 'models') {
          const result = await listAIModels(config, apiKey, abort.signal);
          if (current()) { setModels(result); setStatus(t('aiModelsLoaded', String(result.length))); }
        } else {
          await testAIConnection(config, apiKey, abort.signal);
          if (current()) setStatus(t('aiTestPassed'));
        }
      }
    } catch (cause) { if (current()) setError(aiErrorMessage(cause)); }
    finally {
      if (controller.current === abort) controller.current = null;
      if (current()) setBusy(false);
    }
  };

  return <aside className="atlas-ai-panel atlas-ai-settings" role="dialog" aria-labelledby="atlas-ai-settings-title"
    onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); close(); } }}>
    <header><h2 id="atlas-ai-settings-title" tabIndex={-1} ref={heading}>{t('aiSettings')}</h2>
      <button type="button" onClick={close} aria-label={t('close')}><X size={18} /></button></header>
    <p>{t('aiLocalSettingsHint')}</p>
    <form onSubmit={(event) => { event.preventDefault(); void run('save'); }}>
      <fieldset disabled={loading}>
        <label htmlFor="atlas-ai-settings-base">{t('aiBaseUrl')}</label>
        <input id="atlas-ai-settings-base" type="url" value={baseUrl} required autoComplete="off" placeholder="https://api.example.com/v1"
          onChange={(event) => { invalidate(); setBaseUrl(event.target.value); setApiKey(''); setStatus(t('aiKeyChangedEndpoint')); }} />
        <label htmlFor="atlas-ai-settings-key">API Key</label>
        <input id="atlas-ai-settings-key" type="password" value={apiKey} required maxLength={4096} autoComplete="off" spellCheck={false}
          aria-describedby="atlas-ai-local-key-warning" onChange={(event) => { invalidate(); setApiKey(event.target.value); }} />
        <small id="atlas-ai-local-key-warning">{t('aiLocalKeyWarning')}</small>
        <button type="button" className="secondary-button" disabled={busy || !baseUrl.trim() || !apiKey.trim()} onClick={() => void run('models')}>{t('aiFetchModels')}</button>
        <small>{t('aiModelsHint')}</small>
        <label htmlFor="atlas-ai-settings-model">{t('aiModel')}</label>
        <input id="atlas-ai-settings-model" value={model} required maxLength={200} list="atlas-ai-model-options" autoComplete="off"
          onChange={(event) => { invalidate(false); setModel(event.target.value); }} />
        <datalist id="atlas-ai-model-options">{models.map((id) => <option key={id} value={id} />)}</datalist>
        <button type="button" className="secondary-button" disabled={busy || !model.trim() || !baseUrl.trim() || !apiKey.trim()} onClick={() => void run('test')}>{t('aiTestConnection')}</button>
        <small>{t('aiTestHint')}</small>
      </fieldset>
      {busy && <p role="status">{t('aiWorking')}</p>}
      {!busy && status && <p role="status">{status}</p>}
      {dirty && <p>{t('aiUnsavedSettings')}</p>}
      {error && <p role="alert">{error}</p>}
      <footer><button type="button" className="secondary-button" disabled={busy || loading} onClick={() => void run('clear')}>{t('aiClearLocal')}</button>
        <button type="submit" className="primary-button" disabled={busy || loading || !model.trim() || !baseUrl.trim() || !apiKey.trim()}>{t('aiSaveLocal')}</button></footer>
    </form>
  </aside>;
}
