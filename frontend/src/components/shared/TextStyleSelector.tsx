import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { Textarea } from './Textarea';
import { PRESET_STYLES } from '@/config/presetStyles';
import { presetStylesI18n } from '@/config/presetStylesI18n';
import { createStyleTemplate, extractStyleFromImage, listStylePresets, listStyleTemplates } from '@/api/endpoints';
import type { StylePreset, StyleTemplate } from '@/api/endpoints';

const i18n = {
  zh: {
    presetStyles: presetStylesI18n.zh,
    stylePlaceholder: '描述您想要的 PPT 风格，例如：简约商务风格，使用蓝色和白色配色，字体清晰大方...',
    presetStylesLabel: '快速选择预设风格：',
    styleTip: '提示：点击预设风格快速填充，或自定义描述风格、配色、布局等要求',
    extractFromImage: '从图片提取风格',
    extracting: '提取中...',
    extractSuccess: '风格提取成功',
    extractFailed: '风格提取失败',
    advanced: '高级：风格模板JSON',
    templateJson: '风格模板 JSON 骨架',
    templateJsonHint: '必填：可解析的 JSON（用于让 AI 按字段结构补全风格）',
    templateName: '模板名称（可选）',
    saveTemplate: '保存模板骨架',
    templates: '已保存模板',
    presets: '风格预设（直接应用）',
    generatePreviews: '生成 3 组风格推荐',
    templateJsonRequired: '请先粘贴风格模板 JSON 骨架',
    invalidJson: 'JSON 解析失败',
    needCallback: '当前页面未配置预览工作流',
  },
  en: {
    presetStyles: presetStylesI18n.en,
    stylePlaceholder: 'Describe your desired PPT style, e.g., minimalist business style...',
    presetStylesLabel: 'Quick select preset styles:',
    styleTip: 'Tip: Click preset styles to quick fill, or customize',
    extractFromImage: 'Extract from image',
    extracting: 'Extracting...',
    extractSuccess: 'Style extracted successfully',
    extractFailed: 'Style extraction failed',
    advanced: 'Advanced: Style template JSON',
    templateJson: 'Style template JSON skeleton',
    templateJsonHint: 'Required: Valid JSON (AI will fill style following this schema)',
    templateName: 'Template name (optional)',
    saveTemplate: 'Save template',
    templates: 'Saved templates',
    presets: 'Style presets (apply)',
    generatePreviews: 'Generate 3 style recommendations',
    templateJsonRequired: 'Please paste a style template JSON skeleton first',
    invalidJson: 'Invalid JSON',
    needCallback: 'Preview workflow is not available here',
  },
};

interface TextStyleSelectorProps {
  value: string;
  onChange: (value: string) => void;
  onToast?: (msg: { message: string; type: 'success' | 'error' }) => void;
  onGenerateStylePreviews?: (args: { templateJson: string; styleRequirements: string; generatePreviews?: boolean }) => Promise<void> | void;
  onPresetSelected?: (preset: StylePreset) => Promise<void> | void;
}

export const TextStyleSelector: React.FC<TextStyleSelectorProps> = ({ value, onChange, onToast, onGenerateStylePreviews, onPresetSelected }) => {
  const t = useT(i18n);
  const [hoveredPresetId, setHoveredPresetId] = useState<string | null>(null);
  const [isExtractingStyle, setIsExtractingStyle] = useState(false);
  const styleImageInputRef = useRef<HTMLInputElement>(null);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [templateJson, setTemplateJson] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templates, setTemplates] = useState<StyleTemplate[]>([]);
  const [presets, setPresets] = useState<StylePreset[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [isLoadingAdvanced, setIsLoadingAdvanced] = useState(false);
  const [isStartingRecommendations, setIsStartingRecommendations] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((x) => x.id === selectedTemplateId),
    [selectedTemplateId, templates]
  );
  const selectedPreset = useMemo(
    () => presets.find((x) => x.id === selectedPresetId),
    [selectedPresetId, presets]
  );

  const loadAdvanced = async () => {
    setIsLoadingAdvanced(true);
    try {
      const [tplRes, preRes] = await Promise.all([
        listStyleTemplates(),
        listStylePresets(),
      ]);
      setTemplates(tplRes.data?.templates || []);
      setPresets(preRes.data?.presets || []);
    } catch (e: any) {
      onToast?.({ message: e?.message || 'Failed to load style library', type: 'error' });
    } finally {
      setIsLoadingAdvanced(false);
    }
  };

  useEffect(() => {
    if (!advancedOpen) return;
    loadAdvanced();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advancedOpen]);

  useEffect(() => {
    if (selectedTemplate && selectedTemplate.template_json) {
      setTemplateJson(selectedTemplate.template_json);
    }
  }, [selectedTemplate]);

  useEffect(() => {
    if (!selectedPreset) return;
    if (!onPresetSelected) return;
    (async () => {
      try {
        await onPresetSelected(selectedPreset);
      } catch (e: any) {
        onToast?.({ message: e?.message || 'Apply preset failed', type: 'error' });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPresetId]);

  return (
    <div className="space-y-3">
      <Textarea
        placeholder={t('stylePlaceholder')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="text-sm border-2 border-gray-200 dark:border-border-primary dark:bg-background-tertiary dark:text-white dark:placeholder-foreground-tertiary focus:border-banana-400 dark:focus:border-banana transition-colors duration-200"
      />

      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-600 dark:text-foreground-tertiary">
          {t('presetStylesLabel')}
        </p>
        <div className="flex flex-wrap gap-2">
          {PRESET_STYLES.map((preset) => (
            <div key={preset.id} className="relative">
              <button
                type="button"
                onClick={() => onChange(t(preset.descriptionKey))}
                onMouseEnter={() => setHoveredPresetId(preset.id)}
                onMouseLeave={() => setHoveredPresetId(null)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border-2 border-gray-200 dark:border-border-primary dark:text-foreground-secondary hover:border-banana-400 dark:hover:border-banana hover:bg-banana-50 dark:hover:bg-background-hover transition-all duration-200 hover:shadow-sm dark:hover:shadow-none"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-black/10"
                  style={{ backgroundColor: preset.color }}
                />
                {t(preset.nameKey)}
              </button>

              {hoveredPresetId === preset.id && preset.previewImage && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="bg-white dark:bg-background-secondary rounded-lg shadow-2xl dark:shadow-none border-2 border-banana-400 dark:border-banana p-2.5 w-72">
                    <img
                      src={preset.previewImage}
                      alt={t(preset.nameKey)}
                      className="w-full h-40 object-cover rounded"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <p className="text-xs text-gray-600 dark:text-foreground-tertiary mt-2 px-1 line-clamp-3">
                      {t(preset.descriptionKey)}
                    </p>
                  </div>
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                    <div className="w-3 h-3 bg-white dark:bg-background-secondary border-r-2 border-b-2 border-banana-400 dark:border-banana transform rotate-45"></div>
                  </div>
                </div>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={() => styleImageInputRef.current?.click()}
            disabled={isExtractingStyle}
            className="px-3 py-1.5 text-xs font-medium rounded-full border-2 border-dashed border-gray-300 dark:border-border-primary dark:text-foreground-secondary hover:border-banana-400 dark:hover:border-banana hover:bg-banana-50 dark:hover:bg-background-hover transition-all duration-200 hover:shadow-sm dark:hover:shadow-none flex items-center gap-1"
          >
            {isExtractingStyle ? (
              <><Loader2 size={12} className="animate-spin" />{t('extracting')}</>
            ) : (
              <><ImagePlus size={12} />{t('extractFromImage')}</>
            )}
          </button>
          <input
            ref={styleImageInputRef}
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              e.target.value = '';
              setIsExtractingStyle(true);
              try {
                const result = await extractStyleFromImage(file);
                if (result.data?.style_description) {
                  onChange(result.data.style_description);
                  onToast?.({ message: t('extractSuccess'), type: 'success' });
                }
              } catch (error: any) {
                onToast?.({ message: `${t('extractFailed')}: ${error?.message || ''}`, type: 'error' });
              } finally {
                setIsExtractingStyle(false);
              }
            }}
            className="hidden"
          />
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-foreground-tertiary">
        💡 {t('styleTip')}
      </p>

      <div className="pt-2 border-t border-gray-100 dark:border-border-primary">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="text-xs font-medium text-gray-600 dark:text-foreground-tertiary hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          {t('advanced')}{isLoadingAdvanced ? '…' : ''}
        </button>

        {advancedOpen ? (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="space-y-1">
                <div className="text-xs text-gray-600 dark:text-foreground-tertiary">{t('templates')}</div>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-tertiary dark:text-white"
                >
                  <option value="">{isLoadingAdvanced ? 'Loading…' : '—'}</option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name || tpl.id}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-gray-600 dark:text-foreground-tertiary">{t('presets')}</div>
                <select
                  value={selectedPresetId}
                  onChange={(e) => setSelectedPresetId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-tertiary dark:text-white"
                >
                  <option value="">{isLoadingAdvanced ? 'Loading…' : '—'}</option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || p.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-gray-600 dark:text-foreground-tertiary">{t('templateJson')}</div>
              <div className="text-[11px] text-gray-500 dark:text-foreground-tertiary">{t('templateJsonHint')}</div>
              <Textarea
                value={templateJson}
                onChange={(e) => setTemplateJson(e.target.value)}
                rows={6}
                className="text-xs font-mono border-2 border-gray-200 dark:border-border-primary dark:bg-background-tertiary dark:text-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder={t('templateName')}
                className="flex-1 min-w-[200px] px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-tertiary dark:text-white"
              />
              <button
                type="button"
                onClick={async () => {
                  const text = templateJson.trim();
                  if (!text) {
                    onToast?.({ message: t('templateJsonRequired'), type: 'error' });
                    return;
                  }
                  try {
                    JSON.parse(text);
                  } catch (e: any) {
                    onToast?.({ message: `${t('invalidJson')}: ${e?.message || ''}`, type: 'error' });
                    return;
                  }
                  try {
                    await createStyleTemplate({ name: templateName.trim(), template_json: text });
                    onToast?.({ message: t('saveTemplate'), type: 'success' });
                    setTemplateName('');
                    await loadAdvanced();
                  } catch (e: any) {
                    onToast?.({ message: e?.message || 'Save failed', type: 'error' });
                  }
                }}
                className="px-3 py-2 text-xs font-medium rounded-lg border-2 border-gray-200 dark:border-border-primary hover:border-banana-400 dark:hover:border-banana hover:bg-banana-50 dark:hover:bg-background-hover transition-all duration-200"
              >
                {t('saveTemplate')}
              </button>
              <button
                type="button"
                disabled={isStartingRecommendations}
                onClick={async () => {
                  if (!onGenerateStylePreviews) {
                    onToast?.({ message: t('needCallback'), type: 'error' });
                    return;
                  }
                  const text = templateJson.trim();
                  if (!text) {
                    onToast?.({ message: t('templateJsonRequired'), type: 'error' });
                    return;
                  }
                  try {
                    JSON.parse(text);
                  } catch (e: any) {
                    onToast?.({ message: `${t('invalidJson')}: ${e?.message || ''}`, type: 'error' });
                    return;
                  }
                  // Default workflow: recommend JSON first, user can generate previews per group later.
                  setIsStartingRecommendations(true);
                  try {
                    await onGenerateStylePreviews({ templateJson: text, styleRequirements: value, generatePreviews: false });
                  } finally {
                    setIsStartingRecommendations(false);
                  }
                }}
                className="px-3 py-2 text-xs font-medium rounded-lg bg-banana text-black hover:bg-banana-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {isStartingRecommendations ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    启动中…
                  </>
                ) : (
                  t('generatePreviews')
                )}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
