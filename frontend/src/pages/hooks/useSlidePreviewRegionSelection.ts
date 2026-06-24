import { useRef, useState, type Dispatch, type MouseEvent, type SetStateAction } from 'react';
import type { PendingRegionCapture } from '../SlidePreview.pageAi';

type ToastType = 'success' | 'error' | 'warning' | 'info';

type UseSlidePreviewRegionSelectionParams = {
  setPendingRegionCapture: Dispatch<SetStateAction<PendingRegionCapture | null>>;
  show: (options: { message: string; type?: ToastType | string; duration?: number }) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
};

export const useSlidePreviewRegionSelection = ({
  setPendingRegionCapture,
  show,
  t,
}: UseSlidePreviewRegionSelectionParams) => {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [isRegionSelectionMode, setIsRegionSelectionMode] = useState(false);
  const [isSelectingRegion, setIsSelectingRegion] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionRect, setSelectionRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  const handleSelectionMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (!isRegionSelectionMode || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
    setIsSelectingRegion(true);
    setSelectionStart({ x, y });
    setSelectionRect(null);
  };

  const handleSelectionMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isRegionSelectionMode || !isSelectingRegion || !selectionStart || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const clampedX = Math.max(0, Math.min(x, rect.width));
    const clampedY = Math.max(0, Math.min(y, rect.height));

    const left = Math.min(selectionStart.x, clampedX);
    const top = Math.min(selectionStart.y, clampedY);
    const width = Math.abs(clampedX - selectionStart.x);
    const height = Math.abs(clampedY - selectionStart.y);

    setSelectionRect({ left, top, width, height });
  };

  const handleSelectionMouseUp = async () => {
    if (!isRegionSelectionMode || !isSelectingRegion || !selectionRect || !imageRef.current) {
      setIsSelectingRegion(false);
      setSelectionStart(null);
      return;
    }

    setIsSelectingRegion(false);
    setSelectionStart(null);

    try {
      const img = imageRef.current;
      const { left, top, width, height } = selectionRect;
      if (width < 10 || height < 10) {
        return;
      }

      const displayWidth = img.clientWidth;
      const displayHeight = img.clientHeight;
      if (!displayWidth || !displayHeight) return;

      setPendingRegionCapture({
        regionBounds: {
          leftRatio: left / displayWidth,
          topRatio: top / displayHeight,
          widthRatio: width / displayWidth,
          heightRatio: height / displayHeight,
        },
      });
      show({
        message: t('slidePreview.regionCropSuccess'),
        type: 'success',
      });
    } finally {
      setSelectionRect(null);
    }
  };

  const clearSelectionPreview = () => {
    setSelectionStart(null);
    setSelectionRect(null);
    setIsSelectingRegion(false);
  };

  return {
    imageRef,
    isRegionSelectionMode,
    setIsRegionSelectionMode,
    isSelectingRegion,
    setIsSelectingRegion,
    selectionStart,
    setSelectionStart,
    selectionRect,
    setSelectionRect,
    handleSelectionMouseDown,
    handleSelectionMouseMove,
    handleSelectionMouseUp,
    clearSelectionPreview,
  };
};
