import type {
  PageAiMessage,
  PageAiReference,
  PageAiRegionBounds,
} from '@/types';

export type PageAiUploadedReference = {
  id: string;
  sourceType: 'region' | 'upload' | 'material';
  file: File;
  previewUrl: string;
  label: string;
  markdownUrl?: string;
  regionBounds?: PageAiRegionBounds;
  regionComment?: string;
};

export type PendingRegionCapture = {
  regionBounds: PageAiRegionBounds;
};

export type PageAiReferenceMeta = {
  clientId: string;
  sourceType: PageAiUploadedReference['sourceType'] | 'annotated-page';
  label: string;
  regionBounds?: PageAiRegionBounds;
  regionComment?: string;
  regionIndex?: number;
};

export type PageAiContextState = {
  draftInput: string;
  messages: PageAiMessage[];
  model: string;
  contextImages: {
    useTemplate: boolean;
    descImageUrls: string[];
    uploadedReferences: PageAiUploadedReference[];
  };
};

export type MaterialSelectorMode = 'pageAi' | 'pageAiInline' | 'description';

export const createPageAiMessage = (
  role: PageAiMessage['role'],
  content: string,
  attachments: PageAiReference[] = [],
  tone: PageAiMessage['tone'] = 'default',
): PageAiMessage => ({
  id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  role,
  content,
  tone,
  attachments,
});

// Build a page AI reference and create a local preview only when one was not supplied.
export const createUploadedReference = (
  file: File,
  sourceType: PageAiUploadedReference['sourceType'],
  label: string = file.name,
  meta?: Pick<PageAiUploadedReference, 'previewUrl' | 'regionBounds' | 'markdownUrl' | 'regionComment'>,
): PageAiUploadedReference => {
  const previewUrl = meta?.previewUrl ?? URL.createObjectURL(file);
  return {
    id: `${sourceType}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    sourceType,
    file,
    previewUrl,
    label,
    markdownUrl: meta?.markdownUrl ?? previewUrl,
    regionBounds: meta?.regionBounds,
    regionComment: meta?.regionComment,
  };
};
