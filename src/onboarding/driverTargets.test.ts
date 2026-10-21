import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startLearningTarget } from './driverTargets';
import { getLearningLesson } from './learningContent';

const rect = { x: 10, y: 10, top: 10, left: 10, right: 90, bottom: 50, width: 80, height: 40, toJSON() {} };
let stop: (() => void) | undefined;
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] }); });
afterEach(() => { stop?.(); document.body.innerHTML = ''; vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

function target(name = 'import') {
  const element = document.createElement('button');
  element.dataset.learningTarget = name;
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect);
  document.body.appendChild(element);
  return element;
}

describe('Driver learning target adapter', () => {
  it('points import at the first enabled visible individual bookmark, then the picker when none remain', async () => {
    const background = target();
    const picker = target('picker');
    const imported = target('picker-add'); imported.disabled = true;
    const hidden = target('picker-add'); hidden.hidden = true;
    const add = target('picker-add');
    picker.append(imported, hidden, add);
    const control = startLearningTarget('import', { cue: 'Click here' }); stop = control.stop;
    await vi.advanceTimersByTimeAsync(50);
    expect(add).toHaveClass('driver-active-element');
    expect(picker).not.toHaveClass('driver-active-element');
    expect(background).not.toHaveClass('driver-active-element');
    add.disabled = true;
    await vi.advanceTimersByTimeAsync(150);
    expect(picker).toHaveClass('driver-active-element');
    expect(background).not.toHaveClass('driver-active-element');
    expect(document.querySelector('.learning-target-cue')).toBeNull();
  });

  it.each([
    ['open', 'bookmark', 'bookmark-open'],
    ['presentation', 'selection-tools', 'presentation-option'],
    ['layout', 'selection-tools', 'layout-preview'],
    ['layout-apply', 'preview-actions', 'preview-apply'],
    ['ai-preview', 'preview-actions', 'preview-apply'],
    ['ai-start', 'ai-organizer', 'ai-open'],
  ] as const)('highlights the actual %s action rather than its surrounding panel', async (step, panelName, actionName) => {
    const panel = target(panelName);
    const action = target(actionName); panel.appendChild(action);
    const control = startLearningTarget(getLearningLesson(step, 'en').target!); stop = control.stop;
    await vi.advanceTimersByTimeAsync(50);
    expect(action).toHaveClass('driver-active-element');
    expect(panel).not.toHaveClass('driver-active-element');
  });

  it('skips disabled, aria-disabled and already selected display buttons and follows the next changeable style', async () => {
    const disabled = target('presentation-option'); disabled.disabled = true;
    const ariaDisabled = target('presentation-option'); ariaDisabled.setAttribute('aria-disabled', 'true');
    const selected = target('presentation-option'); selected.setAttribute('aria-pressed', 'true');
    const compact = target('presentation-option'); compact.setAttribute('aria-pressed', 'false');
    const detailed = target('presentation-option'); detailed.setAttribute('aria-pressed', 'false');
    const control = startLearningTarget('presentation-option'); stop = control.stop;
    await vi.advanceTimersByTimeAsync(50);
    expect(compact).toHaveClass('driver-active-element');
    compact.setAttribute('aria-pressed', 'true');
    await vi.advanceTimersByTimeAsync(150);
    expect(detailed).toHaveClass('driver-active-element');
  });

  it('prefers a toolbar AI button and then configuration instead of the guide action that requires selection', async () => {
    const guide = target('ai-open-guide');
    const configure = target('ai-settings-guide');
    const toolbar = target('ai-open');
    const control = startLearningTarget('ai-open'); stop = control.stop;
    await vi.advanceTimersByTimeAsync(50);
    expect(toolbar).toHaveClass('driver-active-element');
    toolbar.remove();
    await vi.advanceTimersByTimeAsync(150);
    expect(configure).toHaveClass('driver-active-element');
    expect(guide).not.toHaveClass('driver-active-element');
  });

  it.each(['ai-open', 'ai-organizer'] as const)('uses a bookmark selection hint without a click cue for %s when the toolbar is absent', async (name) => {
    const guide = target('ai-open-guide');
    const bookmark = document.createElement('div'); bookmark.dataset.learningTarget = 'bookmark';
    vi.spyOn(bookmark, 'getBoundingClientRect').mockReturnValue(rect); document.body.appendChild(bookmark);
    const control = startLearningTarget(name, { cue: 'Click here' }); stop = control.stop;
    await vi.advanceTimersByTimeAsync(50);
    expect(bookmark).toHaveClass('driver-active-element');
    expect(guide).not.toHaveClass('driver-active-element');
    expect(document.querySelector('.learning-target-cue')).toBeNull();
  });

  it('points an AI request back to the actual toolbar action when the organizer is closed', async () => {
    const guide = target('ai-open-guide');
    const toolbar = target('ai-open');
    const control = startLearningTarget('ai-organizer', { cue: 'Click here' }); stop = control.stop;
    await vi.advanceTimersByTimeAsync(50);
    expect(toolbar).toHaveClass('driver-active-element');
    expect(guide).not.toHaveClass('driver-active-element');
    expect(document.querySelector('.learning-target-cue')).toHaveTextContent('Click here');
  });

  it('reports missing selection rather than highlighting a nonactionable guide opener without bookmarks', async () => {
    const guide = target('ai-open-guide');
    const unavailable = vi.fn();
    const control = startLearningTarget('ai-organizer', { cue: 'Click here', onUnavailable: unavailable }); stop = control.stop;
    await vi.advanceTimersByTimeAsync(1700);
    expect(unavailable).toHaveBeenCalledOnce();
    expect(guide).not.toHaveClass('driver-active-element');
    expect(document.querySelector('.learning-target-cue')).toBeNull();
  });

  it('places a passive cue beside the target within viewport edges, follows geometry and removes it on stop', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ ...rect, width: 72, height: 26 });
    const element = target();
    const scrolled = vi.fn(); element.scrollIntoView = scrolled;
    const control = startLearningTarget('import', { cue: '点这里' }); stop = control.stop;
    await vi.advanceTimersByTimeAsync(50);
    const cue = document.querySelector<HTMLElement>('.learning-target-cue');
    expect(cue).not.toBeNull();
    expect(cue).toHaveTextContent('点这里');
    expect(cue).toHaveAttribute('aria-hidden', 'true');
    expect(cue?.style.position).toBe('fixed');
    expect(cue?.style.pointerEvents).toBe('none');
    expect(Number.parseFloat(cue!.style.top)).toBeGreaterThanOrEqual(60);
    expect(Number.parseFloat(cue!.style.left)).toBeGreaterThanOrEqual(8);
    vi.mocked(element.getBoundingClientRect).mockReturnValue({ ...rect, x: window.innerWidth - 85, left: window.innerWidth - 85, right: window.innerWidth - 5, y: 100, top: 100, bottom: 140 });
    await vi.advanceTimersByTimeAsync(150);
    expect(Number.parseFloat(cue!.style.left) + 72).toBeLessThanOrEqual(window.innerWidth - 8);
    expect(Number.parseFloat(cue!.style.top) + 26).toBeLessThanOrEqual(90);
    expect(scrolled).not.toHaveBeenCalled();
    control.stop();
    expect(document.querySelector('.learning-target-cue')).toBeNull();
  });

  it('removes a cue when its target is removed and supplies no cue without click instructions', async () => {
    const element = target();
    const control = startLearningTarget('import', { cue: 'Click here' }); stop = control.stop;
    await vi.advanceTimersByTimeAsync(50);
    expect(document.querySelector('.learning-target-cue')).not.toBeNull();
    element.remove();
    await vi.advanceTimersByTimeAsync(150);
    expect(document.querySelector('.learning-target-cue')).toBeNull();
    control.stop();
    target('bookmark');
    const move = startLearningTarget('bookmark'); stop = move.stop;
    await vi.advanceTimersByTimeAsync(50);
    expect(document.querySelector('.learning-target-cue')).toBeNull();
  });

  it('places its cue in a free adjacent slot without covering a neighboring control', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ ...rect, width: 72, height: 26 });
    const element = target();
    vi.mocked(element.getBoundingClientRect).mockReturnValue({ ...rect, x: 100, left: 100, right: 180, y: 100, top: 100, bottom: 140 });
    const neighbor = document.createElement('button'); neighbor.textContent = 'Add another bookmark';
    const neighborBox = { ...rect, x: 100, left: 100, right: 180, y: 64, top: 64, bottom: 92, height: 28 };
    vi.spyOn(neighbor, 'getBoundingClientRect').mockReturnValue(neighborBox); document.body.appendChild(neighbor);
    const control = startLearningTarget('import', { cue: 'Click here' }); stop = control.stop;
    await vi.advanceTimersByTimeAsync(50);
    const cue = document.querySelector<HTMLElement>('.learning-target-cue')!;
    expect(cue.hidden).toBe(false);
    const left = Number.parseFloat(cue.style.left); const top = Number.parseFloat(cue.style.top);
    expect(top).toBe(150);
    expect(left < neighborBox.right && left + 72 > neighborBox.left && top < neighborBox.bottom && top + 26 > neighborBox.top).toBe(false);
    expect(element).toHaveClass('driver-active-element');
  });

  it('hides only its cue when every adjacent slot would cover a visible control', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ ...rect, width: 72, height: 26 });
    const element = target();
    vi.mocked(element.getBoundingClientRect).mockReturnValue({ ...rect, x: 100, left: 100, right: 180, y: 100, top: 100, bottom: 140 });
    for (const [tag, left, top] of [['button', 104, 64], ['a', 104, 150], ['input', 190, 107], ['summary', 18, 107]] as const) {
      const neighbor = document.createElement(tag);
      vi.spyOn(neighbor, 'getBoundingClientRect').mockReturnValue({ ...rect, x: left, left, right: left + 72, y: top, top, bottom: top + 26, width: 72, height: 26 });
      document.body.appendChild(neighbor);
    }
    const control = startLearningTarget('import', { cue: 'Click here' }); stop = control.stop;
    await vi.advanceTimersByTimeAsync(50);
    expect(document.querySelector<HTMLElement>('.learning-target-cue')?.hidden).toBe(true);
    expect(element).toHaveClass('driver-active-element');
  });
  it('highlights an actual DOM target without changing focus, keyboard behavior or click access', async () => {
    const element = target();
    const input = document.createElement('input'); document.body.appendChild(input); input.focus();
    let clicks = 0; element.addEventListener('click', () => clicks++);
    const control = startLearningTarget('import'); stop = control.stop;
    await vi.advanceTimersByTimeAsync(50);
    expect(document.querySelector('.driver-overlay')).not.toBeNull();
    expect(element).toHaveClass('driver-active-element');
    expect(input).toHaveFocus();
    element.click(); expect(clicks).toBe(1);
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    input.dispatchEvent(event); expect(event.defaultPrevented).toBe(false);
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    input.dispatchEvent(tab); expect(tab.defaultPrevented).toBe(false);
    expect(document.querySelector('.driver-popover')).toBeNull();
    control.stop();
    expect(document.querySelector('.driver-overlay')).toBeNull();
    expect(element).not.toHaveClass('driver-active-element');
    expect(input).toHaveFocus();
  });

  it('waits boundedly for an absent target, reports guidance, and never supplies progress callbacks', async () => {
    const unavailable = vi.fn(); const available = vi.fn();
    const control = startLearningTarget('import', { onUnavailable: unavailable, onAvailable: available }); stop = control.stop;
    await vi.advanceTimersByTimeAsync(1700);
    expect(unavailable).toHaveBeenCalledOnce();
    expect(available).not.toHaveBeenCalled();
    expect(document.querySelector('.driver-overlay')).toBeNull();
    target();
    await Promise.resolve();
    expect(document.querySelector('.driver-overlay')).toBeNull();
    control.refresh();
    await vi.advanceTimersByTimeAsync(50);
    expect(available).toHaveBeenCalledOnce();
    expect(document.querySelector('.driver-overlay')).not.toBeNull();
  });

  it('finds a late target within the bounded wait and cleans listeners and highlight on removal', async () => {
    const control = startLearningTarget('import'); stop = control.stop;
    await vi.advanceTimersByTimeAsync(300);
    const element = target(); const parent = document.createElement('div');
    parent.appendChild(element); document.body.appendChild(parent);
    await Promise.resolve();
    expect(element).toHaveClass('driver-active-element');
    element.remove(); control.refresh();
    expect(document.querySelector('.driver-overlay')).toBeNull();
    expect(element).not.toHaveClass('driver-active-element');
    expect(parent).not.toHaveClass('driver-active-element-parent');
    control.stop(); target();
    await vi.advanceTimersByTimeAsync(1800);
    expect(document.querySelector('.driver-overlay')).toBeNull();
  });

  it('preserves original target aria, parent styles, third-party keyboard listeners and restart cleanup', async () => {
    const element = target();
    element.setAttribute('aria-haspopup', 'menu');
    const parent = document.createElement('div');
    parent.style.overflow = 'auto'; parent.appendChild(element); document.body.appendChild(parent);
    vi.spyOn(parent, 'getBoundingClientRect').mockReturnValue({ ...rect, x: 0, y: 0, top: 0, left: 0, right: 200, bottom: 200, width: 200, height: 200 });
    const thirdParty = vi.fn(); window.addEventListener('keydown', thirdParty);
    const first = startLearningTarget('import');
    await vi.advanceTimersByTimeAsync(50);
    expect(element).toHaveAttribute('aria-haspopup', 'menu');
    expect(element).not.toHaveAttribute('aria-expanded');
    expect(parent.style.overflow).toBe('auto');
    expect(parent).not.toHaveClass('driver-active-element-parent-no-scroll');
    first.stop(); first.stop();
    const second = startLearningTarget('import'); stop = second.stop;
    await vi.advanceTimersByTimeAsync(50);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(thirdParty).toHaveBeenCalledOnce();
    second.stop();
    expect(element).toHaveAttribute('aria-haspopup', 'menu');
    expect(document.querySelector('.driver-overlay')).toBeNull();
    window.removeEventListener('keydown', thirdParty);
  });

  it('ends observation and polling after the missing-target deadline', async () => {
    const control = startLearningTarget('import'); stop = control.stop;
    await vi.advanceTimersByTimeAsync(1700);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('follows the bookmark picker while import remains the same real task', async () => {
    const importButton = target();
    const control = startLearningTarget('import'); stop = control.stop;
    const picker = document.createElement('section'); picker.dataset.learningTarget = 'picker';
    vi.spyOn(picker, 'getBoundingClientRect').mockReturnValue(rect);
    document.body.appendChild(picker);
    await vi.advanceTimersByTimeAsync(150);
    expect(picker).toHaveClass('driver-active-element');
    expect(importButton).not.toHaveClass('driver-active-element');
    picker.remove();
    await vi.advanceTimersByTimeAsync(150);
    expect(importButton).toHaveClass('driver-active-element');
  });

  it('refreshes highlight geometry after camera movement without changing a target’s parent', async () => {
    const element = target(); const originalParent = element.parentElement;
    const control = startLearningTarget('bookmark'); stop = control.stop;
    element.dataset.learningTarget = 'bookmark';
    await vi.advanceTimersByTimeAsync(150);
    const before = document.querySelector('.driver-overlay path')?.getAttribute('d');
    vi.mocked(element.getBoundingClientRect).mockReturnValue({ ...rect, x: 80, left: 80, right: 160 });
    await vi.advanceTimersByTimeAsync(150);
    const after = document.querySelector('.driver-overlay path')?.getAttribute('d');
    expect(before).toBeTruthy(); expect(after).not.toBe(before);
    expect(element.parentElement).toBe(originalParent);
  });

  it('uses fallback instead of auto-scrolling a partly offscreen card into view', async () => {
    const element = target();
    vi.mocked(element.getBoundingClientRect).mockReturnValue({ ...rect, y: -10, top: -10, bottom: 30 });
    const scrolled = vi.fn(); element.scrollIntoView = scrolled;
    const unavailable = vi.fn();
    const control = startLearningTarget('import', { onUnavailable: unavailable }); stop = control.stop;
    await vi.advanceTimersByTimeAsync(1700);
    expect(scrolled).not.toHaveBeenCalled();
    expect(unavailable).toHaveBeenCalledOnce();
    expect(document.querySelector('.driver-overlay')).toBeNull();
  });
});
