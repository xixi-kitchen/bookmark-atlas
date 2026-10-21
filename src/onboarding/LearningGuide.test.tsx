import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LearningGuide } from './LearningGuide';
import { AIWalkthroughDemo } from './AIWalkthroughDemo';
import type { LearningProgress } from './learningState';
import { setLanguagePreference } from '../i18n/languagePreference';
import { subscribeLearningEvents } from './learningEvents';

const progress = (step: LearningProgress['step'] = 'import', status: LearningProgress['status'] = 'active'): LearningProgress => ({
  chapter: 'basics', step, completed: [], completedChapters: [], status,
});
const callbacks = () => ({ onStart: vi.fn(), onPause: vi.fn(), onClose: vi.fn(), onOpenImport: vi.fn(), onOpenAISettings: vi.fn(), onShowAI: vi.fn(), onDemo: vi.fn(), onResume: vi.fn(), onPreviewLayout: vi.fn(), onLocateBookmarks: vi.fn() });

beforeEach(async () => { await setLanguagePreference('en'); });
afterEach(async () => { cleanup(); await setLanguagePreference('auto'); });

describe('LearningGuide', () => {
  it.each(['en', 'zh-CN'] as const)('keeps AI lesson actions in one accessible group with the same callbacks in %s', async (language) => {
    await setLanguagePreference(language);
    const actions = callbacks();
    render(<LearningGuide progress={{ ...progress('ai-start'), chapter: 'ai' }} {...actions} targetsEnabled={false} />);
    const group = screen.getByRole('group', { name: language === 'zh-CN' ? '教学操作' : 'Lesson actions' });
    const names = language === 'zh-CN'
      ? ['再添加一条书签', '配置 AI 服务', '打开 AI 整理', '先看效果演示']
      : ['Add another bookmark', 'Configure AI service', 'Open AI organizer', 'See the offline demo first'];
    expect(within(group).getAllByRole('button')).toHaveLength(4);
    for (const name of names) fireEvent.click(within(group).getByRole('button', { name }));
    expect(actions.onOpenImport).toHaveBeenCalledOnce();
    expect(actions.onOpenAISettings).toHaveBeenCalledOnce();
    expect(actions.onShowAI).toHaveBeenCalledOnce();
    expect(actions.onDemo).toHaveBeenCalledOnce();
    expect(actions.onStart).not.toHaveBeenCalled();
    expect(actions.onPause).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveAttribute('data-step', 'ai-start');
  });

  it.each([
    ['import', 'Import bookmarks', 'onOpenImport'],
    ['select', 'Add another bookmark', 'onOpenImport'],
    ['ai-settings', 'Configure AI service', 'onOpenAISettings'],
    ['ai-request', 'Open AI organizer', 'onShowAI'],
  ] as const)('keeps the %s action in the same lesson operation group without changing its route', (step, name, route) => {
    const actions = callbacks();
    render(<LearningGuide progress={progress(step)} {...actions} targetsEnabled={false} />);
    const group = screen.getByRole('group', { name: 'Lesson actions' });
    fireEvent.click(within(group).getByRole('button', { name }));
    expect(actions[route]).toHaveBeenCalledOnce();
    expect(actions.onStart).not.toHaveBeenCalled();
    expect(actions.onPause).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveAttribute('data-step', step);
  });

  it('offers optional basics and replayable chapters without starting on render', () => {
    const actions = callbacks();
    render(<LearningGuide progress={null} {...actions} />);
    expect(screen.getByRole('dialog', { name: 'Learning guide' })).toHaveAttribute('aria-modal', 'false');
    expect(actions.onStart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Start hands-on basics' }));
    expect(actions.onStart).toHaveBeenCalledWith('basics');
    fireEvent.click(screen.getByRole('button', { name: /Capture a webpage/ }));
    expect(actions.onStart).toHaveBeenCalledWith('capture');
    fireEvent.click(screen.getByRole('button', { name: /AI organization/ }));
    expect(actions.onStart).toHaveBeenCalledWith('ai');
    fireEvent.click(screen.getByRole('button', { name: 'Explore on my own' }));
    expect(actions.onClose).toHaveBeenCalledOnce();
    expect(actions.onPause).not.toHaveBeenCalled();
  });

  it('waits for a real action and lets import opening neither advance nor finish the lesson', () => {
    const actions = callbacks();
    const { rerender } = render(<LearningGuide progress={progress()} {...actions} />);
    expect(screen.getByRole('heading', { name: 'Add a favorite bookmark first' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next|complete/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import bookmarks' }));
    expect(actions.onOpenImport).toHaveBeenCalledOnce();
    expect(screen.getByRole('heading', { name: 'Add a favorite bookmark first' })).toBeInTheDocument();
    rerender(<LearningGuide progress={progress('open')} {...actions} />);
    expect(screen.getByRole('heading', { name: 'Click its icon to open the website' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pause learning' }));
    expect(actions.onPause).toHaveBeenCalledOnce();
    expect(actions.onStart).not.toHaveBeenCalled();
  });

  it('keeps paused progress paused and resumes through its own callback', () => {
    const actions = callbacks();
    render(<LearningGuide progress={progress('move', 'paused')} {...actions} />);
    expect(screen.getByText('Come back whenever you want')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume learning' }));
    expect(actions.onResume).toHaveBeenCalledOnce();
    expect(actions.onStart).not.toHaveBeenCalled();
    expect(screen.queryByText('Waiting for your action')).not.toBeInTheDocument();
  });

  it('closes completed lessons without fabricating a completion action', () => {
    const actions = callbacks();
    render(<LearningGuide progress={progress('basics-done', 'completed')} {...actions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue using the canvas' }));
    expect(actions.onClose).toHaveBeenCalledOnce();
    expect(actions.onStart).not.toHaveBeenCalled();
    expect(actions.onPause).not.toHaveBeenCalled();
  });

  it('recognizes successful capture without teaching a new real save', () => {
    render(<LearningGuide progress={{ ...progress('capture', 'completed'), chapter: 'capture' }} {...callbacks()} />);
    expect(screen.getByRole('heading', { name: 'Your webpage is saved' })).toBeInTheDocument();
    expect(screen.queryByText('Waiting for your action')).not.toBeInTheDocument();
  });

  it('does not consume canvas Escape, arrow keys, editable Escape, or drag Escape', () => {
    const actions = callbacks();
    render(<LearningGuide progress={progress()} {...actions} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
    const field = document.createElement('input');
    screen.getByRole('dialog').appendChild(field);
    fireEvent.keyDown(field, { key: 'Escape' });
    const editable = document.createElement('div'); editable.setAttribute('contenteditable', '');
    screen.getByRole('dialog').appendChild(editable);
    fireEvent.keyDown(editable, { key: 'Escape' });
    fireEvent.pointerDown(document.body, { buttons: 1 });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Import bookmarks' }), { key: 'Escape' });
    expect(actions.onPause).not.toHaveBeenCalled();
    field.remove(); editable.remove();
    fireEvent.pointerUp(document.body);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Import bookmarks' }), { key: 'Escape' });
    expect(actions.onPause).toHaveBeenCalledOnce();
  });

  it('restores the invoking control when the guide unmounts and focus was inside it', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger); trigger.focus();
    const view = render(<LearningGuide progress={null} {...callbacks()} />);
    screen.getByRole('button', { name: 'Start hands-on basics' }).focus();
    view.unmount();
    expect(trigger).toHaveFocus(); trigger.remove();
  });

  it('renders Chinese and exposes bounded target recovery without offering completion', async () => {
    await setLanguagePreference('zh-CN');
    render(<LearningGuide progress={progress()} {...callbacks()} />);
    expect(screen.getByRole('dialog', { name: '使用指南' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '先放一条常用书签' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导入书签' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '下一步' })).not.toBeInTheDocument();
  });

  it('offers configuration, organization and a labelled offline demo through separate actions', () => {
    const actions = callbacks();
    render(<LearningGuide progress={{ ...progress('ai-start'), chapter: 'ai' }} {...actions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Configure AI service' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open AI organizer' }));
    fireEvent.click(screen.getByRole('button', { name: 'See the offline demo first' }));
    expect(actions.onOpenAISettings).toHaveBeenCalledOnce();
    expect(actions.onShowAI).toHaveBeenCalledOnce();
    expect(actions.onDemo).toHaveBeenCalledOnce();
    expect(actions.onStart).not.toHaveBeenCalled();
  });

  it('keeps progress unchanged when a target times out and makes explicit retry available', async () => {
    vi.useFakeTimers();
    try {
      const actions = callbacks();
      render(<LearningGuide progress={progress()} {...actions} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(1700); });
      expect(screen.getByRole('button', { name: 'Find the target again' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Add a favorite bookmark first' })).toBeInTheDocument();
      expect(actions.onStart).not.toHaveBeenCalled(); expect(actions.onPause).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Find the target again' }));
      expect(screen.getByRole('heading', { name: 'Add a favorite bookmark first' })).toBeInTheDocument();
      cleanup();
    } finally { vi.useRealTimers(); }
  });
});

describe.each([
  { language: 'en' as const, add: 'Add another bookmark', locate: 'Locate canvas bookmarks', preview: 'Preview the layout again', organizer: 'Open AI organizer', reselect: /Reselect at least two bookmarks from empty canvas space/, lostLayout: /The unsaved layout preview is no longer available/, lostAI: /The AI preview was not retained/ },
  { language: 'zh-CN' as const, add: '再添加一条书签', locate: '定位画布书签', preview: '重新预览排布', organizer: '打开 AI 整理', reselect: /从空白处重新框选至少两张书签/, lostLayout: /未保存的排布预览已不在当前画布/, lostAI: /AI 预览未保留/ },
])('Learning recovery ($language)', (copy) => {
  beforeEach(async () => { await setLanguagePreference(copy.language); vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });
  const waitForTarget = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(1700); }); };

  it.each(['select', 'ai-start'] as const)('always offers adding another bookmark during %s without restarting the course', (step) => {
    const actions = callbacks();
    render(<LearningGuide progress={{ ...progress(step), chapter: step === 'ai-start' ? 'ai' : 'basics' }} {...actions} />);
    fireEvent.click(screen.getByRole('button', { name: copy.add }));
    expect(actions.onOpenImport).toHaveBeenCalledOnce();
    expect(actions.onStart).not.toHaveBeenCalled(); expect(actions.onPause).not.toHaveBeenCalled();
    expect(actions.onLocateBookmarks).not.toHaveBeenCalled();
  });

  it.each(['presentation', 'layout'] as const)('explains how to recover selection tools during %s', async (step) => {
    render(<LearningGuide progress={progress(step)} {...callbacks()} />);
    await waitForTarget();
    expect(screen.getByText(copy.reselect)).toBeInTheDocument();
  });

  it('rebuilds a lost layout preview only through an explicit action and keeps progress', async () => {
    const actions = callbacks(); const learned = vi.fn(); const unsubscribe = subscribeLearningEvents(learned);
    render(<LearningGuide progress={progress('layout-apply')} {...actions} />);
    await waitForTarget();
    expect(screen.getByText(copy.lostLayout)).toBeInTheDocument();
    expect(actions.onPreviewLayout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: copy.preview }));
    expect(actions.onPreviewLayout).toHaveBeenCalledOnce();
    expect(actions.onStart).not.toHaveBeenCalled(); expect(learned).not.toHaveBeenCalled(); unsubscribe();
    expect(screen.queryByRole('button', { name: /next|complete|下一步|完成此步/i })).not.toBeInTheDocument();
  });

  it('reopens the AI organizer for a discarded preview without generating or completing anything', async () => {
    const actions = callbacks(); const learned = vi.fn(); const unsubscribe = subscribeLearningEvents(learned);
    render(<LearningGuide progress={{ ...progress('ai-preview'), chapter: 'ai' }} {...actions} />);
    await waitForTarget();
    expect(screen.getByText(copy.lostAI)).toBeInTheDocument();
    expect(actions.onShowAI).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: copy.organizer }));
    expect(actions.onShowAI).toHaveBeenCalledOnce(); expect(actions.onStart).not.toHaveBeenCalled();
    expect(learned).not.toHaveBeenCalled(); unsubscribe();
  });

  it.each(['open', 'move', 'select'] as const)('locates an absent bookmark only when requested during %s', async (step) => {
    const actions = callbacks();
    render(<LearningGuide progress={progress(step)} {...actions} />);
    await waitForTarget();
    expect(actions.onLocateBookmarks).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: copy.locate }));
    expect(actions.onLocateBookmarks).toHaveBeenCalledOnce();
    expect(actions.onStart).not.toHaveBeenCalled(); expect(actions.onPause).not.toHaveBeenCalled();
  });
});

describe('Narrow learning guide geometry', () => {
  const originalWidth = window.innerWidth; const originalHeight = window.innerHeight;
  afterEach(() => {
    cleanup(); document.querySelectorAll('[data-learning-target], .topbar').forEach((node) => node.remove());
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalHeight });
    vi.restoreAllMocks();
  });

  it.each([
    { width: 390, height: 844, headerHeight: 132, targetTop: 684, targetHeight: 96, step: 'ai-start' as const, target: 'selection-tools' },
    { width: 390, height: 844, headerHeight: 132, targetTop: 684, targetHeight: 96, step: 'presentation' as const, target: 'selection-tools' },
    { width: 320, height: 568, headerHeight: 164, targetTop: 396, targetHeight: 108, step: 'layout' as const, target: 'selection-tools' },
    { width: 320, height: 568, headerHeight: 164, targetTop: 260, targetHeight: 244, step: 'ai-preview' as const, target: 'preview-actions' },
    { width: 390, height: 400, headerHeight: 84, targetTop: 186, targetHeight: 150, step: 'layout-apply' as const, target: 'preview-actions' },
    { width: 390, height: 844, headerHeight: 0, targetTop: 684, targetHeight: 96, step: 'ai-request' as const, target: 'selection-tools' },
    { width: 320, height: 640, headerHeight: 101, targetTop: 480, targetHeight: 96, step: 'ai-start' as const, target: 'selection-tools' },
  ])('keeps $step above the real $target at $width×$height', (fixture) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: fixture.width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: fixture.height });
    const target = document.createElement('section'); target.dataset.learningTarget = fixture.target; document.body.appendChild(target);
    const header = document.createElement('header'); header.className = 'topbar'; document.body.appendChild(header);
    const rect = (x: number, y: number, width: number, height: number) => ({ x, y, left: x, top: y, right: x + width, bottom: y + height, width, height, toJSON() {} });
    const nativeRect = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this === target) return rect(12, fixture.targetTop, fixture.width - 24, fixture.targetHeight);
      if (this === header) return rect(0, 0, fixture.width, fixture.headerHeight);
      if (this.classList.contains('learning-guide')) {
        // jsdom has no layout engine: supplied intrinsic size matches the observed
        // browser panel. Inline layout bounds are applied as a browser would apply them.
        const height = Math.min(379.8, this.style.maxHeight ? Number.parseFloat(this.style.maxHeight) : 379.8);
        const y = this.style.top ? Number.parseFloat(this.style.top) : fixture.height - height - 10;
        return rect(10, y, fixture.width - 20, height);
      }
      return nativeRect.call(this);
    });
    const actions = callbacks();
    const view = render(<LearningGuide progress={{ ...progress(fixture.step), chapter: fixture.step.startsWith('ai-') ? 'ai' : 'basics' }} {...actions} />);
    const panel = screen.getByRole('dialog', { name: 'Learning guide' });
    const guideBox = panel.getBoundingClientRect(); const targetBox = target.getBoundingClientRect();
    expect(guideBox.bottom + 12).toBeLessThanOrEqual(targetBox.top);
    expect(guideBox.top).toBe(fixture.headerHeight > 0 ? fixture.headerHeight + 12 : 96);
    expect(panel).toHaveAttribute('data-step', fixture.step);
    expect(panel).toHaveAttribute('data-collapsed', 'false');
    expect(guideBox.height).toBeLessThanOrEqual(fixture.height * .4);
    expect(target.parentElement).toBe(document.body);
    expect(actions.onStart).not.toHaveBeenCalled(); expect(actions.onPause).not.toHaveBeenCalled();
    view.unmount();
  });
});

describe.each([
  { language: 'en' as const, collapse: 'Collapse hint', expand: 'Expand hint', guide: 'Learning guide', title: 'Generate an AI preview' },
  { language: 'zh-CN' as const, collapse: '收起提示', expand: '展开提示', guide: '使用指南', title: '生成 AI 预览' },
])('Collapsible learning hint ($language)', (copy) => {
  it('keeps the user’s collapsed choice across real steps without changing progress or losing keyboard focus', async () => {
    await setLanguagePreference(copy.language);
    const actions = callbacks();
    const view = render(<LearningGuide progress={{ ...progress('ai-start'), chapter: 'ai' }} {...actions} targetsEnabled={false} />);
    expect(screen.getByRole('heading')).toBeVisible();
    const collapse = screen.getByRole('button', { name: copy.collapse }); collapse.focus();
    fireEvent.click(collapse);
    const expand = screen.getByRole('button', { name: copy.expand });
    expect(expand).toHaveAttribute('aria-expanded', 'false'); expect(expand).toHaveFocus();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
    view.rerender(<LearningGuide progress={{ ...progress('ai-request'), chapter: 'ai' }} {...actions} targetsEnabled={false} />);
    expect(screen.getByRole('button', { name: copy.expand })).toBeInTheDocument();
    const announcement = screen.getByText(copy.title);
    expect(announcement).toHaveAttribute('aria-live', 'polite');
    expect(announcement).toHaveAttribute('aria-atomic', 'true');
    expect(screen.getByRole('dialog', { name: copy.guide })).toHaveAttribute('data-step', 'ai-request');
    fireEvent.click(screen.getByRole('button', { name: copy.expand }));
    expect(screen.getByRole('heading')).toBeVisible();
    expect(screen.getByRole('button', { name: copy.collapse })).toHaveFocus();
    expect(actions.onPause).not.toHaveBeenCalled(); expect(actions.onClose).not.toHaveBeenCalled();
    expect(actions.onStart).not.toHaveBeenCalled(); expect(actions.onShowAI).not.toHaveBeenCalled();
  });
});

it('keeps the same real Driver highlight alive when the hint is collapsed and expanded', async () => {
  vi.useFakeTimers();
  const target = document.createElement('button'); target.dataset.learningTarget = 'import';
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ x: 10, y: 10, top: 10, left: 10, right: 90, bottom: 50, width: 80, height: 40, toJSON() {} });
  document.body.appendChild(target);
  try {
    render(<LearningGuide progress={progress()} {...callbacks()} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    const overlay = document.querySelector('.driver-overlay'); expect(overlay).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse hint' }));
    expect(target).toHaveClass('driver-active-element');
    expect(document.querySelector('.driver-overlay')).toBe(overlay);
    fireEvent.click(screen.getByRole('button', { name: 'Expand hint' }));
    expect(document.querySelector('.driver-overlay')).toBe(overlay);
  } finally { cleanup(); target.remove(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); }
});

it.each(['en', 'zh-CN'] as const)('shows a localized passive click cue and removes it for drag lessons in %s', async (language) => {
  await setLanguagePreference(language);
  vi.useFakeTimers();
  const target = document.createElement('button'); target.dataset.learningTarget = 'import';
  const box = { x: 10, y: 10, top: 10, left: 10, right: 90, bottom: 50, width: 80, height: 40, toJSON() {} };
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(box);
  const bookmark = document.createElement('div'); bookmark.dataset.learningTarget = 'bookmark';
  vi.spyOn(bookmark, 'getBoundingClientRect').mockReturnValue(box);
  document.body.append(target, bookmark);
  try {
    const view = render(<LearningGuide progress={progress()} {...callbacks()} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(document.querySelector('.learning-target-cue')).toHaveTextContent(language === 'zh-CN' ? '点这里' : 'Click here');
    for (const step of ['move', 'select'] as const) {
      view.rerender(<LearningGuide progress={progress(step)} {...callbacks()} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(50); });
      expect(bookmark).toHaveClass('driver-active-element');
      expect(document.querySelector('.learning-target-cue')).toBeNull();
    }
    view.unmount();
    expect(document.querySelector('.driver-overlay')).toBeNull();
  } finally { cleanup(); target.remove(); bookmark.remove(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); }
});

it('points an AI start lesson at configuration when there is no toolbar selection', async () => {
  vi.useFakeTimers();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 10, y: 100, top: 100, left: 10, right: 150, bottom: 140, width: 140, height: 40, toJSON() {} });
  try {
    const actions = callbacks();
    render(<LearningGuide progress={{ ...progress('ai-start'), chapter: 'ai' }} {...actions} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    const button = screen.getByRole('button', { name: 'Configure AI service' });
    expect(button).toHaveClass('driver-active-element');
    expect(screen.getByRole('button', { name: 'Open AI organizer' })).not.toHaveClass('driver-active-element');
    expect(document.querySelector('.learning-target-cue')).toHaveTextContent('Click here');
    fireEvent.click(button);
    expect(actions.onOpenAISettings).toHaveBeenCalledOnce();
    expect(actions.onStart).not.toHaveBeenCalled();
  } finally { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); }
});

it('updates the live cue language on the same lesson and target without restarting progress', async () => {
  vi.useFakeTimers();
  const target = document.createElement('button'); target.dataset.learningTarget = 'import';
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ x: 10, y: 10, top: 10, left: 10, right: 90, bottom: 50, width: 80, height: 40, toJSON() {} });
  document.body.appendChild(target);
  try {
    const actions = callbacks();
    render(<LearningGuide progress={progress()} {...actions} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(document.querySelector('.learning-target-cue')).toHaveTextContent('Click here');
    await act(async () => { await setLanguagePreference('zh-CN'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(document.querySelector('.learning-target-cue')).toHaveTextContent('点这里');
    expect(target).toHaveClass('driver-active-element');
    expect(screen.getByRole('dialog', { name: '使用指南' })).toHaveAttribute('data-step', 'import');
    expect(actions.onStart).not.toHaveBeenCalled();
    expect(actions.onPause).not.toHaveBeenCalled();
  } finally { cleanup(); target.remove(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); }
});

describe('AIWalkthroughDemo', () => {
  it('shows a fixed local preview with no real apply, network request, or storage change', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const storageSpy = vi.spyOn(localStorage, 'setItem');
    const close = vi.fn();
    const learned = vi.fn(); const unsubscribe = subscribeLearningEvents(learned);
    render(<AIWalkthroughDemo onClose={close} />);
    expect(screen.getByRole('dialog', { name: 'Offline AI demonstration' })).toBeInTheDocument();
    expect(screen.getByText(/No real AI request/)).toBeInTheDocument();
    expect(screen.getByText('React documentation')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show sample preview' }));
    expect(screen.getByText('Learning & creation')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^apply/i })).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storageSpy).not.toHaveBeenCalled();
    expect(learned).not.toHaveBeenCalled(); unsubscribe();
    fireEvent.click(screen.getByRole('button', { name: 'Close demonstration' }));
    expect(close).toHaveBeenCalledOnce();
    fetchSpy.mockRestore(); storageSpy.mockRestore();
  });
});
