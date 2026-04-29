import React from 'react';
import { Modal } from './Modal';
import { useT } from '@/hooks/useT';
import { MaterialGeneratorForm } from './MaterialGeneratorForm';

const materialGeneratorI18n = {
  zh: {
    material: {
      title: '素材工具箱',
      saveToLibraryNote: '所有处理结果都会作为新素材保存到素材库，原图不会被覆盖。',
      generatedResult: '处理结果',
      generatedPreview: '处理结果会展示在这里',
      sourceImage: '处理目标图',
      sourceImageHint: '整图编辑、框选编辑、智能擦除都需要先选择一张目标图。',
      referenceImages: '参考图片（可选）',
      mainReference: '主参考图',
      extraReference: '额外参考图',
      clickToUpload: '点击上传',
      selectFromLibrary: '从素材库选择',
      promptLabel: '编辑指令',
      promptPlaceholderGenerate: '例如：蓝紫色渐变背景，带几何图形和科技感线条，用于科技主题标题页...',
      promptPlaceholderEdit: '例如：把主视觉改成银色金属质感，整体更高级，保留主体构图...',
      promptPlaceholderRegion: '例如：把选区里的按钮改成玻璃拟态风格，并补上高光细节...',
      promptPlaceholderErase: '可选：补充擦除后的背景要求，例如“补成纯白台面纹理”',
      aspectRatioLabel: '生成比例',
      toolModeLabel: '工具模式',
      toolGenerate: '生成新素材',
      toolEditFull: '整图编辑',
      toolRegionEdit: '框选编辑',
      toolEraseRegion: '智能擦除',
      runTool: '执行工具',
      toolGenerateDesc: '从文本或参考图生成新图',
      toolEditFullDesc: '基于现有图整体重绘',
      toolRegionEditDesc: '只聚焦选区进行修改',
      toolEraseRegionDesc: '擦掉选区内容并补背景',
      selectionLabel: '选区',
      selectionHint: '打开选区模式后，在图片上拖拽框选要处理的区域。',
      selectionReady: '已选择 {{width}} × {{height}} px 区域',
      selectionEmpty: '尚未选择区域',
      startSelection: '开始框选',
      stopSelection: '结束框选',
      applyModeLabel: '区域结果应用方式',
      applyOverlay: '只把选区覆盖回原图',
      applyReplaceFull: '直接用整张结果覆盖',
      useResultAsSource: '将结果作为新源图继续处理',
      clearResult: '清空结果',
      enterFullscreen: '全屏展开',
      exitFullscreen: '退出全屏',
      messages: {
        enterPrompt: '请输入编辑指令',
        chooseSource: '请先选择一张处理目标图',
        chooseSelection: '请先框选要处理的区域',
        materialAdded: '已添加 {{count}} 个素材',
        sourceLoaded: '已载入源图',
        generateSuccess: '素材处理成功，已保存到历史素材库',
        generateSuccessGlobal: '素材处理成功，已保存到全局素材库',
        generateComplete: '处理完成，但未找到结果图片地址',
        generateFailed: '素材处理失败',
        generateTimeout: '处理超时，请稍后到素材库查看',
        pollingFailed: '轮询任务状态失败，请稍后到素材库查看',
        noTaskId: '素材处理失败：未返回任务ID',
        loadMaterialFailed: '加载素材失败',
        resultPromoted: '已将结果设为新的源图',
      },
    },
  },
  en: {
    material: {
      title: 'Material Toolbox',
      saveToLibraryNote: 'Every processed result is saved as a new material. The original image stays untouched.',
      generatedResult: 'Result',
      generatedPreview: 'Processed output will appear here',
      sourceImage: 'Source Image',
      sourceImageHint: 'Full-image edit, region edit, and smart erase all need a source image first.',
      referenceImages: 'Reference Images (Optional)',
      mainReference: 'Primary Reference',
      extraReference: 'Extra References',
      clickToUpload: 'Click to upload',
      selectFromLibrary: 'Select from Library',
      promptLabel: 'Instruction',
      promptPlaceholderGenerate: 'e.g. Blue-purple gradient background with geometric shapes and tech-style lines for a tech-themed title page...',
      promptPlaceholderEdit: 'e.g. Restyle the image with brushed silver metal details while keeping the main composition...',
      promptPlaceholderRegion: 'e.g. Turn the selected button into glassmorphism with subtle highlights...',
      promptPlaceholderErase: 'Optional: describe what should fill the erased region, such as "clean white tabletop texture"',
      aspectRatioLabel: 'Aspect Ratio',
      toolModeLabel: 'Tool Mode',
      toolGenerate: 'Generate',
      toolEditFull: 'Full Edit',
      toolRegionEdit: 'Region Edit',
      toolEraseRegion: 'Smart Erase',
      runTool: 'Run Tool',
      toolGenerateDesc: 'Create a new material from prompt or refs',
      toolEditFullDesc: 'Restyle the whole source image',
      toolRegionEditDesc: 'Focus edits on the selected region',
      toolEraseRegionDesc: 'Remove selected content and heal the background',
      selectionLabel: 'Selection',
      selectionHint: 'Turn on selection mode, then drag on the image to choose the target region.',
      selectionReady: 'Selected {{width}} × {{height}} px area',
      selectionEmpty: 'No selection yet',
      startSelection: 'Start Selection',
      stopSelection: 'End Selection',
      applyModeLabel: 'How to apply the region result',
      applyOverlay: 'Overlay only the selected region',
      applyReplaceFull: 'Replace with the full generated image',
      useResultAsSource: 'Use result as new source',
      clearResult: 'Clear Result',
      enterFullscreen: 'Expand Fullscreen',
      exitFullscreen: 'Exit Fullscreen',
      messages: {
        enterPrompt: 'Please enter an instruction',
        chooseSource: 'Please choose a source image first',
        chooseSelection: 'Please select a region first',
        materialAdded: 'Added {{count}} material(s)',
        sourceLoaded: 'Source image loaded',
        generateSuccess: 'Material processed successfully and saved to the project library',
        generateSuccessGlobal: 'Material processed successfully and saved to the global library',
        generateComplete: 'Processing finished, but no result image URL was returned',
        generateFailed: 'Failed to process material',
        generateTimeout: 'Processing timed out. Please check the material library later',
        pollingFailed: 'Failed to poll task status. Please check the material library later',
        noTaskId: 'Processing failed: no task ID returned',
        loadMaterialFailed: 'Failed to load materials',
        resultPromoted: 'Result is now the new source image',
      },
    },
  },
};

interface MaterialGeneratorModalProps {
  projectId?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onGenerated?: (taskId?: string) => void;
}

type SelectorTarget = 'source' | 'references';
type DisplayRect = { left: number; top: number; width: number; height: number };
type PersistedMaterialRun = {
  taskId: string | null;
  previewUrl: string | null;
  status: 'idle' | 'pending' | 'completed' | 'failed';
  updatedAt: number;
};
type ToolCard = {
  value: MaterialProcessOperation;
  icon: React.ReactNode;
  labelKey: string;
  descKey: string;
};

function getRenderedImageRect(img: HTMLImageElement) {
  const naturalWidth = img.naturalWidth || 1;
  const naturalHeight = img.naturalHeight || 1;
  const scale = Math.min(img.clientWidth / naturalWidth, img.clientHeight / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  const left = (img.clientWidth - width) / 2;
  const top = (img.clientHeight - height) / 2;
  return { left, top, width, height, naturalWidth, naturalHeight };
}

const TOOL_CARDS: ToolCard[] = [
  { value: 'generate', icon: <Sparkles size={16} />, labelKey: 'material.toolGenerate', descKey: 'material.toolGenerateDesc' },
  { value: 'edit_full', icon: <Wand2 size={16} />, labelKey: 'material.toolEditFull', descKey: 'material.toolEditFullDesc' },
  { value: 'region_edit', icon: <Crop size={16} />, labelKey: 'material.toolRegionEdit', descKey: 'material.toolRegionEditDesc' },
  { value: 'erase_region', icon: <Eraser size={16} />, labelKey: 'material.toolEraseRegion', descKey: 'material.toolEraseRegionDesc' },
];

const MATERIAL_POLL_INTERVAL_MS = 2000;
const MATERIAL_MAX_POLL_ATTEMPTS = 90;

function getMaterialRunStorageKey(projectId?: string | null) {
  return `banana-material-toolbox:${projectId || 'global'}`;
}

export const MaterialGeneratorModal: React.FC<MaterialGeneratorModalProps> = ({
  projectId,
  isOpen,
  onClose,
  onGenerated,
}) => {
  const t = useT(materialGeneratorI18n);
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('material.title')} size="lg">
      <MaterialGeneratorForm projectId={projectId} onClose={onClose} onGenerated={onGenerated} />
    </Modal>
  );
};
