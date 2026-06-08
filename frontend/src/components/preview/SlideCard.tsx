import React from 'react';
import { Trash2 } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { StatusBadge, Skeleton } from '@/components/shared';
import { getPageImageUrl } from '@/api/client';
import type { Page } from '@/types';

// SlideCard 组件自包含翻译
const slideCardI18n = {
  zh: {
    slideCard: {
      notGenerated: "未生成",
      confirmDeletePage: "确定要删除这一页吗？",
      confirmDeleteTitle: "确认删除"
    }
  },
  en: {
    slideCard: {
      notGenerated: "Not Generated",
      confirmDeletePage: "Are you sure you want to delete this page?",
      confirmDeleteTitle: "Confirm Delete"
    }
  }
};

interface SlideCardProps {
  page: Page;
  index: number;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
  showDelete?: boolean;
  isGenerating?: boolean;
  aspectRatio?: string;
}

export const SlideCard: React.FC<SlideCardProps> = ({
  page,
  index,
  isSelected,
  onClick,
  onDelete,
  showDelete = true,
  isGenerating = false,
  aspectRatio = '16:9',
}) => {
  const t = useT(slideCardI18n);
  const imageUrl = getPageImageUrl(page, { preferPreview: true });
  const hasImage = Boolean(page.preview_image_path || page.generated_image_path);

  const generatingByStatus = page.status === 'QUEUED' || page.status === 'GENERATING';
  const generating = !hasImage && (isGenerating || generatingByStatus);
  const hideActions = isGenerating || generatingByStatus;
  const badgeStatus = hasImage && generatingByStatus ? 'COMPLETED' : page.status;

  return (
    <div
      className={`group relative cursor-pointer rounded-xl bg-white dark:bg-background-secondary p-2.5 shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all ${
        isSelected
          ? 'ring-2 ring-banana-300 shadow-[0_10px_30px_rgba(250,204,21,0.18)]'
          : 'ring-1 ring-gray-200 hover:ring-gray-300 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]'
      }`}
      onClick={onClick}
    >
      <span
        className={`pointer-events-none absolute inset-y-2 left-0 w-1 rounded-full ${
          isSelected ? 'bg-banana-500' : 'bg-transparent'
        }`}
      />
      {!hideActions && (
        <div
          className="absolute top-2 right-2 z-20 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        >
          {showDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1.5 bg-white/95 dark:bg-background-secondary rounded-lg border border-gray-200 dark:border-border-primary text-red-600 transition-colors hover:bg-red-50"
              aria-label={t('slideCard.confirmDeleteTitle')}
              title={t('slideCard.confirmDeleteTitle')}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      )}

      {/* 标题 */}
      <div className="flex items-start gap-2 pl-3">
        <div
          className={`flex h-6 w-6 items-center justify-center rounded-md text-xs font-semibold ${
            isSelected
              ? 'bg-banana-100 text-banana-700'
              : 'bg-gray-100 text-gray-600 dark:bg-background-hover dark:text-foreground-tertiary'
          }`}
        >
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={`min-w-0 text-[13px] font-medium leading-snug ${
              isSelected ? 'text-banana-700' : 'text-gray-800 dark:text-foreground-primary'
            }`}
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {page.outline_content?.title || t('slideCard.notGenerated')}
          </div>
        </div>
      </div>

      {/* 缩略图 */}
      <div
        className="relative mt-2 ml-3 overflow-hidden rounded-lg bg-gray-50 dark:bg-background-primary ring-1 ring-gray-200/90"
        style={{ aspectRatio: aspectRatio.replace(':', '/') }}
      >
        {generating ? (
          <Skeleton className="w-full h-full" />
        ) : (page.preview_image_path || page.generated_image_path) ? (
          <>
            <img
              src={imageUrl}
              alt={`Slide ${index + 1}`}
              className="w-full h-full object-cover"
            />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-2xl mb-1">🍌</div>
              <div className="text-[10px]">{t('slideCard.notGenerated')}</div>
            </div>
          </div>
        )}
        
        {/* 状态标签 */}
        <div className="absolute bottom-2 right-2 scale-90 origin-bottom-right">
          <StatusBadge status={badgeStatus} />
        </div>
      </div>
    </div>
  );
};
