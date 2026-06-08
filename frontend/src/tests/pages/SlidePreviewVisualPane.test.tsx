import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SlidePreviewVisualPane } from '@/pages/components/SlidePreviewVisualPane';

const t = (key: string) => {
  const translations: Record<string, string> = {
    'preview.fullscreen': '全屏',
    'preview.exitFullscreen': '退出全屏',
    'preview.historyVersions': '历史版本',
    'preview.version': '版本',
    'preview.current': '当前',
    'preview.notGenerated': '尚未生成图片',
    'preview.uploadPageImageHint': '可直接上传本地图片',
    'preview.uploadingPageImage': '上传中',
    'preview.uploadPageImage': '上传本地图片',
  };
  return translations[key] || key;
};

describe('SlidePreviewVisualPane', () => {
  it('opens the lightbox when the preview image is clicked', async () => {
    render(
      <SlidePreviewVisualPane
        t={t}
        selectedIndex={0}
        imageUrl="https://example.com/slide-1.png"
        selectedPageHasImage
        isFullscreen={false}
        isDraggingFloatingFullscreenButton={false}
        floatingFullscreenButtonPosition={{ x: 0.5, y: 0.5 }}
        aspectRatioStyle="16 / 9"
        previewContainerRef={{ current: null }}
        imageRef={{ current: null }}
        regionOverlayReferences={[]}
        pendingRegionOverlay={null}
        pendingRegionComposer={null}
        activePreviewReferenceId={null}
        selectionRect={null}
        imageVersions={[]}
        onFloatingFullscreenButtonMouseDown={vi.fn()}
        onFloatingFullscreenButtonClick={vi.fn()}
        onSwitchVersion={vi.fn()}
      />
    );

    fireEvent.click(screen.getByAltText('Slide 1'));

    expect(await screen.findByRole('dialog', { name: 'Slide 1' })).toBeInTheDocument();
  });
});
