import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToolbarSelectMenu } from './ToolbarSelectMenu';

afterEach(() => cleanup());

describe('ToolbarSelectMenu', () => {
  it('uses a custom listbox and changes the selected option', () => {
    const onChange = vi.fn();
    render(
      <ToolbarSelectMenu
        label="卡片大小"
        value="md"
        variant="size"
        options={[
          { value: 'sm', label: '小卡片' },
          { value: 'md', label: '中卡片' },
          { value: 'lg', label: '大卡片' },
        ]}
        onChange={onChange}
      />,
    );

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '卡片大小：中卡片' }));
    expect(screen.getByRole('listbox', { name: '选择卡片大小' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: '大卡片' }));

    expect(onChange).toHaveBeenCalledWith('lg');
    expect(screen.queryByRole('listbox', { name: '选择卡片大小' })).not.toBeInTheDocument();
  });
});
