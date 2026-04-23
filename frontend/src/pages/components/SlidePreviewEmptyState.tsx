import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/shared';

type SlidePreviewEmptyStateProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  projectId?: string;
  onInsertFirstPage: () => void;
  onBackToOutline: (projectId?: string) => void;
};

export const SlidePreviewEmptyState: React.FC<SlidePreviewEmptyStateProps> = ({
  t,
  projectId,
  onInsertFirstPage,
  onBackToOutline,
}) => {
  return (
    <div className="flex-1 flex items-center justify-center overflow-y-auto">
      <div className="text-center">
        <div className="text-4xl md:text-6xl mb-4">📊</div>
        <h3 className="text-lg md:text-xl font-semibold text-gray-700 dark:text-foreground-secondary mb-2">
          {t('preview.noPages')}
        </h3>
        <p className="text-sm md:text-base text-gray-500 dark:text-foreground-tertiary mb-6">
          {t('preview.noPagesHint')}
        </p>
        <Button
          variant="primary"
          icon={<Plus size={16} />}
          onClick={onInsertFirstPage}
          className="text-sm md:text-base"
        >
          {t('preview.addFirstPage')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => onBackToOutline(projectId)}
          className="text-sm md:text-base mt-2"
        >
          {t('preview.backToEdit')}
        </Button>
      </div>
    </div>
  );
};
