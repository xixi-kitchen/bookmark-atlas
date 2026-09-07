import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToolbarSelectMenu } from './ToolbarSelectMenu';

afterEach(() => cleanup());

describe('ToolbarSelectMenu', () => {
  it('uses a custom listbox and changes the selected option', () => {
    const onChange = vi.fn();
    render(
      <ToolbarSelectMenu
        label="Card size"
        value="md"
        variant="size"
        options={[
          { value: 'sm', label: 'Small cards' },
          { value: 'md', label: 'Medium cards' },
          { value: 'lg', label: 'Large cards' },
        ]}
        onChange={onChange}
      />,
    );

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Card size: Medium cards' }));
    expect(screen.getByRole('listbox', { name: 'Choose Card size' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'Large cards' }));

    expect(onChange).toHaveBeenCalledWith('lg');
    expect(screen.queryByRole('listbox', { name: 'Choose Card size' })).not.toBeInTheDocument();
  });
});
