import { useRef, useState, type Dispatch, type MouseEvent, type SetStateAction } from 'react';
import { createUploadedReference, type PageAiUploadedReference } from '../SlidePreview.pageAi';

type ToastType = 'success' | 'error' | 'warning' | 'info';

type PageAiContextImages = {
  useTemplate: boolean;
  descImageUrls: string[];
  uploadedReferences: PageAiUploadedReference[];
};

type UseSlidePreviewRegionSelectionParams = {
  setSelectedContextImages: Dispatch<SetStateAction<PageAiContextImages>>;
  show: (options: { message: string; type?: ToastType | string; duration?: number }) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
};

export const useSlidePreviewRegionSelection = ({
  setSelectedContextImages,
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

      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      const displayWidth = img.clientWidth;
      const displayHeight = img.clientHeight;

      if (!naturalWidth || !naturalHeight || !displayWidth || !displayHeight) return;

      const scaleX = naturalWidth / displayWidth;
      const scaleY = naturalHeight / displayHeight;

      const sx = left * scaleX;
      const sy = top * scaleY;
      const sWidth = width * scaleX;
      const sHeight = height * scaleY;

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sWidth));
      canvas.height = Math.max(1, Math.round(sHeight));
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      try {
        ctx.drawImage(
          img,
          sx,
          sy,
          sWidth,
          sHeight,
          0,
          0,
          canvas.width,
          canvas.height
        );

        canvas.toBlob((blob) => {
          if (!blob) return;
          const file = new File([blob], `crop-${Date.now()}.png`, { type: 'image/png' });
          setSelectedContextImages((prev) => ({
            ...prev,
            uploadedReferences: [
              ...prev.uploadedReferences,
              createUploadedReference(
                file,
                'region',
                `框选区域 ${prev.uploadedReferences.filter((item) => item.sourceType === 'region').length + 1}`,
                {
                  regionBounds: {
                    leftRatio: left / displayWidth,
                    topRatio: top / displayHeight,
                    widthRatio: width / displayWidth,
                    heightRatio: height / displayHeight,
                  },
                }
              ),
            ],
          }));
          show({
            message: t('slidePreview.regionCropSuccess'),
            type: 'success',
          });
        }, 'image/png');
      } catch (e: any) {
        console.error('裁剪选中区域失败（可能是跨域图片导致 canvas 被污染）:', e);
        show({
          message: t('slidePreview.regionCropFailed'),
          type: 'error',
        });
      }
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
