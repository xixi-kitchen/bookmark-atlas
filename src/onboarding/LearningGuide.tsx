import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { BookOpen, Check, X } from 'lucide-react';
import { getUiLanguage } from '../i18n';
import { useLanguagePreference } from '../i18n/useLanguagePreference';
import type { LearningChapter, LearningProgress, LearningStep } from './learningState';
import { getLearningLabels, getLearningLesson, getLearningRecovery } from './learningContent';
import { startLearningTarget } from './driverTargets';
import './LearningGuide.css';

export type LearningGuideProps = {
  progress: LearningProgress | null;
  onStart: (chapter: LearningChapter) => void;
  onPause: () => void;
  onOpenAISettings: () => void;
  onShowAI: () => void;
  onOpenImport: () => void;
  onDemo: () => void;
  onClose: () => void;
  onResume?: () => void;
  onPreviewLayout?: () => void;
  onLocateBookmarks?: () => void;
  /** Disable highlights while a higher-priority modal, drag or AI task owns interaction. */
  targetsEnabled?: boolean;
};

const chapters: LearningChapter[] = ['basics', 'capture', 'ai'];
const basicSteps: LearningStep[] = ['import', 'open', 'move', 'select', 'presentation', 'layout', 'layout-apply'];
const toolbarSteps = new Set<LearningStep>(['select', 'presentation', 'layout', 'layout-apply', 'ai-start', 'ai-request', 'ai-preview']);
const shortTaskTitles: Record<LearningStep, [string, string]> = {
  welcome: ['开始体验', 'Get started'], import: ['添加书签', 'Add a bookmark'],
  open: ['打开网站', 'Open a website'], move: ['移动书签', 'Move a bookmark'],
  select: ['框选书签', 'Select bookmarks'], presentation: ['切换显示方式', 'Choose a display'],
  layout: ['预览排布', 'Preview a layout'], 'layout-apply': ['审阅并应用排布', 'Review the layout'],
  'basics-done': ['基础体验已完成', 'Basics complete'], capture: ['收藏当前网页', 'Capture a webpage'],
  'ai-start': ['开始 AI 整理', 'Try AI organization'], 'ai-settings': ['配置 AI 服务', 'Configure AI'],
  'ai-request': ['生成 AI 预览', 'Generate an AI preview'], 'ai-preview': ['审阅 AI 建议', 'Review AI suggestions'],
  'ai-done': ['AI 体验已完成', 'AI lesson complete'],
};

export function LearningGuide({ progress, onStart, onPause, onOpenAISettings, onShowAI, onOpenImport, onDemo, onClose, onResume, onPreviewLayout, onLocateBookmarks, targetsEnabled = true }: LearningGuideProps) {
  useLanguagePreference();
  const language = getUiLanguage();
  const labels = getLearningLabels(language);
  const panel = useRef<HTMLElement>(null);
  const refreshTarget = useRef<(() => void) | undefined>(undefined);
  const pointerDown = useRef(false);
  const [missing, setMissing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const contentId = useId();
  const [narrowBounds, setNarrowBounds] = useState<{ top: number; height: number }>();
  const paused = progress?.status === 'paused';
  const active = progress?.status === 'active';
  const step = progress?.step ?? 'welcome';
  const lesson = getLearningLesson(step, language);
  const shortTitle = shortTaskTitles[step][language === 'zh-CN' ? 0 : 1];
  const done = progress?.status === 'completed' || step === 'basics-done' || step === 'ai-done';
  const leaveToolbarSpace = active && toolbarSteps.has(step);
  const dismiss = () => { if (active) onPause(); onClose(); };
  const recoverTarget = (action: () => void) => { action(); refreshTarget.current?.(); };

  // A nonmodal panel never takes focus from the canvas or AI inputs on mount.
  useLayoutEffect(() => {
    const previous = document.activeElement;
    const node = panel.current;
    return () => {
      if (node?.contains(document.activeElement) && previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  // Narrow guides sit above the real bottom controls. Bound their scroll area by
  // measured controls as well as viewport height, including expanded AI reviews.
  // This reads geometry only; the target/canvas are never moved to make room.
  useLayoutEffect(() => {
    const resizeObserver = new ResizeObserver(() => update());
    const update = () => {
      if (!leaveToolbarSpace || window.innerWidth > 680) { setNarrowBounds(undefined); return; }
      const header = document.querySelector<HTMLElement>('.topbar');
      const headerBox = header?.getBoundingClientRect();
      const top = headerBox && headerBox.height > 0 ? Math.ceil(headerBox.bottom + 12) : 96;
      if (header) resizeObserver.observe(header);
      let available = Math.min(window.innerHeight * .4, window.innerHeight - top - 12);
      for (const node of document.querySelectorAll<HTMLElement>('[data-learning-target="selection-tools"], [data-learning-target="preview-actions"], [data-learning-target="ai-organizer"]')) {
        const box = node.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0 || box.bottom <= 0 || box.top >= window.innerHeight || box.right <= 10 || box.left >= window.innerWidth - 10) continue;
        available = Math.min(available, box.top - top - 12);
        resizeObserver.observe(node);
      }
      const height = Math.max(0, Math.floor(available));
      setNarrowBounds((current) => current?.top === top && current.height === height ? current : { top, height });
    };
    const mutations = new MutationObserver(update);
    mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    update();
    return () => {
      resizeObserver.disconnect(); mutations.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [leaveToolbarSpace, step]);

  useEffect(() => {
    const start = () => { pointerDown.current = true; };
    const end = () => { pointerDown.current = false; };
    document.addEventListener('pointerdown', start, true);
    document.addEventListener('pointerup', end, true);
    document.addEventListener('pointercancel', end, true);
    window.addEventListener('blur', end);
    return () => {
      document.removeEventListener('pointerdown', start, true);
      document.removeEventListener('pointerup', end, true);
      document.removeEventListener('pointercancel', end, true);
      window.removeEventListener('blur', end);
    };
  }, []);

  useEffect(() => {
    setMissing(false);
    if (!active || !targetsEnabled || !lesson.target) return;
    const control = startLearningTarget(lesson.target, {
      onUnavailable: () => setMissing(true), onAvailable: () => setMissing(false),
      cue: step === 'move' || step === 'select' ? undefined : (language === 'zh-CN' ? '点这里' : 'Click here'),
    });
    refreshTarget.current = control.refresh;
    return () => { refreshTarget.current = undefined; control.stop(); };
  }, [active, targetsEnabled, lesson.target, step, language]);

  return <aside ref={panel} className="learning-guide" role="dialog" aria-modal="false" aria-label={labels.guide}
    data-step={step} data-placement={leaveToolbarSpace ? 'top' : 'bottom'}
    data-collapsed={collapsed ? 'true' : 'false'}
    data-compact={narrowBounds && narrowBounds.height < 160 ? 'true' : undefined}
    style={narrowBounds === undefined ? undefined : { top: narrowBounds.top, bottom: 'auto', maxHeight: narrowBounds.height }}
    onKeyDown={(event) => {
      const target = event.target as HTMLElement;
      if (event.key !== 'Escape' || pointerDown.current || event.nativeEvent.isComposing || target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      event.stopPropagation(); dismiss();
    }}>
    <header className="learning-guide__header">
      <div className="learning-guide__header-title"><BookOpen size={15} aria-hidden="true" />
        <span className="learning-guide__eyebrow" hidden={collapsed}>{progress ? labels.chapterNames[progress.chapter] : labels.firstTime}</span>
        <span className={collapsed ? 'learning-guide__task-title' : 'learning-guide__announcement'} aria-live="polite" aria-atomic="true">{shortTitle}</span>
      </div>
      <button type="button" className="learning-guide__toggle" aria-expanded={!collapsed} aria-controls={contentId} onClick={() => setCollapsed((value) => !value)}>
        {language === 'zh-CN' ? (collapsed ? '展开提示' : '收起提示') : (collapsed ? 'Expand hint' : 'Collapse hint')}
      </button>
      <button type="button" className="learning-guide__close" aria-label={labels.close} onClick={dismiss}><X size={17} /></button>
    </header>
    <div id={contentId} className="learning-guide__content" hidden={collapsed}>
    <h2>{paused ? labels.paused : done && progress?.chapter === 'capture' ? (language === 'zh-CN' ? '网页已经收进画布' : 'Your webpage is saved') : lesson.title}</h2>
    <p>{paused ? labels.pausedBody : done && progress?.chapter === 'capture' ? (language === 'zh-CN' ? '随手收藏已完成。可以继续浏览，之后再回到画布整理。' : 'You have captured a webpage. Keep browsing and return to organize it whenever you like.') : lesson.body}</p>
    {!paused && <p className="learning-guide__note">{lesson.note}</p>}
    {!progress && <div className="learning-guide__actions">
      <button className="learning-guide__primary" type="button" onClick={() => onStart('basics')}>{labels.start}</button>
      <button type="button" className="learning-guide__quiet" onClick={onClose}>{labels.explore}</button>
    </div>}
    {paused && onResume && <button type="button" className="learning-guide__primary" onClick={onResume}>{labels.resume}</button>}
    {active && !done && <>
      {['import', 'select', 'ai-start', 'ai-settings', 'ai-request'].includes(step) && <div
        className="learning-guide__lesson-actions" role="group" aria-label={language === 'zh-CN' ? '教学操作' : 'Lesson actions'}>
      {step === 'import' && <button type="button" className="learning-guide__primary" onClick={onOpenImport}>{labels.import}</button>}
      {(step === 'select' || step === 'ai-start') && <button type="button" onClick={onOpenImport}>{labels.addBookmark}</button>}
      {(step === 'ai-start' || step === 'ai-settings') && <div className="learning-guide__actions">
        <button data-learning-target="ai-settings-guide" type="button" className="learning-guide__primary" onClick={onOpenAISettings}>{labels.configure}</button>
        <button data-learning-target="ai-open-guide" type="button" onClick={onShowAI}>{labels.organizer}</button>
        <button type="button" className="learning-guide__quiet" onClick={onDemo}>{labels.demo}</button>
      </div>}
      {step === 'ai-request' && <button data-learning-target="ai-open-guide" type="button" onClick={onShowAI}>{labels.organizer}</button>}
      </div>}
      {step === 'capture' && <div className="learning-guide__browser" role="img" aria-label={labels.captureBrowser}>
        <span aria-hidden="true">··· <BookOpen size={21} /> → +</span><small>{labels.captureBrowser}</small>
      </div>}
      <p className="learning-guide__waiting" role="status"><span aria-hidden="true" />{labels.waiting}</p>
      {missing && <div className="learning-guide__fallback"><p>{getLearningRecovery(step, language)}</p><div className="learning-guide__actions">
        {(step === 'open' || step === 'move' || step === 'select') && onLocateBookmarks && <button type="button" onClick={() => recoverTarget(onLocateBookmarks)}>{labels.locate}</button>}
        {step === 'layout-apply' && onPreviewLayout && <button type="button" onClick={() => recoverTarget(onPreviewLayout)}>{labels.previewLayout}</button>}
        {step === 'ai-preview' && <button type="button" onClick={() => recoverTarget(onShowAI)}>{labels.organizer}</button>}
        <button type="button" className="learning-guide__quiet" onClick={() => refreshTarget.current?.()}>{labels.retry}</button>
      </div></div>}
    </>}
    {done && <button type="button" className="learning-guide__primary" onClick={onClose}>{labels.continue}</button>}
    {progress && <details className="learning-guide__checklist"><summary>{labels.checklist}</summary><ul>
      {(progress.chapter === 'basics' ? basicSteps : progress.chapter === 'ai' ? ['ai-settings', 'ai-request', 'ai-preview'] as LearningStep[] : ['capture'] as LearningStep[]).map((item) => <li key={item} aria-current={item === step ? 'step' : undefined}>
        {progress.completed.includes(item) ? <Check size={13} aria-hidden="true" /> : <span className="learning-guide__circle" aria-hidden="true" />}
        {getLearningLesson(item, language).title}
      </li>)}
    </ul></details>}
    <details className="learning-guide__chapters" open={!progress || paused || done}><summary>{labels.chapters}</summary><div>
      {chapters.map((chapter) => <button type="button" key={chapter} onClick={() => onStart(chapter)}>{labels.chapterNames[chapter]}{progress?.completedChapters.includes(chapter) && <Check size={14} aria-label={language === 'zh-CN' ? '已完成' : 'Completed'} />}</button>)}
    </div></details>
    {active && !done && <button type="button" className="learning-guide__quiet learning-guide__pause" onClick={dismiss}>{labels.pause}</button>}
    </div>
  </aside>;
}
