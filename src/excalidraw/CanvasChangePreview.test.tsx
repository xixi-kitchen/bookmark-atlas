import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '@excalidraw/excalidraw/types';
import { createBookmarkElement } from './bookmarkElements';
import { CanvasChangePreview } from './CanvasChangePreview';

afterEach(cleanup);
describe('organization review preview', () => {
  it('shows every proposed group, style and description before the user applies it', () => {
    const element = createBookmarkElement({ id: 'native', title: 'My bookmark', url: 'https://example.com', parentId: '1', index: 0 }, { x: 10, y: 10 }, { id: 'card' });
    const onApply = vi.fn();
    render(<CanvasChangePreview elements={[element]} appState={{ zoom: { value: 1 }, scrollX: 0, scrollY: 0, offsetLeft: 0, offsetTop: 0 } as AppState}
      onApply={onApply} onCancel={vi.fn()} aiPlan={{ groups: [{ title: '<script>Group</script>', items: [{ id: 'card', presentation: 'detailed', description: 'Suggested note, not a verified summary.' }] }] }} />);
    expect(screen.getByText('Review groups, styles, and descriptions')).toBeVisible();
    expect(screen.getByText('<script>Group</script>')).toBeVisible();
    expect(screen.getByText('Detailed')).toBeVisible();
    expect(screen.getByText('Description: Suggested note, not a verified summary.')).toBeVisible();
    expect(document.querySelector('script')).toBeNull();
    expect(onApply).not.toHaveBeenCalled();
  });
});
