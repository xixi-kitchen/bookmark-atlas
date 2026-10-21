import { isLearningEvent, type LearningEvent } from './learningEvents';
export type { LearningEvent } from './learningEvents';

export type LearningChapter = 'basics' | 'capture' | 'ai';
export type LearningStep = 'welcome' | 'import' | 'open' | 'move' | 'select' | 'presentation'
  | 'layout' | 'layout-apply' | 'basics-done' | 'capture' | 'ai-start' | 'ai-settings'
  | 'ai-request' | 'ai-preview' | 'ai-done';
export type LearningProgress = {
  chapter: LearningChapter;
  step: LearningStep;
  completed: LearningStep[];
  completedChapters: LearningChapter[];
  status: 'active' | 'paused' | 'completed';
};

export const LEARNING_PROGRESS_STORAGE_KEY = 'bookmark-atlas:learning-progress:v1';
const localEvent = 'bookmark-atlas:learning-progress-changed';
const chapters: LearningChapter[] = ['basics', 'capture', 'ai'];
const steps: Record<LearningChapter, LearningStep[]> = {
  basics: ['import', 'open', 'move', 'select', 'presentation', 'layout', 'layout-apply', 'basics-done'],
  capture: ['capture'],
  ai: ['ai-start', 'ai-settings', 'ai-request', 'ai-preview', 'ai-done'],
};
let queue: Promise<unknown> = Promise.resolve();

export async function readLearningProgress(): Promise<LearningProgress | null> {
  let value: unknown;
  if (globalThis.chrome?.storage?.local) {
    value = (await chrome.storage.local.get(LEARNING_PROGRESS_STORAGE_KEY))[LEARNING_PROGRESS_STORAGE_KEY];
  } else {
    if (!globalThis.localStorage) throw new Error('Local learning storage is unavailable');
    const raw = localStorage.getItem(LEARNING_PROGRESS_STORAGE_KEY);
    if (!raw) return null;
    try { value = JSON.parse(raw); } catch { return null; }
  }
  return validateProgress(value);
}

export function startLearning(chapter: LearningChapter): Promise<LearningProgress> {
  return serialize(async () => {
    if (!chapters.includes(chapter)) throw new Error('Unknown learning chapter');
    const current = await readLearningProgress();
    const next: LearningProgress = {
      chapter, step: steps[chapter][0]!, completed: [],
      completedChapters: current?.completedChapters ?? [], status: 'active',
    };
    await writeProgress(next);
    return next;
  });
}

export function pauseLearning(): Promise<LearningProgress | null> {
  return changeProgress((current) => current.status === 'active' ? { ...current, status: 'paused' } : current);
}

export function resumeLearning(): Promise<LearningProgress | null> {
  return changeProgress((current) => current.status === 'paused' ? { ...current, status: 'active' } : current);
}

/** Opening configuration selects its lesson; only a successful save earns it. */
export function beginAIConfiguration(): Promise<LearningProgress | null> {
  return changeProgress((current) => current.status === 'active' && current.chapter === 'ai' && current.step === 'ai-start'
    ? { ...current, step: 'ai-settings' } : current);
}

export function advanceLearning(event: LearningEvent): Promise<LearningProgress | null> {
  return changeProgress((current) => {
    if (current.status !== 'active' || !isLearningEvent(event)) return current;
    const nextStep = matchEvent(current.step, event);
    if (!nextStep) return current;
    const finished = nextStep === 'basics-done' || nextStep === 'ai-done' || current.chapter === 'capture';
    return {
      ...current, step: nextStep,
      // Existing settings can produce a real preview without a new settings save.
      completed: current.step === 'ai-settings' && event.type === 'ai-previewed'
        ? current.completed : [...new Set([...current.completed, current.step])],
      completedChapters: finished ? [...new Set([...current.completedChapters, current.chapter])] : current.completedChapters,
      status: finished ? 'completed' : 'active',
    };
  });
}

export function subscribeLearningProgress(listener: () => void): () => void {
  const storage = globalThis.chrome?.storage?.onChanged;
  const onChrome = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[LEARNING_PROGRESS_STORAGE_KEY]) listener();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === LEARNING_PROGRESS_STORAGE_KEY || event.key === null) listener();
  };
  storage?.addListener(onChrome);
  globalThis.window?.addEventListener(localEvent, listener);
  globalThis.window?.addEventListener('storage', onStorage);
  return () => {
    storage?.removeListener(onChrome);
    globalThis.window?.removeEventListener(localEvent, listener);
    globalThis.window?.removeEventListener('storage', onStorage);
  };
}

function matchEvent(step: LearningStep, event: LearningEvent): LearningStep | null {
  const transitions: Partial<Record<LearningStep, [LearningEvent['type'], LearningStep]>> = {
    import: ['bookmark-added', 'open'], open: ['bookmark-opened', 'move'], move: ['bookmark-moved', 'select'],
    select: ['bookmarks-selected', 'presentation'], presentation: ['presentation-changed', 'layout'],
    layout: ['layout-previewed', 'layout-apply'], 'layout-apply': ['layout-applied', 'basics-done'],
    capture: ['capture-saved', 'capture'], 'ai-start': ['ai-settings-saved', 'ai-request'],
    'ai-settings': ['ai-settings-saved', 'ai-request'], 'ai-request': ['ai-previewed', 'ai-preview'],
    'ai-preview': ['ai-applied', 'ai-done'],
  };
  if ((step === 'ai-start' || step === 'ai-settings') && event.type === 'ai-previewed') return 'ai-preview';
  if (step === 'select' && (event.count ?? 0) < 2) return null;
  const transition = transitions[step];
  return transition?.[0] === event.type ? transition[1] : null;
}

function changeProgress(reduce: (current: LearningProgress) => LearningProgress): Promise<LearningProgress | null> {
  return serialize(async () => {
    const current = await readLearningProgress();
    if (!current) return null;
    const next = reduce(current);
    if (next !== current) await writeProgress(next);
    return next;
  });
}

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => globalThis.navigator?.locks
    ? await navigator.locks.request(LEARNING_PROGRESS_STORAGE_KEY, operation) : await operation();
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

async function writeProgress(value: LearningProgress): Promise<void> {
  if (globalThis.chrome?.storage?.local) await chrome.storage.local.set({ [LEARNING_PROGRESS_STORAGE_KEY]: value });
  else {
    if (!globalThis.localStorage) throw new Error('Local learning storage is unavailable');
    localStorage.setItem(LEARNING_PROGRESS_STORAGE_KEY, JSON.stringify(value));
  }
  // Chrome does not promise an onChanged event back into the writer's document.
  globalThis.window?.dispatchEvent(new Event(localEvent));
}

function validateProgress(value: unknown): LearningProgress | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const state = value as LearningProgress;
  if (!chapters.includes(state.chapter) || !steps[state.chapter].includes(state.step)
    || !['active', 'paused', 'completed'].includes(state.status)
    || !Array.isArray(state.completed) || !Array.isArray(state.completedChapters)
    || state.completed.some((step) => !steps[state.chapter].includes(step) || step === 'basics-done' || step === 'ai-done')
    || state.completedChapters.some((chapter) => !chapters.includes(chapter))
    || new Set(state.completed).size !== state.completed.length
    || new Set(state.completedChapters).size !== state.completedChapters.length) return null;
  const terminal = state.step === 'basics-done' || state.step === 'ai-done' || state.chapter === 'capture';
  if (state.status === 'completed' && (!terminal || !state.completedChapters.includes(state.chapter))) return null;
  if (state.status !== 'completed' && (state.step === 'basics-done' || state.step === 'ai-done')) return null;
  const chapterSteps = steps[state.chapter];
  const position = chapterSteps.indexOf(state.step);
  if (state.chapter === 'basics' && (state.completed.length !== position
    || state.completed.some((step, index) => step !== chapterSteps[index]))) return null;
  if (state.chapter === 'capture' && (state.status === 'completed'
    ? state.completed.length !== 1 || state.completed[0] !== 'capture' : state.completed.length !== 0)) return null;
  if (state.chapter === 'ai' && (state.completed.some((step, index) => {
    const previous = state.completed[index - 1];
    return chapterSteps.indexOf(step) >= position || (previous !== undefined && chapterSteps.indexOf(step) <= chapterSteps.indexOf(previous));
  }) || (state.status === 'completed' && !state.completed.includes('ai-preview')))) return null;
  return { chapter: state.chapter, step: state.step, completed: [...state.completed], completedChapters: [...state.completedChapters], status: state.status };
}
