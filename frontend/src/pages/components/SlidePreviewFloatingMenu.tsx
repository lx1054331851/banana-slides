import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type SlidePreviewFloatingMenuProps = {
  anchorRef: React.RefObject<HTMLElement | null>;
  isOpen: boolean;
  onClose: () => void;
  width: number;
  maxHeight?: number;
  align?: 'left' | 'right';
  ariaLabel: string;
  children: React.ReactNode;
};

type FloatingMenuPosition = {
  top: number;
  left: number;
  openUpward: boolean;
};

/**
 * Compute a viewport-safe position for preview floating menus.
 */
function resolveFloatingMenuPosition(
  anchor: HTMLElement,
  width: number,
  maxHeight: number,
  align: 'left' | 'right',
): FloatingMenuPosition {
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const horizontalPadding = 12;
  const verticalPadding = 12;
  const gap = 8;
  const idealLeft = align === 'right' ? rect.right - width : rect.left;
  const left = Math.min(
    Math.max(horizontalPadding, idealLeft),
    Math.max(horizontalPadding, viewportWidth - width - horizontalPadding),
  );
  const spaceAbove = Math.max(0, rect.top - verticalPadding);
  const spaceBelow = Math.max(0, viewportHeight - rect.bottom - verticalPadding);
  const openUpward = spaceAbove >= maxHeight || spaceAbove > spaceBelow;

  return {
    top: openUpward ? rect.top - gap : rect.bottom + gap,
    left,
    openUpward,
  };
}

/**
 * Render preview menus in a portal so they are not clipped by split panes or overflow containers.
 */
export const SlidePreviewFloatingMenu: React.FC<SlidePreviewFloatingMenuProps> = ({
  anchorRef,
  isOpen,
  onClose,
  width,
  maxHeight = 320,
  align = 'right',
  ariaLabel,
  children,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<FloatingMenuPosition | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedAnchor = anchorRef.current?.contains(target);
      const clickedMenu = menuRef.current?.contains(target);

      if (!clickedAnchor && !clickedMenu) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [anchorRef, isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined' || !anchorRef.current) {
      return;
    }

    const updatePosition = () => {
      if (!anchorRef.current) {
        return;
      }
      setPosition(resolveFloatingMenuPosition(anchorRef.current, width, maxHeight, align));
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [align, anchorRef, isOpen, maxHeight, width]);

  if (!isOpen || !position || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[80] overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.12)] dark:border-border-primary dark:bg-background-elevated dark:shadow-[0_18px_40px_rgba(0,0,0,0.36)]"
      style={{
        top: position.top,
        left: position.left,
        width,
        maxHeight,
        transform: position.openUpward ? 'translateY(-100%)' : undefined,
      }}
      role="menu"
      aria-label={ariaLabel}
    >
      {children}
    </div>,
    document.body,
  );
};
