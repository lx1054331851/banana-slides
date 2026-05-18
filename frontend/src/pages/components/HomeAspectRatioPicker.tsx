import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { ASPECT_RATIO_OPTIONS } from '@/config/aspectRatio';
import { cn } from '@/utils';

type FloatingMenuPosition = {
  top: number;
  left: number;
};

interface HomeAspectRatioPickerProps {
  value: string;
  label: string;
  onChange: (value: string) => void;
}

const MENU_WIDTH = 80;
const MENU_HEIGHT = 320;

export const HomeAspectRatioPicker: React.FC<HomeAspectRatioPickerProps> = ({
  value,
  label,
  onChange,
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<FloatingMenuPosition | null>(null);

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
        title={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <span>{value}</span>
        <ChevronDown size={12} className={cn('transition-transform', isOpen && 'rotate-180')} />
      </button>
      {isOpen && menuPosition && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" aria-hidden="true" />
          <div
            ref={menuRef}
            className="fixed z-[70] min-w-[80px] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-border-primary dark:bg-background-elevated dark:shadow-none"
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              transform: menuPosition.top < (buttonRef.current?.getBoundingClientRect().top ?? 0)
                ? 'translateY(-100%)'
                : undefined,
            }}
            role="menu"
            aria-label={label}
          >
            {ASPECT_RATIO_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-gray-100 dark:hover:bg-background-hover',
                  value === opt.value
                    ? 'font-semibold text-banana'
                    : 'text-gray-700 dark:text-foreground-secondary'
                )}
                role="menuitemradio"
                aria-checked={value === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
};
