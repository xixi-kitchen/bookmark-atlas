import { useEffect, useId, useRef } from 'react';
import { ArrowRight, FolderTree, LayoutTemplate, Sparkles, X } from 'lucide-react';
import { getUiLanguage, t } from '../i18n';
import './AIOrganizationIntro.css';

type Props = {
  onClose: () => void;
  onOpenCanvas: () => void;
  onOpenOrganizer: () => void;
  onOpenAISettings: () => void;
};

export function AIOrganizationIntro({ onClose, onOpenCanvas, onOpenOrganizer, onOpenAISettings }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const zh = getUiLanguage() === 'zh-CN';

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    heading.current?.focus();
    return () => element?.close();
  }, []);

  return (
    <dialog ref={dialog} className="atlas-ai-intro" aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <header className="atlas-ai-intro__header">
        <Sparkles className="atlas-ai-intro__mark" size={26} aria-hidden="true" />
        <button type="button" className="icon-button" aria-label={t('close')} onClick={onClose}><X size={20} aria-hidden="true" /></button>
        <h2 id={titleId} ref={heading} tabIndex={-1}>{zh ? '用 AI 整理你的书签' : 'Organize your bookmarks with AI'}</h2>
        <p id={descriptionId}>{zh ? 'AI 整理从画布扩展到了书签列表。现在既能排布画布卡片，也能整理浏览器的书签目录。' : 'AI organization now extends from the canvas to your bookmark list. Arrange cards on the canvas or tidy your browser’s bookmark folders.'}</p>
      </header>
      <div className="atlas-ai-intro__body">
        <section className="atlas-ai-intro__workflow">
          <LayoutTemplate size={24} aria-hidden="true" />
          <div>
            <h3>{zh ? '画布视图 · 排布书签卡片' : 'Canvas view · Arrange bookmark cards'}</h3>
            <p>{zh ? '选中卡片后点击「AI 整理」，按你的要求分组、排布并预览。调整应用在画布上。' : 'Select cards and click AI organize to preview groups and layouts based on your instructions. Changes apply to the canvas.'}</p>
            <button type="button" className="secondary-button" onClick={onOpenCanvas}>{zh ? '前往画布' : 'Go to canvas'}<ArrowRight size={15} aria-hidden="true" /></button>
          </div>
        </section>
        <section className="atlas-ai-intro__workflow">
          <FolderTree size={24} aria-hidden="true" />
          <div>
            <h3>{zh ? '列表视图 · 整理浏览器书签' : 'Bookmark list · Organize browser bookmarks'}</h3>
            <p>{zh ? '从「整理书签」选择范围，归入现有文件夹或规划新的目录。检查建议后按需应用，也能从整理记录恢复。' : 'Choose a scope in Organize bookmarks, then sort into existing folders or plan new ones. Review the changes before applying them, and restore a batch from history if needed.'}</p>
            <button type="button" className="primary-button" onClick={onOpenOrganizer}>{zh ? '打开书签整理' : 'Open bookmark organizer'}<ArrowRight size={15} aria-hidden="true" /></button>
          </div>
        </section>
      </div>
      <footer className="atlas-ai-intro__footer">
        <p>{zh ? 'AI 整理需配置兼容服务、模型和 API Key。生成建议前，你可以查看并确认发送的数据。' : 'AI organization uses your own compatible provider, model, and API key. You review and approve what is sent before generating suggestions.'}</p>
        <div className="atlas-ai-intro__actions">
          <button type="button" className="secondary-button" onClick={onOpenAISettings}>{t('aiSettings')}</button>
          <button type="button" className="secondary-button" onClick={onClose}>{t('guideGotIt')}</button>
        </div>
      </footer>
    </dialog>
  );
}
