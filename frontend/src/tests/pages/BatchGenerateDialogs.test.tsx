import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BatchGenerateDialogs } from '@/pages/components/BatchGenerateDialogs';

// Provides the small i18n surface needed to render the dialog under test.
const t = (key: string, options?: Record<string, unknown>) => {
  const translations: Record<string, string> = {
    'preview.confirmPartialDescriptionGenerateTitle': '选择描述生成范围',
    'preview.confirmPartialDescriptionGenerateMessage': '已有 {{generated}}/{{total}} 页生成过描述。',
    'preview.generateMissingDescriptionsOnly': '仅生成未生成描述的 {{count}} 页',
    'preview.regenerateAllDescriptions': '重新生成全部 {{count}} 页描述',
    'preview.generateDescriptionsByRange': '按页码范围生成描述',
    'preview.rangeSeparator': '到',
    'preview.rangeStartPage': '开始页码',
    'preview.rangeEndPage': '结束页码',
    'common.cancel': '取消',
  };

  return (translations[key] || key).replace(/\{\{(\w+)\}\}/g, (_, name) => String(options?.[name] ?? ''));
};

describe('BatchGenerateDialogs', () => {
  it('stretches the description range action to align with the dialog edge', async () => {
    render(
      <BatchGenerateDialogs
        t={t}
        showBatchGenerateDialog={false}
        batchGenerateContext={null}
        onCloseBatchGenerateDialog={vi.fn()}
        onGenerateMissingImages={vi.fn()}
        onRegenerateAllImages={vi.fn()}
        showBatchDescriptionGenerateDialog
        batchDescriptionGenerateContext={{
          total: 21,
          generated: 0,
          generating: 0,
          missing: 21,
          targetPageIds: [],
          missingPageIds: [],
        }}
        descriptionRangeStart="1"
        descriptionRangeEnd="21"
        onDescriptionRangeStartChange={vi.fn()}
        onDescriptionRangeEndChange={vi.fn()}
        onGenerateMissingDescriptions={vi.fn()}
        onRegenerateAllDescriptions={vi.fn()}
        onGenerateDescriptionsByRange={vi.fn()}
        onCloseBatchDescriptionGenerateDialog={vi.fn()}
      />
    );

    const rangeButton = await screen.findByRole('button', { name: '按页码范围生成描述' });

    await waitFor(() => {
      expect(rangeButton).toHaveClass('w-full');
    });
  });

  it('renders the description dialog cancel action as a clear neutral button', async () => {
    render(
      <BatchGenerateDialogs
        t={t}
        showBatchGenerateDialog={false}
        batchGenerateContext={null}
        onCloseBatchGenerateDialog={vi.fn()}
        onGenerateMissingImages={vi.fn()}
        onRegenerateAllImages={vi.fn()}
        showBatchDescriptionGenerateDialog
        batchDescriptionGenerateContext={{
          total: 21,
          generated: 0,
          generating: 0,
          missing: 21,
          targetPageIds: [],
          missingPageIds: [],
        }}
        descriptionRangeStart="1"
        descriptionRangeEnd="21"
        onDescriptionRangeStartChange={vi.fn()}
        onDescriptionRangeEndChange={vi.fn()}
        onGenerateMissingDescriptions={vi.fn()}
        onRegenerateAllDescriptions={vi.fn()}
        onGenerateDescriptionsByRange={vi.fn()}
        onCloseBatchDescriptionGenerateDialog={vi.fn()}
      />
    );

    const cancelButton = await screen.findByRole('button', { name: '取消' });

    expect(cancelButton).toHaveClass('self-center');
    expect(cancelButton).toHaveClass('h-9');
    expect(cancelButton).toHaveClass('min-w-20');
    expect(cancelButton).toHaveClass('border-gray-300');
  });
});
