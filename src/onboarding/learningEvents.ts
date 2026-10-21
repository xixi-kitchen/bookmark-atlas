export type LearningEvent = {
  type: 'bookmark-added' | 'bookmark-opened' | 'bookmark-moved' | 'bookmarks-selected'
    | 'presentation-changed' | 'layout-previewed' | 'layout-applied' | 'capture-saved'
    | 'ai-settings-saved' | 'ai-previewed' | 'ai-applied';
  count?: number;
};

const eventTypes: ReadonlySet<string> = new Set([
  'bookmark-added', 'bookmark-opened', 'bookmark-moved', 'bookmarks-selected',
  'presentation-changed', 'layout-previewed', 'layout-applied', 'capture-saved',
  'ai-settings-saved', 'ai-previewed', 'ai-applied',
]);
const listeners = new Set<(event: LearningEvent) => void>();

/** Reject extra payloads instead of carrying business data through learning. */
export function isLearningEvent(value: unknown): value is LearningEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return Object.keys(event).every((key) => key === 'type' || key === 'count')
    && typeof event.type === 'string' && eventTypes.has(event.type)
    && (event.count === undefined || (Number.isSafeInteger(event.count) && (event.count as number) > 0));
}

export function emitLearningEvent(event: LearningEvent): void {
  if (!isLearningEvent(event)) return;
  const signal: LearningEvent = Object.freeze(event.count === undefined
    ? { type: event.type } : { type: event.type, count: event.count });
  for (const listener of [...listeners]) {
    // An optional view must never interrupt the successful business operation.
    try { listener(signal); } catch { /* Other consumers must still receive it. */ }
  }
}

export function subscribeLearningEvents(listener: (event: LearningEvent) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
