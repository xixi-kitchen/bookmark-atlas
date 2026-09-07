import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import {
  addSearchEngine,
  DEFAULT_SEARCH_ENGINES,
  removeSearchEngine,
  reorderSearchEngine,
  setSearchEngineEnabled,
  updateSearchEngine,
  validateSearchEngine,
  type SearchEngine,
} from '../search';
import { SearchEngineIcon } from './SearchEngineIcon';
import { t } from '../i18n';

type Props = {
  engines: SearchEngine[];
  onChange: (engines: SearchEngine[]) => void;
  onClose: () => void;
};

const emptyEngine = (): SearchEngine => ({
  id: `custom-${crypto.randomUUID()}`,
  name: '',
  queryUrlTemplate: 'https://example.com/search?q={query}',
  shortcut: '',
  enabled: true,
});

export function EngineManager({ engines, onChange, onClose }: Props) {
  const [draft, setDraft] = useState<SearchEngine | null>(null);
  const error = useMemo(() => (draft ? validateSearchEngine(draft) : null), [draft]);

  const saveDraft = () => {
    if (!draft || error) return;
    const exists = engines.some((engine) => engine.id === draft.id);
    onChange(exists ? updateSearchEngine(engines, draft.id, draft) : addSearchEngine(engines, draft));
    setDraft(null);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal modal--wide" role="dialog" aria-modal="true" aria-labelledby="engine-title">
        <header className="modal__header">
          <h2 id="engine-title">{t('searchEngines')}</h2>
          <button className="icon-button" onClick={onClose} aria-label={t('close')}><X size={18} /></button>
        </header>
        <div className="modal__body">
          <div className="engine-list">
            {engines.map((engine, index) => (
              <div className="engine-row" key={engine.id}>
                <input
                  type="checkbox"
                  checked={engine.enabled}
                  onChange={(event) => onChange(setSearchEngineEnabled(engines, engine.id, event.target.checked))}
                  aria-label={t('enableEngine', engine.name)}
                />
                <SearchEngineIcon engine={engine} size={28} />
                <button className="engine-row__copy" disabled={isBuiltInEngine(engine)} onClick={() => setDraft({ ...engine })}>
                  <strong>{engine.name}</strong>
                  <small>{engine.kind === 'chrome-default' ? t('engineChromeDefaultDescription') : engine.queryUrlTemplate}</small>
                </button>
                <div className="field-inline">
                  <button className="icon-button" disabled={engine.kind === 'chrome-default' || index <= 1} onClick={() => onChange(reorderSearchEngine(engines, engine.id, index - 1))} aria-label={t('moveUp')}><ArrowUp size={14} /></button>
                  <button className="icon-button" disabled={engine.kind === 'chrome-default' || index === engines.length - 1} onClick={() => onChange(reorderSearchEngine(engines, engine.id, index + 1))} aria-label={t('moveDown')}><ArrowDown size={14} /></button>
                  <button className="icon-button" disabled={isBuiltInEngine(engine) || engines.length === 1} onClick={() => onChange(removeSearchEngine(engines, engine.id))} aria-label={t('delete')}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
          {draft ? (
            <div className="engine-editor">
              <div className="form-field">
                <label htmlFor="engine-name">{t('engineName')}</label>
                <input id="engine-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} autoFocus />
              </div>
              <div className="form-field">
                <label htmlFor="engine-url">{t('engineUrlTemplate')}</label>
                <input id="engine-url" value={draft.queryUrlTemplate} onChange={(event) => setDraft({ ...draft, queryUrlTemplate: event.target.value })} />
              </div>
              <div className="form-field">
                <label htmlFor="engine-shortcut">{t('engineShortcut')}</label>
                <input id="engine-shortcut" value={draft.shortcut ?? ''} onChange={(event) => setDraft({ ...draft, shortcut: event.target.value })} />
              </div>
              {error && <p className="form-error">{translateValidation(error)}</p>}
              <div className="field-inline">
                <button className="primary-button" disabled={Boolean(error)} onClick={saveDraft}>{t('save')}</button>
                <button className="secondary-button" onClick={() => setDraft(null)}>{t('cancel')}</button>
              </div>
            </div>
          ) : (
            <button className="secondary-button" onClick={() => setDraft(emptyEngine())}><Plus size={15} /> {t('addSearchEngine')}</button>
          )}
        </div>
      </section>
    </div>
  );
}

function isBuiltInEngine(engine: SearchEngine) {
  return DEFAULT_SEARCH_ENGINES.some((builtIn) => builtIn.id === engine.id);
}

function translateValidation(error: string) {
  if (error.includes('exactly one')) return t('engineValidationQuery');
  if (error.includes('localhost')) return t('engineValidationHttps');
  if (error.includes('valid URL')) return t('engineValidationUrl');
  if (error.includes('name')) return t('engineValidationName');
  return error;
}
