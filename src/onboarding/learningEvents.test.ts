import { describe, expect, it, vi } from 'vitest';
import { emitLearningEvent, subscribeLearningEvents, type LearningEvent } from './learningEvents';

describe('learning event boundary', () => {
  it('delivers a detached business signal and unsubscribes', () => {
    const events: LearningEvent[] = [];
    const unsubscribe = subscribeLearningEvents((event) => events.push(event));
    const event: LearningEvent = { type: 'bookmark-added', count: 2 };
    emitLearningEvent(event);
    event.count = 99;
    unsubscribe();
    emitLearningEvent({ type: 'bookmark-opened' });
    expect(events).toEqual([{ type: 'bookmark-added', count: 2 }]);
  });

  it('rejects unknown, demo, invalid counts and private payload fields', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLearningEvents(listener);
    for (const event of [null, { type: 'demo' }, { type: 'ai-applied', prompt: 'private' },
      { type: 'bookmark-added', count: 0 }, { type: 'bookmark-added', count: -1 },
      { type: 'bookmark-added', count: NaN }, { type: 'bookmark-added', count: 1.5 }]) {
      emitLearningEvent(event as LearningEvent);
    }
    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
  });

  it('isolates listeners so a broken view cannot prevent the progress consumer', () => {
    const first = subscribeLearningEvents(() => { throw new Error('view failed'); });
    const listener = vi.fn();
    const second = subscribeLearningEvents(listener);
    expect(() => emitLearningEvent({ type: 'bookmark-opened' })).not.toThrow();
    first(); second();
    expect(listener).toHaveBeenCalledWith({ type: 'bookmark-opened' });
  });
});
