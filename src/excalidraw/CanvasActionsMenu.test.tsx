import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanvasActionsMenu } from './CanvasActionsMenu';

afterEach(cleanup);

describe('canvas actions', () => {
  it('keeps secondary actions hidden until requested and opens full backup', () => {
    const onBackup = vi.fn();
    render(<CanvasActionsMenu onFitAll={vi.fn()} onFocusBookmarks={vi.fn()} onBackup={onBackup} />);
    expect(screen.queryByRole('button', { name: 'Full backup' })).not.toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'More canvas actions' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Full backup' }));
    expect(onBackup).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('keeps both canvas framing actions available', () => {
    const onFitAll = vi.fn();
    const onFocusBookmarks = vi.fn();
    render(<CanvasActionsMenu onFitAll={onFitAll} onFocusBookmarks={onFocusBookmarks} onBackup={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'More canvas actions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fit all elements' }));
    expect(onFitAll).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'More canvas actions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Focus all bookmarks' }));
    expect(onFocusBookmarks).toHaveBeenCalledOnce();
  });

  it('closes on Escape or an outside click', () => {
    render(<CanvasActionsMenu onFitAll={vi.fn()} onFocusBookmarks={vi.fn()} onBackup={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'More canvas actions' });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Full backup' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
