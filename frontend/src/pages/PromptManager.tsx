import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, RefreshCw, RotateCcw } from 'lucide-react';
import { Button, Card, Loading, PageHeader, useToast } from '@/components/shared';
import * as api from '@/api/endpoints';
import type { PromptTemplate } from '@/types';
import { PromptTemplateEditor } from './components/PromptTemplateEditor';
import { PromptTemplateList } from './components/PromptTemplateList';

const MODE_LABELS: Record<string, string> = {
  all: '全部',
  outline: '大纲',
  description: '描述',
  image: '图片',
  renovation: '翻新',
};

// Standalone page for managing backend prompt template overrides.
export const PromptManager: React.FC = () => {
  const navigate = useNavigate();
  const { show, ToastContainer } = useToast();
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [modeFilter, setModeFilter] = useState('all');
  const [customContent, setCustomContent] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [resetPending, setResetPending] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.key === selectedKey) || null,
    [templates, selectedKey],
  );

  const availableModes = useMemo(() => {
    const modes = Array.from(new Set(templates.map((template) => template.mode))).sort();
    return ['all', ...modes];
  }, [templates]);

  const filteredTemplates = useMemo(
    () => templates.filter((template) => modeFilter === 'all' || template.mode === modeFilter),
    [templates, modeFilter],
  );

  const syncEditorState = useCallback((template: PromptTemplate | null) => {
    if (!template) return;
    setCustomContent(template.custom_content || '');
    setEnabled(Boolean(template.enabled));
  }, []);

  const loadTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.getPromptTemplates();
      const nextTemplates = response.data?.templates || [];
      setTemplates(nextTemplates);
      const nextSelected = nextTemplates[0] || null;
      setSelectedKey(nextSelected?.key || '');
      syncEditorState(nextSelected);
    } catch (error: any) {
      show({ message: error?.message || '提示词模板加载失败', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [show, syncEditorState]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const handleSelect = (template: PromptTemplate) => {
    setSelectedKey(template.key);
    syncEditorState(template);
  };

  const handleModeChange = (mode: string) => {
    setModeFilter(mode);
    const next = templates.find((template) => mode === 'all' || template.mode === mode);
    if (next) handleSelect(next);
  };

  const updateTemplateInList = (template: PromptTemplate) => {
    setTemplates((prev) => prev.map((item) => (item.key === template.key ? template : item)));
    setSelectedKey(template.key);
    syncEditorState(template);
  };

  const handleSave = async () => {
    if (!selectedTemplate) return;
    setIsSaving(true);
    try {
      const response = await api.updatePromptTemplate(selectedTemplate.key, {
        custom_content: customContent,
        enabled,
      });
      if (response.data) updateTemplateInList(response.data);
      show({ message: '提示词已保存', type: 'success' });
    } catch (error: any) {
      const message = error?.response?.data?.error?.message || error?.message || '提示词保存失败';
      show({ message, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selectedTemplate) return;
    try {
      const response = await api.resetPromptTemplate(selectedTemplate.key);
      if (response.data) updateTemplateInList(response.data);
      setResetPending(false);
      show({ message: '已恢复默认提示词', type: 'success' });
    } catch (error: any) {
      const message = error?.response?.data?.error?.message || error?.message || '恢复默认失败';
      show({ message, type: 'error' });
    }
  };

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-gray-50 dark:bg-background-primary">
      <PageHeader
        title="提示词管理"
        icon={<FileText size={18} />}
        onBack={() => navigate(-1)}
        onHome={() => navigate('/')}
        backLabel="返回"
        homeLabel="首页"
        actions={(
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />}
            onClick={loadTemplates}
            disabled={isLoading}
          >
            {isLoading ? '刷新中...' : '刷新'}
          </Button>
        )}
      />

      <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 py-6 md:px-6 md:py-8 xl:px-8">
        {isLoading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <Loading message="正在加载提示词模板..." />
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
            <aside className="flex h-full min-h-0 flex-col gap-4">
              <Card className="p-4">
                <div className="mb-3 text-sm font-semibold text-gray-900 dark:text-foreground-primary">模式</div>
                <div className="flex flex-wrap gap-2">
                  {availableModes.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleModeChange(mode)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        modeFilter === mode
                          ? 'bg-banana-500 text-black'
                          : 'bg-gray-100 text-gray-600 hover:bg-banana-100 dark:bg-background-primary dark:text-foreground-secondary'
                      }`}
                    >
                      {MODE_LABELS[mode] || mode}
                    </button>
                  ))}
                </div>
              </Card>
              <PromptTemplateList
                templates={filteredTemplates}
                selectedKey={selectedKey}
                onSelect={handleSelect}
                className="min-h-0 flex-1 pr-1"
              />
            </aside>
            <PromptTemplateEditor
              template={selectedTemplate}
              customContent={customContent}
              enabled={enabled}
              isSaving={isSaving}
              onCustomContentChange={setCustomContent}
              onEnabledChange={setEnabled}
              onSave={handleSave}
              onReset={() => setResetPending(true)}
              className="h-full"
            />
          </div>
        )}
      </main>

      {resetPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl dark:bg-background-secondary">
            <div className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-foreground-primary">
              <RotateCcw size={18} />
              恢复默认提示词
            </div>
            <p className="mt-3 text-sm text-gray-600 dark:text-foreground-secondary">
              将清空当前自定义内容并关闭覆盖，后续生成会使用默认提示词。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setResetPending(false)}>取消</Button>
              <Button onClick={handleReset}>确认恢复</Button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </div>
  );
};
