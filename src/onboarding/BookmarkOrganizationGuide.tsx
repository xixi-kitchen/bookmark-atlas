import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, BookOpen, FolderTree, RotateCcw, X } from 'lucide-react';
import { getUiLanguage } from '../i18n';
import '../bookmarks/organization/Organization.css';
import './BookmarkOrganizationGuide.css';

type Props = { onClose: () => void; onOpenOrganizer: () => void };
type Step = 'scope' | 'preview' | 'applied' | 'restored';

export function BookmarkOrganizationGuide({ onClose, onOpenOrganizer }: Props) {
  const zh = getUiLanguage() === 'zh-CN';
  const text = (en: string, chinese: string) => zh ? chinese : en;
  const [step, setStep] = useState<Step>('scope');
  const [mode, setMode] = useState<'daily' | 'advanced'>('daily');
  const [unchecked, setUnchecked] = useState<number[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();

  useEffect(() => {
    const modal = dialog.current;
    modal?.showModal();
    return () => modal?.close();
  }, []);

  useEffect(() => {
    heading.current?.focus();
  }, [step]);

  const samples = [
    { title: 'React Quick Start', folder: text('Development', '开发') },
    { title: 'Excalidraw', folder: text('Design', '设计') },
  ];
  const inbox = text('Other bookmarks / Bookmark Atlas', '其他书签 / Bookmark Atlas');
  const included = samples.length - unchecked.length;
  const applied = step === 'applied';
  const isResult = applied || step === 'restored';

  return (
    <dialog
      ref={dialog}
      className="atlas-native-organizer atlas-organization-guide"
      aria-labelledby={headingId}
      onCancel={event => { event.preventDefault(); onClose(); }}
    >
      <header>
        <div>
          <h2 id={headingId}><BookOpen size={20} aria-hidden="true" />{text('Bookmark organization guide', '书签整理引导')}</h2>
          <p>{text('Offline practice with sample bookmarks.', '使用示例书签在本机离线练习。')}</p>
        </div>
        <button className="icon-button" type="button" aria-label={text('Close guide', '关闭引导')} onClick={onClose}><X size={19} aria-hidden="true" /></button>
      </header>

      <ol className="atlas-organization-guide__steps" aria-label={text('Practice steps', '演练步骤')}>
        {[text('Choose a mode', '选择模式'), text('Review a plan', '检查方案'), text('Apply and restore', '应用与恢复')].map((label, index) => (
          <li key={label} aria-current={index === (step === 'scope' ? 0 : step === 'preview' ? 1 : 2) ? 'step' : undefined}>{index + 1}. {label}</li>
        ))}
      </ol>

      <div className="atlas-native-body">
        {step === 'scope' && <>
          <h3 ref={heading} tabIndex={-1}>{text('Choose how to organize two sample bookmarks', '选择如何整理两条示例书签')}</h3>
          <p>{text('New saves go to Bookmark Atlas by default. You can also choose a folder from the toolbar popup.', '新收藏默认进入 Bookmark Atlas，也可以在工具栏弹窗里直接选择文件夹。')}</p>
          <p>{text('In the organizer, choose plugin captures, a folder, selected bookmarks, or your whole library.', '打开正式整理窗口后，可选择插件收藏待整理、指定文件夹、当前选中项或全部书签。')}</p>
          <fieldset className="atlas-organization-guide__modes">
            <legend>{text('Organization mode', '整理模式')}</legend>
            <label><input type="radio" name={headingId} checked={mode === 'daily'} onChange={() => setMode('daily')} />
              <span><strong>{text('Daily sorting', '日常归类')}</strong><small>{text('Move bookmarks into folders you already use.', '把书签移动到已有的文件夹。')}</small></span>
            </label>
            <label><input type="radio" name={headingId} checked={mode === 'advanced'} onChange={() => setMode('advanced')} />
              <span><strong>{text('Advanced folder planning', '高级目录重构')}</strong><small>{text('Plan new folders under a parent folder you choose, then review the directory changes.', '在选定的位置规划新分类，再预览目录调整。')}</small></span>
            </label>
          </fieldset>
        </>}

        {step === 'preview' && <>
          <h3 ref={heading} tabIndex={-1}>{text('Review the sample plan', '检查示例整理方案')}</h3>
          <p>{text('In the organizer, AI suggestions show the titles, domains, and folders you can approve for sending. You can also choose a destination manually.', '正式整理时，AI 建议会先显示待发送的标题、域名和候选目录，供你确认。也可以手动指定目标目录。')}</p>
          <ul className="atlas-organization-guide__bookmarks">
            {samples.map((sample, index) => <li key={sample.title}>
              <label>
                <input type="checkbox" checked={!unchecked.includes(index)} onChange={event => {
                  const checked = event.target.checked;
                  setUnchecked(items => checked ? items.filter(item => item !== index) : [...items, index]);
                }} />
                <span><strong>{sample.title}</strong><small>{inbox} → {sample.folder}{mode === 'advanced' && text(' (new folder)', '（新建目录）')}</small></span>
              </label>
            </li>)}
          </ul>
          <p className="atlas-native-hint">{text('Uncheck an item to keep it in the inbox. A new folder is created only for a selected move in this example.', '取消勾选可让书签留在待整理目录。此示例仅为已勾选的移动创建所需目录。')}</p>
        </>}

        {isResult && <>
          <h3 ref={heading} tabIndex={-1}>{applied ? text('Sample changes applied', '示例调整已应用') : text('Sample bookmarks restored', '示例书签已恢复')}</h3>
          <ul className="atlas-organization-guide__bookmarks" aria-label={text('Sample bookmark locations', '示例书签位置')}>
            {samples.map((sample, index) => <li key={sample.title}>
              <FolderTree size={17} aria-hidden="true" />
              <span><strong>{sample.title}</strong><small>{applied && !unchecked.includes(index) ? sample.folder : inbox}</small></span>
            </li>)}
          </ul>
          <p role="status">{applied
            ? text('After a successful real apply, the organizer closes. Reopen it and choose Organization history to restore a batch.', '正式整理全部应用成功后，弹窗会关闭。需要恢复时，重新打开弹窗并进入「整理记录」。')
            : text('Both sample bookmarks are back in Bookmark Atlas. In a real restore, check any items Chrome changed in the meantime.', '两条示例书签已回到 Bookmark Atlas。正式恢复时，如有书签在此期间被修改，可在记录中检查冲突。')}</p>
        </>}
      </div>

      <footer className="atlas-organization-guide__footer">
        {step === 'scope' && <button type="button" className="primary-button" onClick={() => setStep('preview')}>{text('Preview sample plan', '预览示例方案')}<ArrowRight size={16} aria-hidden="true" /></button>}
        {step === 'preview' && <>
          <button type="button" className="secondary-button" onClick={() => setStep('scope')}>{text('Back', '上一步')}</button>
          <button type="button" className="primary-button" disabled={!included} onClick={() => setStep('applied')}>{text(`Apply in practice (${included})`, `模拟应用（${included}）`)}</button>
        </>}
        {step === 'applied' && <button type="button" className="primary-button" onClick={() => setStep('restored')}><RotateCcw size={16} aria-hidden="true" />{text('Restore sample bookmarks', '恢复示例书签')}</button>}
        {step === 'restored' && <>
          <button type="button" className="secondary-button" onClick={() => { setUnchecked([]); setStep('scope'); }}>{text('Practice again', '再练习一次')}</button>
          <button type="button" className="primary-button" onClick={onOpenOrganizer}>{text('Open bookmark organizer', '打开书签整理')}</button>
        </>}
      </footer>
    </dialog>
  );
}
