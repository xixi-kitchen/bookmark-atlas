import { useEffect, useRef, useState } from 'react';
import { BookOpen, Search, Settings, Sparkles, X } from 'lucide-react';
import { getUiLanguage, t } from '../i18n';
import { usePreferencesStore } from '../store/preferencesStore';
import { DEFAULT_THEME_ID, THEMES, type ThemeId } from '../themes';
import type { CardSize } from '../types/ui';
import { ToolbarSelectMenu } from './ToolbarSelectMenu';
import type { BookmarkPresentation } from '../excalidraw/bookmarkDisplay';
import { useLanguagePreference } from '../i18n/useLanguagePreference';
import { setLanguagePreference, type LanguagePreference } from '../i18n/languagePreference';

type Props = {
  version: string;
  onManageEngines: () => void;
  onOpenGuide: () => void;
  onWhatsNew: () => void;
  onAISettings?: () => void;
  updateUnread?: boolean;
  newAI?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function SettingsMenu({ version, onManageEngines, onOpenGuide, onWhatsNew, onAISettings, updateUnread = false, newAI = false, onOpenChange }: Props) {
  const preferences = usePreferencesStore();
  const { preference: languagePreference } = useLanguagePreference();
  const [languageSaving, setLanguageSaving] = useState(false);
  const [languageError, setLanguageError] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    onOpenChange?.(open);
    return () => onOpenChange?.(false);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  const run = (action: () => void) => {
    setOpen(false);
    triggerRef.current?.focus();
    action();
  };

  return (
    <div className="settings-menu" ref={rootRef} onKeyDown={(event) => {
      if (event.key === 'Escape' && open) {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }}>
      <button ref={triggerRef} className="icon-button" type="button" aria-label={t('settings')}
        data-unread-update={String(updateUnread)} aria-describedby={updateUnread ? 'atlas-update-unread' : undefined}
        title={t('settings')} aria-expanded={open} aria-haspopup="dialog"
        aria-controls={open ? 'atlas-settings' : undefined} onClick={() => setOpen((value) => !value)}>
        <Settings size={17} />
        {updateUnread && <><span className="atlas-update-dot" aria-hidden="true" /><span className="sr-only" id="atlas-update-unread">{getUiLanguage() === 'zh-CN' ? '有未读更新说明' : 'Unread update notes'}</span></>}
      </button>
      {open && (
        <aside ref={panelRef} id="atlas-settings" className="settings-menu__panel" role="dialog" aria-label={t('settings')}>
          <header>
            <strong>{t('settings')}</strong>
            <small>v{version}</small>
            <button className="icon-button" type="button" aria-label={t('close')} onClick={() => run(() => undefined)}><X size={15} /></button>
          </header>
          <section aria-label={t('settingsAppearance')}>
            <h2>{t('settingsAppearance')}</h2>
            <label className="settings-menu__row">
              <span>{t('uiLanguage')}</span>
              <select value={languagePreference} disabled={languageSaving} onChange={(event) => {
                setLanguageSaving(true); setLanguageError(false);
                void setLanguagePreference(event.target.value as LanguagePreference)
                  .catch(() => setLanguageError(true)).finally(() => setLanguageSaving(false));
              }}>
                <option value="auto">{t('languageAuto')}</option>
                <option value="zh-CN">简体中文</option>
                <option value="en">English</option>
              </select>
            </label>
            {languageError && <small role="alert">{t('languageSaveFailed')}</small>}
            <div className="settings-menu__row">
              <span>{t('uiStyle')}</span>
              <ToolbarSelectMenu label={t('uiStyle')} value={preferences.themeId} variant="theme"
                options={Object.values(THEMES).map((theme) => ({ value: theme.id, label: t(theme.nameKey), color: theme.tokens.color.accent }))}
                onChange={(value) => preferences.setThemeId(value as ThemeId)} />
            </div>
            <div className="settings-menu__row">
              <span>{t('cardSize')}</span>
              <ToolbarSelectMenu label={t('cardSize')} value={preferences.cardSize} variant="size"
                options={[
                  { value: 'sm', label: t('sizeSmall'), description: t('sizeSmallDescription') },
                  { value: 'md', label: t('sizeMedium'), description: t('sizeMediumDescription') },
                  { value: 'lg', label: t('sizeLarge'), description: t('sizeLargeDescription') },
                ]} onChange={(value) => preferences.setCardSize(value as CardSize)} />
            </div>
            <small className="settings-menu__hint">{t('settingsCardSizeNote')}</small>
            <label className="settings-menu__row">
              <span>{t('newBookmarkDisplay')}</span>
              <select value={preferences.defaultBookmarkPresentation} onChange={(event) => preferences.setDefaultBookmarkPresentation(event.target.value as BookmarkPresentation)}>
                <option value="icon">{t('bookmarkDisplayIcon')}</option>
                <option value="compact">{t('bookmarkDisplayCompact')}</option>
                <option value="detailed">{t('bookmarkDisplayDetailed')}</option>
              </select>
            </label>
            <small className="settings-menu__hint">{t('newBookmarkDisplayHint')}</small>
            <button className="settings-menu__text-button" type="button" onClick={() => preferences.setThemeId(DEFAULT_THEME_ID)}>{t('resetDefaultTheme')}</button>
          </section>
          <section aria-label={t('settingsSearch')}>
            <h2>{t('settingsSearch')}</h2>
            <button className="settings-menu__action" type="button" onClick={() => run(onManageEngines)}><Search size={16} /><span>{t('manageSearchEngines')}</span></button>
          </section>
          {onAISettings && <section aria-label={t('aiSettings')}>
            <h2>{t('aiSettings')}</h2>
            <button className="settings-menu__action" type="button" aria-describedby={newAI ? 'atlas-ai-new' : undefined} onClick={() => run(onAISettings)}><Sparkles size={16} /><span>{t('aiSettings')}</span>{newAI && <><small className="atlas-update-label" aria-hidden="true">{getUiLanguage() === 'zh-CN' ? '新功能' : 'NEW'}</small><span className="sr-only" id="atlas-ai-new">{getUiLanguage() === 'zh-CN' ? '本次更新的新功能' : 'New in this update'}</span></>}</button>
          </section>}
          <section aria-label={t('helpMenu')}>
            <h2>{t('helpMenu')}</h2>
            <button className="settings-menu__action" type="button" onClick={() => run(onOpenGuide)}><BookOpen size={16} /><span>{t('helpOpenGuide')}</span></button>
            <button className="settings-menu__action" type="button" onClick={() => run(onWhatsNew)}><Sparkles size={16} /><span>{t('helpWhatsNew')}</span>{updateUnread && <small className="atlas-update-label" aria-hidden="true">{getUiLanguage() === 'zh-CN' ? '新内容' : 'NEW'}</small>}</button>
          </section>
        </aside>
      )}
    </div>
  );
}
