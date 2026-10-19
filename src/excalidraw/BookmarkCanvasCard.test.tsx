import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookmarkCanvasCard } from './BookmarkCanvasCard';

afterEach(cleanup);
const props = { title: 'A long bookmark title', url: 'https://example.com/path', matchStatus: 'matched' as const, description: 'A useful description.' };

describe('canvas bookmark presentation', () => {
  it('offers pointer and keyboard links and keeps keyboard tab order selected-only', () => {
    const onOpen = vi.fn();
    const { rerender } = render(<BookmarkCanvasCard {...props} selected onOpen={onOpen} />);
    const link = screen.getByRole('link', { name: `Open ${props.title}` });
    expect(link).toHaveAttribute('tabindex', '0');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.keyDown(link, { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledOnce();
    fireEvent.click(link, { detail: 1 });
    expect(onOpen).toHaveBeenCalledTimes(2);
    rerender(<BookmarkCanvasCard {...props} onOpen={onOpen} />);
    expect(link).toHaveAttribute('tabindex', '-1');
    rerender(<BookmarkCanvasCard {...props} url="javascript:alert(1)" selected onOpen={onOpen} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
  it('keeps legacy cards detailed and renders descriptions as text', () => {
    const { container } = render(<BookmarkCanvasCard {...props} description="<script>alert(1)</script>" />);
    expect(screen.getByText('example.com/path')).toBeInTheDocument();
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(container.firstElementChild).toHaveClass('is-detailed');
  });
  it('shows a compact readable URL without query, fragment or credentials in the detailed card', () => {
    render(<BookmarkCanvasCard {...props} url="https://user:secret@www.example.com/a/long/path?token=private#secret" />);
    const url = screen.getByText('example.com/a/long/path');
    expect(url).toHaveClass('atlas-bookmark-embed__url');
    expect(url.textContent).not.toContain('private');
    expect(url.textContent).not.toContain('secret');
  });
  it('keeps compact cards readable without the old footer or empty description', () => {
    render(<BookmarkCanvasCard {...props} presentation="compact" />);
    expect(screen.getByText(props.title)).toBeInTheDocument();
    expect(screen.queryByText('example.com')).not.toBeInTheDocument();
    expect(screen.queryByText(props.description)).not.toBeInTheDocument();
    expect(screen.queryByText('Open with the link button')).not.toBeInTheDocument();
  });
  it('provides the full name and domain on icon-only cards and preserves warning status', () => {
    const { container } = render(<BookmarkCanvasCard {...props} presentation="icon" matchStatus="missing" />);
    expect(container.firstElementChild).toHaveAttribute('title', expect.stringContaining(props.title));
    expect(container.firstElementChild).toHaveAttribute('title', expect.stringContaining('example.com'));
    expect(screen.queryByText(props.title)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
