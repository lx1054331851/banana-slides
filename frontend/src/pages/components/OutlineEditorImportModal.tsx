import React from 'react';
import { ImportMarkdownModal } from '@/components/shared/ImportMarkdownModal';
import { addPages } from '@/api/endpoints';
import { parseMarkdownPages } from '@/utils/projectUtils';
import type { Project } from '@/types';

interface OutlineEditorImportModalProps {
  isOpen: boolean;
  project: Project;
  onClose: () => void;
  onImported: () => Promise<void>;
}

/** Preview Markdown pages and append them in a single database transaction. */
export const OutlineEditorImportModal: React.FC<OutlineEditorImportModalProps> = ({ isOpen, project, onClose, onImported }) => (
  <ImportMarkdownModal isOpen={isOpen} onClose={onClose}
    title="导入 Markdown 页面" description="预览识别页数后，将页面追加到当前项目。"
    pasteLabel="Markdown 内容" pastePlaceholder="粘贴大纲或页面描述 Markdown"
    uploadLabel="选择文件" uploadHint="支持拖入 Markdown 或文本文件"
    uploadFormatsHint=".md / .markdown / .txt" importButtonLabel="导入" cancelButtonLabel="取消"
    emptyError="请输入内容" readFileError="读取文件失败" invalidFileTypeError="请选择 Markdown 或文本文件"
    getPreviewCount={(text) => parseMarkdownPages(text).length}
    previewReadyLabel={(count) => `已识别 ${count} 页`} previewEmptyLabel="未识别到有效页面"
    onImport={async (text) => {
      const parsed = parseMarkdownPages(text);
      const startIndex = project.pages.reduce((max, page) => Math.max(max, (page.order_index ?? 0) + 1), 0);
      await addPages(project.id!, parsed.map(({ title, page_type, points, text: description, part, extra_fields }, index) => ({
        outline_content: { title, page_type: page_type || '标准图文页', points },
        description_content: description ? { text: description, ...(extra_fields ? { extra_fields } : {}) } : undefined,
        part, order_index: startIndex + index,
      })));
      await onImported();
    }} />
);
