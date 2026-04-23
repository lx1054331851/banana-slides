import React from 'react';
import { Button, Modal } from '@/components/shared';

type ResolutionWarningModalProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  isOpen: boolean;
  skipChecked: boolean;
  onClose: () => void;
  onSkipCheckedChange: (checked: boolean) => void;
  onConfirm: () => void;
};

export const ResolutionWarningModal: React.FC<ResolutionWarningModalProps> = ({
  t,
  isOpen,
  skipChecked,
  onClose,
  onSkipCheckedChange,
  onConfirm,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title={t('preview.resolution1KWarning')}
    size="sm"
  >
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <div className="text-2xl">⚠️</div>
        <div className="flex-1">
          <p className="text-sm text-amber-800">
            {t('preview.resolution1KWarningText')}
          </p>
          <p className="mt-2 text-sm text-amber-700">
            {t('preview.resolution1KWarningHint')}
          </p>
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={skipChecked}
          onChange={(e) => onSkipCheckedChange(e.target.checked)}
          className="h-4 w-4 rounded text-banana-600 focus:ring-banana-500"
        />
        <span className="text-sm text-gray-600 dark:text-foreground-tertiary">{t('preview.dontShowAgain')}</span>
      </label>

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" onClick={onConfirm}>
          {t('preview.generateAnyway')}
        </Button>
      </div>
    </div>
  </Modal>
);
