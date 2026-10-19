import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookmarkSelectionTools } from './BookmarkSelectionTools';

afterEach(cleanup);

describe('bookmark selection tools', () => {
  it('shows only contextual controls and routes style and description actions', () => {
    const onPresentation = vi.fn();
    const onDescription = vi.fn();
    render(<BookmarkSelectionTools count={1} presentation="detailed" description="Old note" onPresentation={onPresentation} onDescription={onDescription} onLayout={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Detailed' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Icon' }));
    expect(onPresentation).toHaveBeenCalledWith('icon');
    fireEvent.click(screen.getByRole('button', { name: 'Description' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), { target: { value: 'New note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onDescription).toHaveBeenCalledWith('New note');
  });
  it('supports batch layout while preventing accidental shared description replacement', () => {
    const onLayout = vi.fn();
    render(<BookmarkSelectionTools count={8} presentation="mixed" description="" onPresentation={vi.fn()} onDescription={vi.fn()} onLayout={onLayout} />);
    expect(screen.getByRole('button', { name: 'Description' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Arrange' }));
    expect(onLayout).toHaveBeenCalledOnce();
  });
});
