import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { t } from '../i18n';
import { AI_CONFIG_STORAGE_KEY, AI_CREDENTIAL_STORAGE_KEY, loadLocalAISettings, requestAIOriginPermission, requestOrganization, type LocalAISettings } from './client';
import { AIError, type OrganizationItem, type OrganizationPlan } from './plan';
import { aiErrorMessage } from './errorMessage';
import './AISettings.css';

export function AIOrganizer({ items, onPlan, onClose, onOpenSettings }: {
  items: OrganizationItem[];
  onPlan: (plan: OrganizationPlan) => void;
  onClose: () => void;
  onOpenSettings?: () => void;
}) {
  const [config, setConfig] = useState<LocalAISettings | null>(null);
  const [instruction, setInstruction] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const configRevision = useRef(0);
  const trigger = useRef<Element | null>(document.activeElement);
  const heading = useRef<HTMLHeadingElement>(null);
  const scope = JSON.stringify(items);

  useEffect(() => {
    mounted.current = true;
    heading.current?.focus();
    const reload = () => {
      const revision = ++configRevision.current;
      controller.current?.abort(); controller.current = null;
      setConsent(false); setBusy(false); setConfig(null);
      void loadLocalAISettings().then((value) => {
        if (mounted.current && revision === configRevision.current) { setConfig(value); setError(''); }
      }).catch((cause) => {
        if (mounted.current && revision === configRevision.current) setError(aiErrorMessage(cause));
      });
    };
    reload();
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && (AI_CONFIG_STORAGE_KEY in changes || AI_CREDENTIAL_STORAGE_KEY in changes)) reload();
    };
    globalThis.chrome?.storage?.onChanged?.addListener(onStorage);
    return () => {
      mounted.current = false;
      controller.current?.abort();
      globalThis.chrome?.storage?.onChanged?.removeListener(onStorage);
      if (trigger.current instanceof HTMLElement && trigger.current.isConnected) trigger.current.focus();
    };
  }, []);

  useEffect(() => {
    setConsent(false); setBusy(false);
    controller.current?.abort(); controller.current = null;
  }, [scope]);

  const close = () => { controller.current?.abort(); setConfig(null); onClose(); };
  const generate = async () => {
    if (controller.current || !consent || !config?.apiKey) return;
    const abort = new AbortController();
    controller.current = abort;
    setError(''); setBusy(true);
    try {
      const allowed = await requestAIOriginPermission(config);
      if (abort.signal.aborted) return;
      if (!allowed) throw new AIError('permission_required');
      const plan = await requestOrganization(config, config.apiKey, { items, instruction }, abort.signal);
      if (mounted.current && !abort.signal.aborted) onPlan(plan);
    } catch (cause) { if (mounted.current && !abort.signal.aborted) setError(aiErrorMessage(cause)); }
    finally {
      if (controller.current === abort) { controller.current = null; if (mounted.current) setBusy(false); }
    }
  };

  return <aside className="atlas-ai-panel" role="dialog" aria-labelledby="atlas-ai-title" onKeyDown={(event) => {
    event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); close(); }
  }}>
    <header><h2 id="atlas-ai-title" tabIndex={-1} ref={heading}>{t('aiOrganize')}</h2>
      <button type="button" onClick={close} aria-label={t('close')}><X size={18} /></button></header>
    <p>{t('aiScopeHint', String(items.length))}</p>
    <div className="atlas-ai-config-summary">
      <small>{config?.apiKey ? t('aiUsingConfig', `${config.model} · ${config.baseUrl}`) : t('aiNoSavedConfig')}</small>
      {onOpenSettings && <button type="button" className="secondary-button" onClick={() => { controller.current?.abort(); setConsent(false); onOpenSettings(); }}>{t('aiSettings')}</button>}
    </div>
    <form onSubmit={(event) => { event.preventDefault(); void generate(); }}>
      <fieldset disabled={busy}>
        <label htmlFor="atlas-ai-instruction">{t('aiInstruction')}</label>
        <textarea id="atlas-ai-instruction" rows={3} value={instruction} required maxLength={2000}
          placeholder={t('aiInstructionExample')} onChange={(event) => setInstruction(event.target.value)} />
        <details><summary>{t('aiDataPreview')}</summary>
          <ul>{items.map((item) => <li key={item.id}><strong>{item.title}</strong><span>{item.domain}</span>{item.description && <p>{item.description}</p>}</li>)}</ul>
        </details>
        <label className="atlas-ai-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />{t('aiConsent')}</label>
      </fieldset>
      <p className="atlas-ai-note">{t('aiSuggestionHint')}</p>
      {error && <p role="alert">{error}</p>}
      <footer><button type="button" className="secondary-button" onClick={close}>{t('cancel')}</button>
        <button type="submit" className="primary-button" disabled={busy || !consent || !config?.apiKey || !instruction.trim()}>
          {busy ? t('aiGenerating') : t('aiGeneratePreview')}</button></footer>
    </form>
  </aside>;
}
