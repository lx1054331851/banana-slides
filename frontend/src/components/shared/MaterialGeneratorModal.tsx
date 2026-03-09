import React from 'react';
import { Modal } from './Modal';
import { useT } from '@/hooks/useT';
import { MaterialGeneratorForm } from './MaterialGeneratorForm';

// MaterialGeneratorModal 组件自包含翻译
const materialGeneratorI18n = {
  zh: {
    material: {
      title: "素材生成", saveToLibraryNote: "生成的素材会保存到素材库",
      generatedResult: "生成结果", generatedMaterial: "生成的素材", generatedPreview: "生成的素材会展示在这里",
      promptLabel: "提示词（原样发送给文生图模型）",
      promptPlaceholder: "例如：蓝紫色渐变背景，带几何图形和科技感线条，用于科技主题标题页...",
      aspectRatioLabel: "生成比例",
      referenceImages: "参考图片（可选）", mainReference: "主参考图（可选）", extraReference: "额外参考图（可选，多张）",
      clickToUpload: "点击上传", selectFromLibrary: "从素材库选择", generateMaterial: "生成素材",
      messages: {
        enterPrompt: "请输入提示词", materialAdded: "已添加 {{count}} 个素材",
        generateSuccess: "素材生成成功，已保存到历史素材库", generateSuccessGlobal: "素材生成成功，已保存到全局素材库",
        generateComplete: "素材生成完成，但未找到图片地址", generateFailed: "素材生成失败",
        generateTimeout: "素材生成超时，请稍后查看素材库", pollingFailed: "轮询任务状态失败，请稍后查看素材库",
        noTaskId: "素材生成失败：未返回任务ID"
      }
    }
  },
  en: {
    material: {
      title: "Generate Material", saveToLibraryNote: "Generated materials will be saved to the library",
      generatedResult: "Generated Result", generatedMaterial: "Generated Material", generatedPreview: "Generated materials will be displayed here",
      promptLabel: "Prompt (sent directly to text-to-image model)",
      promptPlaceholder: "e.g., Blue-purple gradient background with geometric shapes and tech-style lines for a tech-themed title page...",
      aspectRatioLabel: "Aspect Ratio",
      referenceImages: "Reference Images (Optional)", mainReference: "Main Reference (Optional)", extraReference: "Extra References (Optional, multiple)",
      clickToUpload: "Click to upload", selectFromLibrary: "Select from Library", generateMaterial: "Generate Material",
      messages: {
        enterPrompt: "Please enter a prompt", materialAdded: "Added {{count}} material(s)",
        generateSuccess: "Material generated successfully, saved to history library", generateSuccessGlobal: "Material generated successfully, saved to global library",
        generateComplete: "Material generation complete, but image URL not found", generateFailed: "Failed to generate material",
        generateTimeout: "Material generation timeout, please check the library later", pollingFailed: "Failed to poll task status, please check the library later",
        noTaskId: "Material generation failed: No task ID returned"
      }
    }
  }
};

interface MaterialGeneratorModalProps {
  projectId?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onGenerated?: (taskId?: string) => void;
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
