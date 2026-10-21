import { driver, type Driver, type State } from 'driver.js';
import 'driver.js/dist/driver.css';

export type LearningTarget = 'import' | 'picker' | 'bookmark' | 'bookmark-open' | 'selection-tools' | 'presentation-option'
  | 'layout-preview' | 'preview-actions' | 'preview-apply' | 'ai-open' | 'ai-settings' | 'ai-organizer';
type TargetOptions = { onUnavailable?: () => void; onAvailable?: () => void; cue?: string };
const WAIT_MS = 1600;

/** Highlight only. Never navigates a course, scrolls a target into view, or handles user keys. */
export function startLearningTarget(target: LearningTarget, options: TargetOptions = {}) {
  let stopped = false;
  let waiting = true;
  let current: HTMLElement | undefined;
  let tour: Driver | undefined;
  let cleanupTarget: (() => void) | undefined;
  let bounds = '';
  let deadline = Date.now() + WAIT_MS;
  let timer: number | undefined;
  let cue: HTMLSpanElement | undefined;
  const observer = new MutationObserver(() => check());

  function clearHighlight() {
    tour?.destroy(); cleanupTarget?.(); cleanupTarget = undefined;
    tour = undefined; current = undefined; bounds = '';
    cue?.remove(); cue = undefined;
    document.body.classList.remove('learning-driver-active');
  }

  function findTarget() {
    // An open picker owns import: never point through it at the background button.
    const names = target === 'import'
      ? (document.querySelector('[data-learning-target="picker"]:not([hidden])') ? ['picker-add', 'picker'] : ['import'])
      : target === 'ai-open' ? ['ai-open', 'ai-settings-guide', 'bookmark']
      : target === 'ai-settings' ? ['ai-settings', 'ai-settings-guide']
      : target === 'ai-organizer' ? ['ai-organizer', 'ai-open', 'bookmark'] : [target];
    return names.flatMap((name) => Array.from(document.querySelectorAll<HTMLElement>(`[data-learning-target="${name}"]`))).find((node) => {
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      if (node.matches(':disabled') || node.closest('[aria-disabled="true"]')
        || (target === 'presentation-option' && node.getAttribute('aria-pressed') === 'true')
        || node.closest('[hidden], [aria-hidden="true"]') || style.display === 'none' || style.visibility === 'hidden'
        || box.width <= 0 || box.height <= 0 || box.top < 0 || box.left < 0
        || box.bottom > window.innerHeight || box.right > window.innerWidth) return false;
      // Driver auto-scrolls clipped targets even with smoothScroll=false. Discover
      // only fully visible targets so starting a lesson never moves a user's view.
      for (let parent = node.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        const parentStyle = getComputedStyle(parent);
        if (!/(auto|scroll|hidden|clip)/.test(`${parentStyle.overflow} ${parentStyle.overflowX} ${parentStyle.overflowY}`)) continue;
        const area = parent.getBoundingClientRect();
        if (box.top < area.top || box.left < area.left || box.bottom > area.bottom || box.right > area.right) return false;
      }
      return true;
    });
  }

  function positionCue(box: DOMRect) {
    if (!cue) return;
    const inset = 8; const gap = 10;
    const measured = cue.getBoundingClientRect();
    const width = measured.width || Math.min(112, window.innerWidth - inset * 2);
    const height = measured.height || 28;
    const left = Math.max(inset, Math.min(box.left + (box.width - width) / 2, window.innerWidth - width - inset));
    const top = Math.max(inset, Math.min(box.top + (box.height - height) / 2, window.innerHeight - height - inset));
    const candidates = [
      { left, top: box.top - gap - height }, { left, top: box.bottom + gap },
      { left: box.right + gap, top }, { left: box.left - gap - width, top },
    ];
    const neighbors = Array.from(document.querySelectorAll<HTMLElement>('button, a, input, select, textarea, summary'))
      .filter((node) => node !== current && node !== cue && !node.closest('[hidden], [aria-hidden="true"]'))
      .filter((node) => { const style = getComputedStyle(node); return style.display !== 'none' && style.visibility !== 'hidden'; })
      .map((node) => node.getBoundingClientRect()).filter((area) => area.width > 0 && area.height > 0);
    const position = candidates.find((point) => point.left >= inset && point.top >= inset
      && point.left + width <= window.innerWidth - inset && point.top + height <= window.innerHeight - inset
      && !neighbors.some((area) => point.left < area.right && point.left + width > area.left
        && point.top < area.bottom && point.top + height > area.top));
    // If no adjacent slot fits, omit the cue instead of covering the target.
    if (cue.hidden !== !position) cue.hidden = !position;
    if (position) { cue.style.left = `${position.left}px`; cue.style.top = `${position.top}px`; }
  }

  function highlight(node: HTMLElement) {
    current = node;
    const parent = node.parentElement;
    const hadParentClass = parent?.classList.contains('driver-active-element-parent');
    const hadScrollClass = parent?.classList.contains('driver-active-element-parent-no-scroll');
    const originalAria = ['aria-haspopup', 'aria-expanded', 'aria-controls'].map((name) => [name, node.getAttribute(name)] as const);
    tour = driver({ animate: false, allowKeyboardControl: false, allowClose: false, allowScroll: true,
      disableActiveInteraction: false, advanceOnClick: false, smoothScroll: false,
      overlayClickBehavior: 'none', overlayOpacity: 1, stagePadding: 5, stageRadius: 7 });
    tour.highlight({ element: node });
    // Driver's highlight mode still installs a Tab trap and a page-wide pointer lock.
    // Its exported State surface allows removing exactly that handler; other listeners
    // remain owned by Driver and are removed by destroy(). Pin/characterize on upgrades.
    const state = tour.getState() as State;
    if (state.__events) window.removeEventListener('keydown', state.__events.onKeydown, false);
    document.body.classList.remove('driver-active', 'driver-simple', 'driver-fade');
    document.body.classList.add('learning-driver-active');
    node.parentElement?.classList.remove('driver-active-element-parent-no-scroll');
    for (const [name, value] of originalAria) { if (value === null) node.removeAttribute(name); else node.setAttribute(name, value); }
    // Driver cleans connected querySelector results only; React can remove or
    // replace a target before destroy(), so clean this instance's detached node too.
    cleanupTarget = () => {
      node.classList.remove('driver-active-element', 'driver-no-interaction');
      if (!hadParentClass) parent?.classList.remove('driver-active-element-parent');
      if (!hadScrollClass) parent?.classList.remove('driver-active-element-parent-no-scroll');
    };
    if (options.cue && node.matches('button, a[href], input, select, textarea') && node.dataset.learningTarget !== 'picker') {
      cue = document.createElement('span');
      cue.className = 'learning-target-cue'; cue.textContent = options.cue;
      cue.setAttribute('aria-hidden', 'true');
      cue.style.position = 'fixed'; cue.style.pointerEvents = 'none';
      document.body.appendChild(cue);
    }
    options.onAvailable?.();
  }

  function check() {
    if (stopped || (!waiting && !current)) return;
    const node = findTarget();
    if (!node) {
      if (current) { clearHighlight(); deadline = Date.now() + WAIT_MS; waiting = true; }
      if (waiting && Date.now() >= deadline) {
        waiting = false; observer.disconnect(); window.clearInterval(timer); timer = undefined; options.onUnavailable?.();
      }
      return;
    }
    // After the deadline, only an explicit retry may restart discovery.
    if (!waiting && !current) return;
    if (node !== current) { clearHighlight(); highlight(node); }
    const box = node.getBoundingClientRect();
    const nextBounds = `${box.x},${box.y},${box.width},${box.height}`;
    if (bounds !== nextBounds) { bounds = nextBounds; tour?.refresh(); }
    positionCue(box);
  }

  const refresh = () => {
    if (stopped) return;
    waiting = true; deadline = Date.now() + WAIT_MS;
    timer ??= window.setInterval(check, 100);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['hidden', 'data-learning-target', 'disabled', 'aria-disabled', 'aria-pressed'] });
    check(); tour?.refresh();
  };
  const onViewport = () => { check(); tour?.refresh(); };
  window.addEventListener('resize', onViewport);
  window.addEventListener('scroll', onViewport, true);
  refresh();
  return { refresh, stop: () => {
    if (stopped) return;
    stopped = true; window.clearInterval(timer); observer.disconnect();
    window.removeEventListener('resize', onViewport);
    window.removeEventListener('scroll', onViewport, true);
    clearHighlight();
  } };
}
