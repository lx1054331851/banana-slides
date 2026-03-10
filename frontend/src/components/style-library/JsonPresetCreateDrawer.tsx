import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/shared';
import type { StyleTemplate } from '@/api/endpoints';

interface JsonPresetCreateDrawerProps {
  isOpen: boolean;
  templates: StyleTemplate[];
  runningTaskCount: number;
  maxRunningTasks: number;
  loadingGenerate: boolean;
  loadingManualCreate: boolean;
  onClose: () => void;
  onGenerate: (payload: { templateId: string; name: string; requirements: string }) => Promise<void>;
  onManualCreate: (payload: { name: string; styleJson: string }) => Promise<void>;
}

export const JsonPresetCreateDrawer: React.FC<JsonPresetCreateDrawerProps> = ({
  isOpen,
  templates,
  runningTaskCount,
  maxRunningTasks,
  loadingGenerate,
  loadingManualCreate,
  onClose,
  onGenerate,
  onManualCreate,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [presetName, setPresetName] = useState('');
  const [requirements, setRequirements] = useState('');
  const [manualExpanded, setManualExpanded] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualJson, setManualJson] = useState('');

  const limitReached = runningTaskCount >= maxRunningTasks;
  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === selectedTemplateId) || null,
    [templates, selectedTemplateId],
  );

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setIsAnimating(true)));
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      if (!selectedTemplateId && templates[0]?.id) setSelectedTemplateId(templates[0].id);
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }

    setIsAnimating(false);
    const timer = window.setTimeout(() => setIsVisible(false), 220);
    document.body.style.overflow = '';
    return () => window.clearTimeout(timer);
  }, [isOpen, selectedTemplateId, templates]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isVisible || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50" aria-hidden={!isOpen}>
      <button
        type="button"
        className={`absolute inset-0 bg-black/45 backdrop-blur-sm transition-opacity duration-200 ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-label="close create preset drawer backdrop"
      />

      <div
        role="dialog"
        aria-modal="true"
        data-testid="style-library-create-preset-drawer"
        className={`absolute flex flex-col bg-white dark:bg-background-secondary border border-gray-200 dark:border-border-primary shadow-2xl transition-transform duration-200 ease-out
          left-0 right-0 bottom-0 max-h-[85vh] rounded-t-2xl
          md:left-auto md:right-0 md:top-0 md:bottom-0 md:w-[min(720px,90vw)] md:max-h-none md:rounded-none md:rounded-l-2xl
          ${isAnimating ? 'translate-y-0 md:translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-y-0 md:translate-x-full'}`}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 dark:border-border-primary">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 dark:text-white">新建 JSON 文本模版</div>
            <div className="text-xs text-gray-500 dark:text-foreground-tertiary truncate">默认通过骨架生成；手动创建保留在高级选项中</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-gray-200 dark:border-border-primary text-gray-500 dark:text-foreground-tertiary hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-background-hover transition-colors"
            aria-label="关闭新建抽屉"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          <div className="space-y-3 rounded-2xl border border-gray-200 dark:border-border-primary p-4 bg-white/70 dark:bg-background-secondary">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-gray-800 dark:text-white">基于骨架生成</div>
                <div className="text-xs text-gray-500 dark:text-foreground-tertiary mt-1">先用 LLM 生成 JSON，再异步生成首页 / 目录 / 详情 / 结尾 4 张预览图</div>
              </div>
              <Sparkles size={18} className="text-banana-600" />
            </div>

            {limitReached ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
                当前已有 {runningTaskCount} 个生成任务在进行中，最多同时运行 {maxRunningTasks} 个，请等待任务完成后再继续创建。
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1">
                <div className="text-xs font-medium text-gray-700 dark:text-foreground-secondary">JSON 骨架</div>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-tertiary dark:text-white"
                >
                  <option value="">选择 JSON 文本模版骨架</option>
                  {templates.map((item) => (
                    <option key={item.id} value={item.id}>{item.name || item.id}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-medium text-gray-700 dark:text-foreground-secondary">模版名称（可选）</div>
                <input
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="留空时由 AI 自动命名"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-tertiary dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs font-medium text-gray-700 dark:text-foreground-secondary">用户指向性提示词（可选）</div>
                <textarea
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                  rows={4}
                  placeholder="例如：用于医疗器械融资路演、科技发布会、ESG 年度汇报等"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-tertiary dark:text-white"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                size="sm"
                loading={loadingGenerate}
                disabled={!selectedTemplate || limitReached}
                onClick={() => void onGenerate({ templateId: selectedTemplateId, name: presetName, requirements })}
              >
                发起生成
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 dark:border-border-primary overflow-hidden">
            <button
              type="button"
              className="w-full px-4 py-3 flex items-center justify-between text-left bg-gray-50 dark:bg-background-secondary"
              onClick={() => setManualExpanded((prev) => !prev)}
            >
              <div>
                <div className="text-sm font-medium text-gray-800 dark:text-white">高级选项：手动创建</div>
                <div className="text-xs text-gray-500 dark:text-foreground-tertiary mt-1">不抢主路径，只在需要时展开手动粘贴 style_json</div>
              </div>
              <ChevronDown size={16} className={`transition-transform ${manualExpanded ? 'rotate-180' : ''}`} />
            </button>

            {manualExpanded ? (
              <div className="p-4 space-y-3 bg-white dark:bg-background-secondary">
                <input
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="模版名称（可选）"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-tertiary dark:text-white"
                />
                <textarea
                  value={manualJson}
                  onChange={(e) => setManualJson(e.target.value)}
                  rows={10}
                  placeholder="请输入 style_json"
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-tertiary dark:text-white"
                />
                <div className="flex justify-end">
                  <Button size="sm" loading={loadingManualCreate} onClick={() => void onManualCreate({ name: manualName, styleJson: manualJson })}>
                    保存手动模版
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
