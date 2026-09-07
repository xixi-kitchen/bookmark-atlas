import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { t } from '../i18n';

export type ToolbarSelectOption = {
  value: string;
  label: string;
  description?: string;
  color?: string;
};

type Props = {
  label: string;
  value: string;
  options: ToolbarSelectOption[];
  variant: 'size' | 'theme';
  onChange: (value: string) => void;
};

export function ToolbarSelectMenu({ label, value, options, variant, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [open]);

  return (
    <div className={`toolbar-select toolbar-select--${variant}`} ref={rootRef}>
      <button
        type="button"
        className="toolbar-select__trigger"
        aria-label={t('selectValue', [label, selected?.label ?? ''])}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <OptionMark option={selected} variant={variant} />
        <span>{selected?.label ?? ''}</span>
        <ChevronDown size={13} />
      </button>

      {open && (
        <div className="toolbar-select__menu" role="listbox" aria-label={t('selectMenu', label)}>
          <header>
            <strong>{label}</strong>
            <small>{t('optionCount', String(options.length))}</small>
          </header>
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                type="button"
                key={option.value}
                className={isSelected ? 'is-selected' : ''}
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <OptionMark option={option} variant={variant} />
                <span>
                  <strong>{option.label}</strong>
                  {option.description && <small>{option.description}</small>}
                </span>
                {isSelected && <Check size={15} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OptionMark({ option, variant }: { option?: ToolbarSelectOption; variant: Props['variant'] }) {
  if (variant === 'theme') {
    return <span className="toolbar-select__theme-mark" style={{ backgroundColor: option?.color ?? '#6965db' }} aria-hidden="true" />;
  }

  return (
    <span className={`toolbar-select__size-mark is-${option?.value ?? 'md'}`} aria-hidden="true">
      <i /><i /><i />
    </span>
  );
}
