import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  menuClassName?: string;
}

export const Select: React.FC<SelectProps> = ({
  value,
  options,
  onChange,
  placeholder = '请选择',
  className = '',
  menuClassName = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 text-left text-gray-900 focus:outline-none focus:ring-2 focus:ring-banana-500 focus:border-transparent dark:border-border-primary dark:bg-background-secondary dark:text-foreground-primary"
      >
        <span className="truncate">{selected?.label || placeholder}</span>
        <ChevronDown
          size={18}
          className={`ml-3 shrink-0 text-gray-500 transition-transform dark:text-foreground-tertiary ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div
          className={`absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-border-primary dark:bg-background-secondary ${menuClassName}`}
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) return;
                  onChange?.(option.value);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center px-4 py-2 text-left text-sm transition-colors ${
                  active
                    ? 'bg-banana-500 text-white'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-foreground-secondary dark:hover:bg-background-hover'
                } ${option.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
