import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, ImagePlus, Upload, X, FolderOpen } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { Textarea } from './Textarea';
import { Button } from './Button';
import { useToast } from './Toast';
import { MaterialSelector, materialUrlToFile } from './MaterialSelector';
import { ASPECT_RATIO_OPTIONS } from '@/config/aspectRatio';
import { useProjectStore } from '@/store/useProjectStore';
import { generateMaterialImage, getTaskStatus } from '@/api/endpoints';
import type { Material } from '@/api/endpoints';
import type { Task } from '@/types';

const materialGeneratorI18n = {
  zh: {
    material: {
      title: '素材生成',
      saveToLibraryNote: '生成的素材会保存到素材库',
      generatedResult: '生成结果',
      generatedMaterial: '生成的素材',
      generatedPreview: '生成的素材会展示在这里',
      promptLabel: '提示词（原样发送给文生图模型）',
      promptPlaceholder: '例如：蓝紫色渐变背景，带几何图形和科技感线条，用于科技主题标题页...',
      aspectRatioLabel: '生成比例',
      referenceImages: '参考图片（可选）',
      mainReference: '主参考图（可选）',
      extraReference: '额外参考图（可选，多张）',
      clickToUpload: '点击上传',
      selectFromLibrary: '从素材库选择',
      generateMaterial: '生成素材',
      messages: {
        enterPrompt: '请输入提示词',
        materialAdded: '已添加 {{count}} 个素材',
        loadMaterialFailed: '加载素材失败',
        generateSuccess: '素材生成成功，已保存到历史素材库',
        generateSuccessGlobal: '素材生成成功，已保存到全局素材库',
        generateComplete: '素材生成完成，但未找到图片地址',
        generateFailed: '素材生成失败',
        generateTimeout: '素材生成超时，请稍后查看素材库',
        pollingFailed: '轮询任务状态失败，请稍后查看素材库',
        noTaskId: '素材生成失败：未返回任务ID'
      }
    }
  },
  en: {
    material: {
      title: 'Generate Material',
      saveToLibraryNote: 'Generated materials will be saved to the library',
      generatedResult: 'Generated Result',
      generatedMaterial: 'Generated Material',
      generatedPreview: 'Generated materials will be displayed here',
      promptLabel: 'Prompt (sent directly to text-to-image model)',
      promptPlaceholder: 'e.g., Blue-purple gradient background with geometric shapes and tech-style lines for a tech-themed title page...',
      aspectRatioLabel: 'Aspect Ratio',
      referenceImages: 'Reference Images (Optional)',
      mainReference: 'Main Reference (Optional)',
      extraReference: 'Extra References (Optional, multiple)',
      clickToUpload: 'Click to upload',
      selectFromLibrary: 'Select from Library',
      generateMaterial: 'Generate Material',
      messages: {
        enterPrompt: 'Please enter a prompt',
        materialAdded: 'Added {{count}} material(s)',
        loadMaterialFailed: 'Failed to load materials',
        generateSuccess: 'Material generated successfully, saved to history library',
        generateSuccessGlobal: 'Material generated successfully, saved to global library',
        generateComplete: 'Material generation complete, but image URL not found',
        generateFailed: 'Failed to generate material',
        generateTimeout: 'Material generation timeout, please check the library later',
        pollingFailed: 'Failed to poll task status, please check the library later',
        noTaskId: 'Material generation failed: No task ID returned'
      }
    }
  }
};

interface MaterialGeneratorFormProps {
  projectId?: string | null;
  onClose?: () => void;
  onGenerated?: (taskId?: string) => void;
  onTaskCreated?: (task: { taskId: string; projectId: string | null; prompt: string; aspectRatio: string }) => void;
  showCloseButton?: boolean;
}

export const MaterialGeneratorForm: React.FC<MaterialGeneratorFormProps> = ({
  projectId,
  onClose,
  onGenerated,
  onTaskCreated,
  showCloseButton = true,
}) => {
  const t = useT(materialGeneratorI18n);
  const { show } = useToast();
  const currentProject = useProjectStore((s) => s.currentProject);
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [refImage, setRefImage] = useState<File | null>(null);
  const [extraImages, setExtraImages] = useState<File[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isMaterialSelectorOpen, setIsMaterialSelectorOpen] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const refImageUrl = useRef<string | null>(null);
  const extraImageUrls = useRef<string[]>([]);

  useEffect(() => {
    const projectAspectRatio =
      (projectId && currentProject?.id === projectId && currentProject.image_aspect_ratio) || '16:9';
    setAspectRatio(projectAspectRatio);
  }, [projectId, currentProject]);

  useEffect(() => {
    if (refImageUrl.current) URL.revokeObjectURL(refImageUrl.current);
    refImageUrl.current = refImage ? URL.createObjectURL(refImage) : null;
  }, [refImage]);

  useEffect(() => {
    extraImageUrls.current.forEach((url) => URL.revokeObjectURL(url));
    extraImageUrls.current = extraImages.map((file) => URL.createObjectURL(file));
  }, [extraImages]);

  useEffect(() => {
    return () => {
      if (refImageUrl.current) URL.revokeObjectURL(refImageUrl.current);
      extraImageUrls.current.forEach((url) => URL.revokeObjectURL(url));
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, []);

  const handleRefImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = (e.target.files && e.target.files[0]) || null;
    if (file) setRefImage(file);
  };

  const handleExtraImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (!refImage) {
      const [first, ...rest] = files;
      setRefImage(first);
      if (rest.length > 0) setExtraImages((prev) => [...prev, ...rest]);
      return;
    }
    setExtraImages((prev) => [...prev, ...files]);
  };

  const removeExtraImage = (index: number) => {
    setExtraImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSelectMaterials = async (materials: Material[]) => {
    try {
      const files = await Promise.all(materials.map((material) => materialUrlToFile(material)));
      if (files.length === 0) return;

      if (!refImage) {
        const [first, ...rest] = files;
        setRefImage(first);
        if (rest.length > 0) setExtraImages((prev) => [...prev, ...rest]);
      } else {
        setExtraImages((prev) => [...prev, ...files]);
      }

      show({ message: t('material.messages.materialAdded', { count: files.length }), type: 'success' });
    } catch (error: any) {
      show({
        message: t('material.messages.loadMaterialFailed') + ': ' + (error.message || t('common.unknownError')),
        type: 'error',
      });
    }
  };

  const notifyGenerated = (taskId?: string) => {
    if (!onGenerated) return;
    try {
      onGenerated(taskId);
    } catch {
      // keep generation flow unaffected
    }
  };

  const pollMaterialTask = async (taskId: string) => {
    const targetProjectId = projectId || 'global';
    const maxAttempts = 60;
    let attempts = 0;

    const poll = async () => {
      try {
        attempts++;
        const response = await getTaskStatus(targetProjectId, taskId);
        const task = response.data as Task | undefined;
        if (!task) throw new Error('Missing task data');

        if (task.status === 'COMPLETED') {
          const progress = (task.progress || {}) as { image_url?: string };
          const imageUrl = progress.image_url;

          if (imageUrl) {
            show({
              message: projectId ? t('material.messages.generateSuccess') : t('material.messages.generateSuccessGlobal'),
              type: 'success',
            });
            setIsCompleted(true);
          } else {
            show({ message: t('material.messages.generateComplete'), type: 'error' });
          }

          notifyGenerated(taskId);
          setIsGenerating(false);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          return;
        }

        if (task.status === 'FAILED') {
          show({ message: task.error_message || t('material.messages.generateFailed'), type: 'error' });
          notifyGenerated(taskId);
          setIsGenerating(false);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          return;
        }

        if ((task.status === 'PENDING' || task.status === 'PROCESSING') && attempts >= maxAttempts) {
          show({ message: t('material.messages.generateTimeout'), type: 'warning' });
          notifyGenerated(taskId);
          setIsGenerating(false);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        }
      } catch {
        if (attempts >= maxAttempts) {
          show({ message: t('material.messages.pollingFailed'), type: 'error' });
          notifyGenerated(taskId);
          setIsGenerating(false);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        }
      }
    };

    poll();
    pollingIntervalRef.current = setInterval(poll, 2000);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      show({ message: t('material.messages.enterPrompt'), type: 'error' });
      return;
    }

    setIsGenerating(true);
    try {
      const targetProjectId = projectId || 'none';
      const resp = await generateMaterialImage(targetProjectId, prompt.trim(), refImage as File, extraImages, aspectRatio);
      const taskId = resp.data?.task_id;

      if (taskId) {
        onTaskCreated?.({
          taskId,
          projectId: projectId ?? null,
          prompt: prompt.trim(),
          aspectRatio,
        });
        await pollMaterialTask(taskId);
        return;
      }

      show({ message: t('material.messages.noTaskId'), type: 'error' });
      setIsGenerating(false);
    } catch (error: any) {
      show({
        message: error?.response?.data?.error?.message || error.message || t('material.messages.generateFailed'),
        type: 'error',
      });
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-5">
      <Textarea
        label={t('material.promptLabel')}
        placeholder={t('material.promptPlaceholder')}
        value={prompt}
        onChange={(e) => {
          setPrompt(e.target.value);
          if (isCompleted) setIsCompleted(false);
        }}
        rows={3}
      />

      <div>
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('material.aspectRatioLabel')}</div>
        <div className="flex flex-wrap gap-1.5">
          {ASPECT_RATIO_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setAspectRatio(opt.value);
                if (isCompleted) setIsCompleted(false);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                aspectRatio === opt.value
                  ? 'border-banana-500 bg-banana-50 dark:bg-banana-900/30 text-banana-700 dark:text-banana'
                  : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-800'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative rounded-2xl overflow-hidden border border-gray-200/50 dark:border-white/10 p-5 bg-gradient-to-br from-indigo-50/30 via-white/80 to-purple-50/30 dark:from-indigo-950/20 dark:via-gray-800/40 dark:to-purple-950/20 backdrop-blur-xl shadow-lg">
        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-32 h-32 bg-indigo-400/10 dark:bg-indigo-400/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-32 h-32 bg-purple-400/10 dark:bg-purple-400/5 rounded-full blur-3xl" />
        </div>

        <div className="relative space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200 font-medium">
              <ImagePlus size={18} className="text-indigo-500 dark:text-indigo-400" />
              <span>{t('material.referenceImages')}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon={<FolderOpen size={16} />}
              onClick={() => setIsMaterialSelectorOpen(true)}
              className="hover:bg-indigo-100/50 dark:hover:bg-indigo-900/30"
            >
              {t('material.selectFromLibrary')}
            </Button>
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="space-y-2">
              <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">{t('material.mainReference')}</div>
              <label className="w-40 h-28 border-2 border-dashed border-indigo-300/50 dark:border-indigo-500/30 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all duration-200 bg-white/60 dark:bg-gray-900/40 backdrop-blur-sm relative group shadow-sm hover:shadow-md">
                {refImage ? (
                  <>
                    <img src={refImageUrl.current || ''} alt={t('material.mainReference')} className="w-full h-full object-cover rounded-xl" />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setRefImage(null);
                      }}
                      className="absolute -top-2 -right-2 w-7 h-7 bg-gradient-to-br from-red-500 to-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-lg hover:scale-110 active:scale-95 z-10"
                    >
                      <X size={14} strokeWidth={2.5} />
                    </button>
                  </>
                ) : (
                  <>
                    <ImageIcon size={28} className="text-indigo-400 dark:text-indigo-500 mb-1.5 group-hover:scale-110 transition-transform duration-200" />
                    <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">{t('material.clickToUpload')}</span>
                  </>
                )}
                <input type="file" accept="image/*" className="hidden" onChange={handleRefImageChange} />
              </label>
            </div>

            <div className="flex-1 space-y-2 min-w-[180px]">
              <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">{t('material.extraReference')}</div>
              <div className="flex flex-wrap gap-2">
                {extraImages.map((_, idx) => (
                  <div key={idx} className="relative group">
                    <img
                      src={extraImageUrls.current[idx] || ''}
                      alt={`extra-${idx + 1}`}
                      className="w-20 h-20 object-cover rounded-lg border-2 border-indigo-200/50 dark:border-indigo-500/30 shadow-sm group-hover:shadow-md transition-all duration-200"
                    />
                    <button
                      onClick={() => removeExtraImage(idx)}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-br from-red-500 to-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-lg hover:scale-110 active:scale-95"
                    >
                      <X size={12} strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
                <label className="w-20 h-20 border-2 border-dashed border-indigo-300/50 dark:border-indigo-500/30 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all duration-200 bg-white/60 dark:bg-gray-900/40 backdrop-blur-sm group shadow-sm hover:shadow-md">
                  <Upload size={20} className="text-indigo-400 dark:text-indigo-500 mb-1 group-hover:scale-110 transition-transform duration-200" />
                  <span className="text-[10px] text-gray-600 dark:text-gray-400 font-medium">{t('common.add')}</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleExtraImagesChange} />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-3">
        {showCloseButton && onClose && (
          <Button variant="ghost" onClick={onClose} disabled={isGenerating}>
            {t('common.close')}
          </Button>
        )}
        <Button
          variant="primary"
          onClick={handleGenerate}
          disabled={isGenerating || isCompleted || !prompt.trim()}
          className="shadow-lg shadow-banana-500/20 hover:shadow-xl hover:shadow-banana-500/30 transition-all duration-200"
        >
          {isGenerating ? t('common.generating') : isCompleted ? t('common.completed') : t('material.generateMaterial')}
        </Button>
      </div>

      <MaterialSelector
        projectId={projectId ?? undefined}
        isOpen={isMaterialSelectorOpen}
        onClose={() => setIsMaterialSelectorOpen(false)}
        onSelect={handleSelectMaterials}
        multiple={true}
      />
    </div>
  );
};
