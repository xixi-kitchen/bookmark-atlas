import { useLayoutEffect, useRef, useState } from 'react';
import { BookOpen, X } from 'lucide-react';
import { getUiLanguage } from '../i18n';
import { useLanguagePreference } from '../i18n/useLanguagePreference';
import './LearningGuide.css';

export type AIWalkthroughDemoProps = { onClose: () => void; onOpenAISettings?: () => void };
const samples = [
  { name: 'React documentation', zh: 'React 文档', domain: 'react.dev' },
  { name: 'Excalidraw', zh: 'Excalidraw', domain: 'excalidraw.com' },
  { name: 'MDN Web Docs', zh: 'MDN Web Docs', domain: 'developer.mozilla.org' },
  { name: 'YouTube', zh: 'YouTube', domain: 'youtube.com' },
];

/** Static teaching data only: no business objects, scene callbacks, storage or AI clients. */
export function AIWalkthroughDemo({ onClose, onOpenAISettings }: AIWalkthroughDemoProps) {
  useLanguagePreference();
  const zh = getUiLanguage() === 'zh-CN';
  const [preview, setPreview] = useState(false);
  const panel = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const previous = document.activeElement;
    const node = panel.current;
    return () => { if (node?.contains(document.activeElement) && previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  const closeLabel = zh ? '关闭演示' : 'Close demonstration';
  return <aside ref={panel} className="learning-demo" role="dialog" aria-modal="false" aria-label={zh ? 'AI 离线教学演示' : 'Offline AI demonstration'}
    onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <header className="learning-guide__header"><span className="learning-guide__eyebrow">{zh ? 'AI 整理 · 内置教学示例' : 'AI organization · Built-in teaching sample'}</span><button type="button" className="learning-guide__close" aria-label={zh ? '关闭 AI 教学演示' : 'Close offline AI demonstration'} onClick={onClose}><X size={17} /></button></header>
    <h2>{zh ? '先看效果，不必先准备 Key' : 'See the idea before preparing a key'}</h2>
    <p className="learning-demo__disclaimer">{zh ? '未调用真实 AI，不发送数据，不产生服务商费用。演示不会修改真实画布、创建书签或完成真实 AI 任务。' : 'No real AI request, data transfer or provider charges. This demo does not change your canvas, create bookmarks or complete real AI tasks.'}</p>
    <ol className="learning-demo__flow"><li>{zh ? '选中示例书签' : 'Select sample bookmarks'}</li><li>{zh ? '提出整理要求' : 'Describe the organization'}</li><li>{zh ? '审阅示例预览' : 'Review a sample preview'}</li></ol>
    <blockquote>{zh ? '按学习与创作、参考与灵感分组，使用简洁卡片。' : 'Group by learning & creation and reference & inspiration. Use compact cards.'}</blockquote>
    <div className="learning-demo__samples" aria-label={zh ? '固定示例书签' : 'Fixed sample bookmarks'}>
      {(preview ? [samples.slice(0, 2), samples.slice(2)] : [samples]).map((group, index) => <section key={index} className={preview ? 'learning-demo__group' : ''}>
        {preview && <h3>{index === 0 ? (zh ? '学习与创作' : 'Learning & creation') : (zh ? '参考与灵感' : 'Reference & inspiration')}</h3>}
        {group.map((sample) => <div className="learning-demo__card" key={sample.domain}><BookOpen size={18} aria-hidden="true" /><span><strong>{zh ? sample.zh : sample.name}</strong><small>{sample.domain}</small></span></div>)}
      </section>)}
    </div>
    {preview && <p role="status" className="learning-guide__note">{zh ? '这是演示预览。真实流程中，只有你确认「应用」才会改动画布，之后仍可撤销。' : 'This is a demonstration preview. In the real workflow, only your confirmation applies changes, and you can undo them afterwards.'}</p>}
    <div className="learning-guide__actions">
      <button type="button" className="learning-guide__primary" onClick={() => setPreview((value) => !value)}>{preview ? (zh ? '重看示例选择' : 'Replay sample selection') : (zh ? '查看示例预览' : 'Show sample preview')}</button>
      {onOpenAISettings && <button type="button" onClick={onOpenAISettings}>{zh ? '去配置 AI 服务' : 'Configure my AI service'}</button>}
      <button type="button" className="learning-guide__quiet" onClick={onClose}>{closeLabel}</button>
    </div>
  </aside>;
}
