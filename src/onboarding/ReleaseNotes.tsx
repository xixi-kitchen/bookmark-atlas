import { useId } from 'react';
import { Github, X } from 'lucide-react';
import { getUiLanguage, t } from '../i18n';
import { useLanguagePreference } from '../i18n/useLanguagePreference';
import { getReleaseNotes, type ReleaseChapter, type ReleaseNotesEntry } from './releaseCatalog';
import './LearningGuide.css';
import './learningIntegration.css';

export function ReleaseNotes({ version, onClose, onStartGuide }: {
  version: string;
  onClose: () => void;
  onStartGuide?: (chapter: ReleaseChapter) => void;
}) {
  useLanguagePreference();
  const language = getUiLanguage();
  const zh = language === 'zh-CN';
  const titleId = useId();
  const release = getReleaseNotes(version);
  const chapter = release?.education.level === 'feature-tour' ? release.education.chapters[0] : undefined;
  const categories: Record<ReleaseNotesEntry['sections'][number]['type'], string> = zh
    ? { added: '新增', changed: '改进', fixed: '修复', security: '安全', deprecated: '即将移除', removed: '移除' }
    : { added: 'Added', changed: 'Changed', fixed: 'Fixed', security: 'Security', deprecated: 'Deprecated', removed: 'Removed' };
  const archive = 'https://github.com/xixi-kitchen/bookmark-atlas/releases';
  return <aside className="atlas-release-notes" role="dialog" aria-modal="false" aria-labelledby={titleId}
    onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <header className="atlas-release-notes__header"><div>
      <p className="atlas-release-notes__meta">{zh ? '版本介绍' : 'Release notes'}{release && <> · <time dateTime={release.date}>{new Intl.DateTimeFormat(zh ? 'zh-CN' : 'en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${release.date}T00:00:00Z`))}</time></>}</p>
      <h2 id={titleId}>{t('guideWhatsNewTitle', version)}</h2>
    </div><button type="button" className="atlas-release-notes__close" aria-label={t('close')} onClick={onClose}><X size={18} /></button></header>
    <div className="atlas-release-notes__body" tabIndex={0} role="region" aria-label={zh ? '版本更新详情' : 'Release details'}>
      {release ? <>
        <h3 className="atlas-release-notes__title">{release.title[language]}</h3>
        <p className="atlas-release-notes__summary">{release.summary[language]}</p>
        {release.sections.map((section) => <section className="atlas-release-notes__section" key={section.type}>
          <h3>{categories[section.type]}</h3>
          <ul className="atlas-release-notes__changes">{section.items.map((item, index) => <li key={index}>
            <h4>{item.title[language]}</h4><p>{item.description[language]}</p>
            {item.where && <p className="atlas-release-notes__where">{zh ? '入口：' : 'Find it: '}{item.where[language]}</p>}
          </li>)}</ul>
        </section>)}
        <section className="atlas-release-notes__section"><h3>{zh ? '开始使用' : 'Get started'}</h3>
          <ol>{release.gettingStarted.map((item, index) => <li key={index}>{item[language]}</li>)}</ol>
        </section>
        <section className="atlas-release-notes__section"><h3>{zh ? '更新须知' : 'Before you update'}</h3>
          <ul>{release.notices.map((item, index) => <li key={index}>{item[language]}</li>)}</ul>
        </section>
      </> : <p>{zh ? '本机未附带此版本的详细说明，请查看完整版本记录。' : 'Detailed notes for this version are not bundled. See the release archive.'}</p>}
    </div>
    <footer className="atlas-release-notes__footer">
      {chapter && onStartGuide && <button type="button" className="atlas-release-notes__tour" onClick={() => { onClose(); onStartGuide(chapter); }}>{zh ? '体验本次新功能' : 'Try the new workflow'}</button>}
      <a target="_blank" rel="noopener noreferrer" href={release ? `${archive}/tag/v${encodeURIComponent(release.version)}` : archive}><Github size={15} aria-hidden="true" />{zh ? '完整更新日志' : 'Full release notes'}</a>
      <button type="button" className="atlas-release-notes__done" onClick={onClose}>{t('guideGotIt')}</button>
    </footer>
  </aside>;
}

export function ReleaseInvitation({ onStart, onDefer, onReadNotes }: { onStart: () => void; onDefer: () => void; onReadNotes?: () => void }) {
  useLanguagePreference();
  const zh = getUiLanguage() === 'zh-CN';
  return <aside className="learning-guide atlas-release-invitation" role="dialog" aria-label={zh ? '体验本次新功能' : 'Try what changed'}>
    <h2>{zh ? '花一分钟，试试新的操作方式' : 'Take a minute to try what changed'}</h2>
    <p>{zh ? '只体验这次变化的章节，不会重走已经学过的基础内容。' : 'Only the changed chapter, without repeating your completed basics.'}</p>
    {onReadNotes && <button type="button" className="learning-guide__quiet" onClick={onReadNotes}>{zh ? '查看版本介绍' : 'Read the version introduction'}</button>}
    <footer><button type="button" className="secondary-button" onClick={onDefer}>{zh ? '稍后再说' : 'Not now'}</button><button type="button" className="primary-button learning-guide__primary" onClick={onStart}>{zh ? '体验本次新功能' : 'Try the new workflow'}</button></footer>
  </aside>;
}
