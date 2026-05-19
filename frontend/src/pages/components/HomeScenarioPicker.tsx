import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import type { ProjectScenario } from '@/types';
import { cn } from '@/utils';

type FloatingMenuPosition = {
  top: number;
  left: number;
  openUpward: boolean;
};

interface ScenarioOption {
  value: ProjectScenario;
  label: string;
}

interface HomeScenarioPickerProps {
  value: ProjectScenario;
  options: ScenarioOption[];
  onChange: (value: ProjectScenario) => void;
}

const MENU_WIDTH = 132;
const MENU_HEIGHT = 160;

export const HomeScenarioPicker: React.FC<HomeScenarioPickerProps> = ({
  value,
  options,
  onChange,
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<FloatingMenuPosition | null>(null);

  const currentOption = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedInside = rootRef.current?.contains(target) || menuRef.current?.contains(target);
      if (!clickedInside) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined' || !buttonRef.current) {
      return;
    }

    const updateMenuPosition = () => {
      if (!buttonRef.current) {
        return;
      }

      const rect = buttonRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const horizontalPadding = 12;
      const verticalPadding = 12;
      const gap = 6;
      const left = Math.min(
        Math.max(horizontalPadding, rect.left),
        Math.max(horizontalPadding, viewportWidth - MENU_WIDTH - horizontalPadding)
      );
      const spaceAbove = Math.max(0, rect.top - verticalPadding);
      const spaceBelow = Math.max(0, viewportHeight - rect.bottom - verticalPadding);
      const openUpward = spaceAbove >= MENU_HEIGHT || spaceAbove > spaceBelow;

      setMenuPosition({
        top: openUpward ? rect.top - gap : rect.bottom + gap,
        left,
        openUpward,
      });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);

    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:text-foreground-tertiary dark:hover:text-foreground-secondary dark:hover:bg-background-hover rounded transition-colors"
        title={currentOption?.label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <span>{currentOption?.label}</span>
        <ChevronDown size={12} className={cn('transition-transform', isOpen && 'rotate-180')} />
      </button>
      {isOpen && menuPosition && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" aria-hidden="true" />
          <div
            ref={menuRef}
            className="fixed z-[70] w-[132px] overflow-y-auto overflow-x-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-border-primary dark:bg-background-elevated dark:shadow-none"
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              maxHeight: MENU_HEIGHT,
              transform: menuPosition.openUpward ? 'translateY(-100%)' : undefined,
            }}
            role="menu"
            aria-label={currentOption?.label || 'Scenario'}
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-gray-100 dark:hover:bg-background-hover',
                  value === option.value
                    ? 'font-semibold text-banana'
                    : 'text-gray-700 dark:text-foreground-secondary'
                )}
                role="menuitemradio"
                aria-checked={value === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
};
