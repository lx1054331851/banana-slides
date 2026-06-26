import type { PageAiRegionBounds } from '@/types';
import type {
  PageAiReferenceMeta,
  PageAiUploadedReference,
  PendingRegionCapture,
} from './SlidePreview.pageAi';

type RegionInstructionSummary = {
  promptText: string;
  regionReferences: PageAiUploadedReference[];
};

const clampRatio = (value: number): number => (
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
);

const normalizeRegionBounds = (bounds: PageAiRegionBounds): PageAiRegionBounds => {
  const leftRatio = clampRatio(bounds.leftRatio);
  const topRatio = clampRatio(bounds.topRatio);
  const widthRatio = Math.min(clampRatio(bounds.widthRatio), 1 - leftRatio);
  const heightRatio = Math.min(clampRatio(bounds.heightRatio), 1 - topRatio);
  return {
    leftRatio,
    topRatio,
    widthRatio,
    heightRatio,
  };
};

const loadImageElement = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
  image.src = src;
});

const canvasToFile = (canvas: HTMLCanvasElement, filename: string): Promise<File> => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (!blob) {
      reject(new Error('Failed to create image blob'));
      return;
    }
    resolve(new File([blob], filename, { type: 'image/png' }));
  }, 'image/png');
});

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const limitedRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + limitedRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, limitedRadius);
  ctx.arcTo(x + width, y + height, x, y + height, limitedRadius);
  ctx.arcTo(x, y + height, x, y, limitedRadius);
  ctx.arcTo(x, y, x + width, y, limitedRadius);
  ctx.closePath();
};

const drawCornerMarks = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  strokeWidth: number,
) => {
  const markLength = Math.max(24, Math.round(Math.min(width, height) * 0.12));
  const gap = Math.max(3, Math.round(strokeWidth * 0.6));
  const lineWidth = Math.max(3, Math.round(strokeWidth * 0.8));

  ctx.save();
  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([]);
  ctx.lineCap = 'round';

  const corners = [
    [x, y, 1, 1],
    [x + width, y, -1, 1],
    [x, y + height, 1, -1],
    [x + width, y + height, -1, -1],
  ] as const;

  corners.forEach(([cx, cy, dx, dy]) => {
    ctx.beginPath();
    ctx.moveTo(cx + dx * gap, cy);
    ctx.lineTo(cx + dx * (markLength + gap), cy);
    ctx.moveTo(cx, cy + dy * gap);
    ctx.lineTo(cx, cy + dy * (markLength + gap));
    ctx.stroke();
  });

  ctx.restore();
};

export const buildRegionInstructionLines = (
  references: PageAiUploadedReference[],
): string[] => references
  .filter((reference) => reference.sourceType === 'region' && reference.regionComment?.trim())
  .map((reference, index) => `区域${index + 1}：${reference.regionComment?.trim()}`);

const isArtifactLine = (line: string, references: PageAiUploadedReference[]): boolean => {
  const normalized = line.trim();
  if (!normalized) return true;
  if (/^区域\d+[：:]/.test(normalized) || /^图片\d+[：:]/.test(normalized)) {
    return true;
  }
  return references.some((reference) => {
    const candidates = [
      reference.label,
      reference.file?.name,
      reference.file?.name?.replace(/\.[^.]+$/, ''),
    ].filter((item): item is string => Boolean(item && item.trim()));
    return candidates.some((candidate) => candidate.trim() === normalized);
  });
};

export const buildStructuredEditPrompt = (
  editPrompt: string,
  references: PageAiUploadedReference[],
): string => {
  const regionRefs = references.filter((reference) => reference.sourceType === 'region');
  const regionLines = buildRegionInstructionLines(regionRefs);
  const freeformLines = (editPrompt || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !isArtifactLine(line, references) && !/^(图片\d+|区域\d+)[：:]/.test(line));

  const sections: string[] = [];
  if (regionLines.length > 0) {
    sections.push(regionLines.join('\n'));
  }
  if (freeformLines.length > 0) {
    sections.push(freeformLines.join('\n'));
  }
  return sections.join('\n\n').trim();
};

export const summarizeRegionInstructions = (
  references: PageAiUploadedReference[],
): RegionInstructionSummary => {
  const regionReferences = references.filter((reference) => reference.sourceType === 'region');
  return {
    promptText: buildRegionInstructionLines(regionReferences).join('\n'),
    regionReferences,
  };
};

export const buildReferenceMetas = (
  references: PageAiUploadedReference[],
): PageAiReferenceMeta[] => references.map((reference, index) => ({
  clientId: reference.id,
  sourceType: reference.sourceType,
  label: reference.label,
  regionBounds: reference.regionBounds,
  regionComment: reference.regionComment,
  regionIndex: reference.sourceType === 'region'
    ? references
      .filter((_, itemIndex) => itemIndex <= index)
      .filter((item) => item.sourceType === 'region')
      .length
    : undefined,
}));

export const createAnnotatedRegionImage = async (
  baseImageUrl: string,
  regions: Array<Pick<PendingRegionCapture, 'regionBounds'>>,
): Promise<File> => {
  const image = await loadImageElement(baseImageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx || !canvas.width || !canvas.height) {
    throw new Error('Failed to prepare annotation canvas');
  }

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const baseStroke = Math.max(4, Math.round(Math.min(canvas.width, canvas.height) * 0.006));
  const fontSize = Math.max(22, Math.round(Math.min(canvas.width, canvas.height) * 0.032));
  const labelPaddingX = Math.max(12, Math.round(fontSize * 0.55));
  const labelPaddingY = Math.max(8, Math.round(fontSize * 0.32));
  const radius = Math.max(10, Math.round(fontSize * 0.45));

  ctx.font = `700 ${fontSize}px sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  regions.forEach((region, index) => {
    const bounds = normalizeRegionBounds(region.regionBounds);
    const x = bounds.leftRatio * canvas.width;
    const y = bounds.topRatio * canvas.height;
    const width = bounds.widthRatio * canvas.width;
    const height = bounds.heightRatio * canvas.height;
    const label = `区域${index + 1}`;

    ctx.save();
    ctx.globalAlpha = 0.95;
    drawCornerMarks(ctx, x, y, width, height, baseStroke);
    ctx.restore();

    const textWidth = ctx.measureText(label).width;
    const labelWidth = textWidth + labelPaddingX * 2;
    const labelHeight = fontSize + labelPaddingY * 2;
    const defaultLabelX = x;
    const defaultLabelY = y - labelHeight - baseStroke;
    const labelX = Math.min(Math.max(0, defaultLabelX), Math.max(0, canvas.width - labelWidth));
    const labelY = defaultLabelY >= 0
      ? defaultLabelY
      : Math.min(canvas.height - labelHeight, y + baseStroke);

    ctx.save();
    ctx.fillStyle = '#F59E0B';
    drawRoundedRect(ctx, labelX, labelY, labelWidth, labelHeight, Math.min(radius, labelHeight / 2));
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.fillText(label, labelX + labelPaddingX, labelY + labelHeight / 2);
    ctx.restore();
  });

  return canvasToFile(canvas, `page-ai-annotated-${Date.now()}.png`);
};
