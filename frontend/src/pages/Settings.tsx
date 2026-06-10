import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Key, Image, Zap, Save, RotateCcw, Globe, FileText, Brain, HelpCircle, Link2, RefreshCw, CheckCircle, ArrowUp, Info } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { appVersion } from '@/utils/appVersion';

import { settingsI18n } from './Settings.i18n';
import { getActiveSettingsSectionId, type SettingsSectionBounds } from './Settings.scrollSpy';
import { Button, Input, Card, Loading, useToast, useConfirm } from '@/components/shared';
import * as api from '@/api/endpoints';
import type { ProviderProfileSummary } from '@/api/endpoints';
import { OUTPUT_LANGUAGE_OPTIONS } from '@/api/endpoints';
import type { Settings as SettingsType } from '@/types';
import {
  getImageChannelOptionById,
  getSelectableImageModelsForChannel,
  getSourceForImageChannel,
  getSupportedResolutionsForChannelModel,
} from '@/config/projectAiChannels';
import { getSupportedResolutionsForModel } from '@/config/projectAiDefaults';
import { SettingsOpenAIOAuthSection } from './components/SettingsOpenAIOAuthSection';
import { SettingsModelConfigSection } from './components/SettingsModelConfigSection';
import { useSettingsOpenAIOAuth } from './hooks/useSettingsOpenAIOAuth';

import {
  API_KEY_PROVIDERS,
  GLOBAL_PROVIDER_SOURCES,
  LAZYLLM_SOURCES,
  SETTINGS_SECTION_IDS,
  GlobalVendorKeyInput,
  formDataFromSettings,
  getDefaultGptImageSizeFromResolution,
  initialFormData,
  isLazyllmVendor,
  type FieldConfig,
  type SectionConfig,
  type ServiceTestState,
  type SettingsNavItem,
  type TestStatus,
} from './Settings.config';

type SettingsTranslator = (key: string, vars?: Record<string, string>) => string;

function getLatestVersionLabel(info: any): string {
  const sha = info?.latest?.sha;
  if (sha) {
    return sha.length > 7 ? sha.slice(0, 7) : sha;
  }
  return info?.latest?.tag || '';
}

function formatUpdateMessage(t: SettingsTranslator, info: any): string {
  if (info?.status === 'up_to_date') return t('settings.about.upToDate');
  if (info?.status === 'update_available') {
    return t('settings.about.updateAvailable', { version: getLatestVersionLabel(info) });
  }
  return t('settings.about.unknown');
}

export const SettingsAbout: React.FC<{ t: SettingsTranslator }> = ({ t }) => {
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<any | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const response = await api.checkForUpdates();
      setUpdateInfo(response.data || null);
    } catch {
      setUpdateInfo({ status: 'unknown' });
    } finally {
      setCheckingUpdate(false);
      setUpdateDialogOpen(true);
    }
  };

  return (
    <>
      <div className="pt-4 border-t border-gray-200 dark:border-border-primary">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-foreground-primary mb-3 flex items-center">
          <Info size={20} />
          <span className="ml-2">{t('settings.sections.about')}</span>
        </h2>
        <div className="flex flex-col gap-3 text-sm text-gray-600 dark:text-foreground-tertiary sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div title={appVersion.detail} aria-label={`${t('settings.about.version')} ${appVersion.detail}`}>
              {t('settings.about.version')}: {appVersion.display}
            </div>
            <a
              href="https://github.com/Anionex/banana-slides"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-banana-700 dark:text-banana hover:underline"
            >
              {t('settings.about.source')}
            </a>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={16} className={checkingUpdate ? 'animate-spin' : ''} />}
            onClick={handleCheckUpdate}
            loading={checkingUpdate}
          >
            {checkingUpdate ? t('settings.about.checking') : t('settings.about.checkUpdate')}
          </Button>
        </div>
      </div>

      {updateDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-background-secondary">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground-primary">
                {t('settings.about.resultTitle')}
              </h3>
              <div className="flex flex-col items-center gap-3 py-2 text-center">
                {updateInfo?.status === 'up_to_date' && (
                  <CheckCircle size={44} data-testid="update-success-icon" className="text-green-600 dark:text-green-400" />
                )}
                {updateInfo?.status === 'update_available' && (
                  <ArrowUp size={44} data-testid="update-available-icon" className="text-orange-600 dark:text-orange-400" />
                )}
                <p className={updateInfo?.status === 'update_available'
                  ? 'text-xl font-semibold text-orange-600 dark:text-orange-400'
                  : 'text-xl font-semibold text-gray-900 dark:text-foreground-primary'}
                >
                  {formatUpdateMessage(t, updateInfo)}
                </p>
              </div>
              <div className="flex justify-end">
                <Button variant="secondary" size="sm" onClick={() => setUpdateDialogOpen(false)}>
                  {t('settings.about.close')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
// Settings 组件 - 纯嵌入模式（可复用）
interface SettingsProps {
  refreshToken?: number;
  onLoadingChange?: (loading: boolean) => void;
}

export const Settings: React.FC<SettingsProps> = ({ refreshToken = 0, onLoadingChange }) => {
  const t = useT(settingsI18n);
  const { show, ToastContainer } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [providerProfiles, setProviderProfiles] = useState<ProviderProfileSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState(initialFormData);
  const [serviceTestStates, setServiceTestStates] = useState<Record<string, ServiceTestState>>({});
  const [activeSectionId, setActiveSectionId] = useState('api-config');
  const {
    oauthConnecting,
    manualCallbackUrl,
    manualCallbackOpen,
    manualCallbackSubmitting,
    setManualCallbackUrl,
    setManualCallbackOpen,
    handleOAuthLogin,
    handleOAuthDisconnect,
    handleManualCallback,
  } = useSettingsOpenAIOAuth({ t, show, setSettings });

  // 配置驱动的表单区块定义（使用翻译）
  const settingsSections: SectionConfig[] = [
    // Global API config & Model config are rendered separately above
    {
      id: 'mineru-config',
      title: t('settings.sections.mineruConfig'),
      icon: <FileText size={20} />,
      fields: [
        {
          key: 'mineru_api_base',
          label: t('settings.fields.mineruApiBase'),
          type: 'text',
          placeholder: t('settings.fields.mineruApiBasePlaceholder'),
          description: t('settings.fields.mineruApiBaseDesc'),
        },
        {
          key: 'mineru_token',
          label: t('settings.fields.mineruToken'),
          type: 'password',
          placeholder: t('settings.fields.mineruTokenPlaceholder'),
          sensitiveField: true,
          lengthKey: 'mineru_token_length',
          description: t('settings.fields.mineruTokenDesc'),
          link: 'https://mineru.net/apiManage/token',
        },
      ],
    },
    {
      id: 'image-config',
      title: t('settings.sections.imageConfig'),
      icon: <Image size={20} />,
      fields: [],
    },
    {
      id: 'performance-config',
      title: t('settings.sections.performanceConfig'),
      icon: <Zap size={20} />,
      fields: [
        {
          key: 'max_description_workers',
          label: t('settings.fields.maxDescriptionWorkers'),
          type: 'number',
          min: 1,
          max: 20,
          description: t('settings.fields.maxDescriptionWorkersDesc'),
        },
        {
          key: 'max_image_workers',
          label: t('settings.fields.maxImageWorkers'),
          type: 'number',
          min: 1,
          max: 20,
          description: t('settings.fields.maxImageWorkersDesc'),
        },
      ],
    },
    {
      id: 'output-language',
      title: t('settings.sections.outputLanguage'),
      icon: <Globe size={20} />,
      fields: [
        {
          key: 'output_language',
          label: t('settings.fields.defaultOutputLanguage'),
          type: 'buttons',
          description: t('settings.fields.defaultOutputLanguageDesc'),
          options: OUTPUT_LANGUAGE_OPTIONS,
        },
      ],
    },
    {
      id: 'text-reasoning',
      title: t('settings.sections.textReasoning'),
      icon: <Brain size={20} />,
      fields: [
        {
          key: 'enable_text_reasoning',
          label: t('settings.fields.enableTextReasoning'),
          type: 'switch',
          description: t('settings.fields.enableTextReasoningDesc'),
        },
        {
          key: 'text_thinking_budget',
          label: t('settings.fields.textThinkingBudget'),
          type: 'number',
          min: 1,
          max: 8192,
          description: t('settings.fields.textThinkingBudgetDesc'),
        },
      ],
    },
    {
      id: 'image-reasoning',
      title: t('settings.sections.imageReasoning'),
      icon: <Brain size={20} />,
      fields: [
        {
          key: 'enable_image_reasoning',
          label: t('settings.fields.enableImageReasoning'),
          type: 'switch',
          description: t('settings.fields.enableImageReasoningDesc'),
        },
        {
          key: 'image_thinking_budget',
          label: t('settings.fields.imageThinkingBudget'),
          type: 'number',
          min: 1,
          max: 8192,
          description: t('settings.fields.imageThinkingBudgetDesc'),
        },
      ],
    },
    {
      id: 'baidu-ocr',
      title: t('settings.sections.baiduOcr'),
      icon: <FileText size={20} />,
      fields: [
        {
          key: 'baidu_api_key',
          label: t('settings.fields.baiduOcrApiKey'),
          type: 'password',
          placeholder: t('settings.fields.baiduOcrApiKeyPlaceholder'),
          sensitiveField: true,
          lengthKey: 'baidu_api_key_length',
          description: t('settings.fields.baiduOcrApiKeyDesc'),
          link: 'https://console.bce.baidu.com/iam/#/iam/apikey/list',
        },
      ],
    },
  ];

  const settingsNavItems = useMemo<SettingsNavItem[]>(() => ([
    { id: 'api-config', title: t('settings.sections.apiConfig'), icon: <Key size={18} /> },
    { id: 'openai-oauth', title: t('settings.openaiOAuth.title'), icon: <Link2 size={18} /> },
    { id: 'model-config', title: t('settings.sections.modelConfig'), icon: <FileText size={18} /> },
    ...settingsSections.map((section) => ({
      id: section.id,
      title: section.title,
      icon: section.icon,
    })),
    { id: 'service-test', title: t('settings.serviceTest.title'), icon: <HelpCircle size={18} /> },
  ]), [settingsSections, t]);

  const handleJumpToSection = useCallback((sectionId: string) => {
    setActiveSectionId(sectionId);
    if (typeof document === 'undefined') return;
    const target = document.getElementById(sectionId);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const renderModuleSection = ({
    id,
    title,
    icon,
    description,
    children,
    testId,
  }: {
    id: string;
    title: string;
    icon: React.ReactNode;
    description?: string;
    children: React.ReactNode;
    testId?: string;
  }) => (
    <section key={id} id={id} data-testid={testId} className="scroll-mt-6 md:scroll-mt-8">
      <Card className="p-5 md:p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-foreground-primary mb-1 flex items-center">
            {icon}
            <span className="ml-2">{title}</span>
          </h2>
          {description && (
            <p className="text-sm text-gray-500 dark:text-foreground-tertiary">{description}</p>
          )}
        </div>
        {children}
      </Card>
    </section>
  );

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const [settingsResp, profilesResp] = await Promise.all([
        api.getSettings(),
        api.getProviderProfiles().catch(() => ({ data: { profiles: [] } } as any)),
      ]);
      if (settingsResp.data) {
        setSettings(settingsResp.data);
        setFormData(formDataFromSettings(settingsResp.data));
        sessionStorage.setItem('banana-settings', JSON.stringify(settingsResp.data));
      }
      setProviderProfiles(profilesResp?.data?.profiles || []);
    } catch (error: any) {
      console.error('加载设置失败:', error);
      show({
        message: t('settings.messages.loadFailed') + ': ' + (error?.message || t('settings.messages.unknownError')),
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  }, [show, t]);

  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings, refreshToken]);

  useEffect(() => {
    if (isLoading || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    let frameId: number | null = null;

    // Schedules active nav updates without running layout reads for every scroll event.
    const updateActiveSection = () => {
      frameId = null;
      const sections = SETTINGS_SECTION_IDS
        .map((sectionId): SettingsSectionBounds | null => {
          const element = document.getElementById(sectionId);
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          return { id: sectionId, top: rect.top, bottom: rect.bottom };
        })
        .filter((section): section is SettingsSectionBounds => Boolean(section));
      const nextActiveId = getActiveSettingsSectionId(sections, window.innerHeight);
      if (nextActiveId) {
        setActiveSectionId(nextActiveId);
      }
    };

    // Coalesces scroll and resize events into one animation frame.
    const requestActiveSectionUpdate = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(updateActiveSection);
    };

    requestActiveSectionUpdate();
    window.addEventListener('scroll', requestActiveSectionUpdate, { passive: true });
    window.addEventListener('resize', requestActiveSectionUpdate);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener('scroll', requestActiveSectionUpdate);
      window.removeEventListener('resize', requestActiveSectionUpdate);
    };
  }, [isLoading]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const {
        api_key, mineru_token, baidu_api_key, lazyllm_api_keys,
        text_api_key, image_api_key, image_caption_api_key,
        ...otherData
      } = formData;
      const payload: Parameters<typeof api.updateSettings>[0] = {
        ...otherData,
        ai_provider_format: otherData.ai_provider_format,
      };

      // Only send sensitive fields if user entered a new value
      if (api_key) payload.api_key = api_key;
      if (mineru_token) payload.mineru_token = mineru_token;
      if (baidu_api_key) payload.baidu_api_key = baidu_api_key;
      if (text_api_key) payload.text_api_key = text_api_key;
      if (image_api_key) payload.image_api_key = image_api_key;
      if (image_caption_api_key) payload.image_caption_api_key = image_caption_api_key;

      // Send lazyllm API keys (only non-empty values)
      const nonEmptyKeys = Object.fromEntries(
        Object.entries(lazyllm_api_keys).filter(([, v]) => v)
      );
      if (Object.keys(nonEmptyKeys).length > 0) {
        payload.lazyllm_api_keys = nonEmptyKeys;
      }

      const response = await api.updateSettings(payload);
      if (response.data) {
        setSettings(response.data);
        sessionStorage.setItem('banana-settings', JSON.stringify(response.data));
        show({ message: t('settings.messages.saveSuccess'), type: 'success' });
        show({ message: t('settings.messages.testServiceTip'), type: 'info' });
        // Clear all sensitive fields after save
        setFormData(prev => ({
          ...prev,
          api_key: '', mineru_token: '', baidu_api_key: '',
          lazyllm_api_keys: {},
          text_api_key: '', image_api_key: '', image_caption_api_key: '',
        }));
      }
    } catch (error: any) {
      console.error('保存设置失败:', error);
      show({
        message: t('settings.messages.saveFailed') + ': ' + (error?.response?.data?.error?.message || error?.message || t('settings.messages.unknownError')),
        type: 'error'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    confirm(
      t('settings.messages.resetConfirm'),
      async () => {
        setIsSaving(true);
        try {
          const response = await api.resetSettings();
          if (response.data) {
            setSettings(response.data);
            setFormData(formDataFromSettings(response.data));
            show({ message: t('settings.messages.resetSuccess'), type: 'success' });
          }
        } catch (error: any) {
          console.error('重置设置失败:', error);
          show({
            message: t('settings.messages.resetFailed') + ': ' + (error?.message || t('settings.messages.unknownError')),
            type: 'error'
          });
        } finally {
          setIsSaving(false);
        }
      },
      {
        title: t('settings.messages.resetTitle'),
        confirmText: t('settings.messages.resetConfirmBtn'),
        cancelText: t('settings.messages.resetCancelBtn'),
        variant: 'warning',
      }
    );
  };

  const handleFieldChange = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  // Keep image model and resolution aligned with the selected channel.
  const handleImageChannelChange = (channelId: string) => {
    const channel = getImageChannelOptionById(channelId, providerProfiles);
    const fallbackModel = getSelectableImageModelsForChannel(channelId, providerProfiles)[0]?.model || '';
    setFormData(prev => {
      const selectableModels = getSelectableImageModelsForChannel(channelId, providerProfiles);
      const keepsCurrentModel = selectableModels.some((item) => item.model === prev.image_model);
      const nextModel = keepsCurrentModel ? prev.image_model : fallbackModel;
      const resolutionOptions = getSupportedResolutionsForChannelModel(
        channelId,
        nextModel,
        providerProfiles,
        getSupportedResolutionsForModel(nextModel),
      );
      const nextResolution = resolutionOptions.includes(prev.image_resolution)
        ? prev.image_resolution
        : (resolutionOptions[0] || prev.image_resolution);
      return {
        ...prev,
        image_model_source: channel?.source || (channel?.provider || 'gemini'),
        image_model: nextModel,
        image_resolution: nextResolution,
        gpt_image_size: nextModel.startsWith('gpt-image-2')
          ? (prev.gpt_image_size || getDefaultGptImageSizeFromResolution(nextResolution))
          : prev.gpt_image_size,
      };
    });
  };

  // Keep image resolution within the selected model/channel capability set.
  const handleImageModelChange = (model: string, channelId: string) => {
    const source = getSourceForImageChannel(channelId, providerProfiles) || getImageSourceForModel(model, 'gemini');
    const resolutionOptions = getSupportedResolutionsForChannelModel(
      channelId,
      model,
      providerProfiles,
      getSupportedResolutionsForModel(model),
    );
    setFormData(prev => ({
      ...prev,
      image_model: model,
      image_model_source: source,
      image_resolution: resolutionOptions.includes(prev.image_resolution)
        ? prev.image_resolution
        : (resolutionOptions[0] || prev.image_resolution),
      gpt_image_size: model.startsWith('gpt-image-2')
        ? (prev.gpt_image_size || getDefaultGptImageSizeFromResolution(resolutionOptions[0]))
        : prev.gpt_image_size,
    }));
  };

  const updateServiceTest = (key: string, nextState: ServiceTestState) => {
    setServiceTestStates(prev => ({ ...prev, [key]: nextState }));
  };

  const handleServiceTest = async (
    key: string,
    action: (settings?: any) => Promise<any>,
    formatDetail: (data: any) => string
  ) => {
    updateServiceTest(key, { status: 'loading' });
    try {
      // 准备测试时要使用的设置（包括未保存的修改）
      const testSettings: any = {};

      // 只传递用户已填写的非空值
      if (formData.api_key) testSettings.api_key = formData.api_key;
      if (formData.api_base_url) testSettings.api_base_url = formData.api_base_url;
      if (formData.azure_openai_endpoint) testSettings.azure_openai_endpoint = formData.azure_openai_endpoint;
      if (formData.azure_openai_api_version) testSettings.azure_openai_api_version = formData.azure_openai_api_version;
      if (formData.ai_provider_format) {
        testSettings.ai_provider_format = formData.ai_provider_format;
      }
      if (formData.text_model) testSettings.text_model = formData.text_model;
      if (formData.image_model) testSettings.image_model = formData.image_model;
      if (formData.image_caption_model) testSettings.image_caption_model = formData.image_caption_model;
      if (formData.mineru_api_base) testSettings.mineru_api_base = formData.mineru_api_base;
      if (formData.mineru_token) testSettings.mineru_token = formData.mineru_token;
      if (formData.baidu_api_key) testSettings.baidu_api_key = formData.baidu_api_key;
      if (formData.image_resolution) testSettings.image_resolution = formData.image_resolution;
      if (formData.gpt_image_size) testSettings.gpt_image_size = formData.gpt_image_size;
      if (formData.gpt_image_background) testSettings.gpt_image_background = formData.gpt_image_background;
      if (formData.gpt_image_output_format) testSettings.gpt_image_output_format = formData.gpt_image_output_format;
      if (formData.gpt_image_output_compression !== undefined) {
        testSettings.gpt_image_output_compression = formData.gpt_image_output_compression;
      }
      if (formData.gpt_image_quality) testSettings.gpt_image_quality = formData.gpt_image_quality;

      // Per-model provider source overrides (always send, even empty, to clear saved values)
      testSettings.text_model_source = formData.text_model_source || '';
      testSettings.image_model_source = formData.image_model_source || '';
      testSettings.image_caption_model_source = formData.image_caption_model_source || '';

      // Per-model API credentials
      if (formData.text_api_key) testSettings.text_api_key = formData.text_api_key;
      if (formData.text_api_base_url) testSettings.text_api_base_url = formData.text_api_base_url;
      if (formData.text_azure_openai_endpoint) testSettings.text_azure_openai_endpoint = formData.text_azure_openai_endpoint;
      if (formData.text_azure_openai_api_version) testSettings.text_azure_openai_api_version = formData.text_azure_openai_api_version;
      if (formData.image_api_key) testSettings.image_api_key = formData.image_api_key;
      if (formData.image_api_base_url) testSettings.image_api_base_url = formData.image_api_base_url;
      if (formData.image_azure_openai_endpoint) testSettings.image_azure_openai_endpoint = formData.image_azure_openai_endpoint;
      if (formData.image_azure_openai_api_version) testSettings.image_azure_openai_api_version = formData.image_azure_openai_api_version;
      if (formData.image_caption_api_key) testSettings.image_caption_api_key = formData.image_caption_api_key;
      if (formData.image_caption_api_base_url) testSettings.image_caption_api_base_url = formData.image_caption_api_base_url;
      if (formData.image_caption_azure_openai_endpoint) testSettings.image_caption_azure_openai_endpoint = formData.image_caption_azure_openai_endpoint;
      if (formData.image_caption_azure_openai_api_version) testSettings.image_caption_azure_openai_api_version = formData.image_caption_azure_openai_api_version;

      // 推理模式设置
      if (formData.enable_text_reasoning !== undefined) {
        testSettings.enable_text_reasoning = formData.enable_text_reasoning;
      }
      if (formData.text_thinking_budget !== undefined) {
        testSettings.text_thinking_budget = formData.text_thinking_budget;
      }
      if (formData.enable_image_reasoning !== undefined) {
        testSettings.enable_image_reasoning = formData.enable_image_reasoning;
      }
      if (formData.image_thinking_budget !== undefined) {
        testSettings.image_thinking_budget = formData.image_thinking_budget;
      }

      // 启动异步测试，获取任务ID
      const response = await action(testSettings);
      const taskId = response.data.task_id;

      // isActive tracks whether this test round is still pending — avoids stale closure
      let isActive = true;
      // eslint-disable-next-line prefer-const
      let pollInterval: ReturnType<typeof setInterval>;
      const finish = (nextState: ServiceTestState, toastMsg: string, toastType: 'success' | 'error') => {
        if (!isActive) return;
        isActive = false;
        clearInterval(pollInterval);
        updateServiceTest(key, nextState);
        show({ message: toastMsg, type: toastType });
      };

      // 开始轮询任务状态
      pollInterval = setInterval(async () => {
        try {
          const statusResponse = await api.getTestStatus(taskId);
          const statusData = statusResponse.data;
          if (!statusData) {
            return;
          }
          const taskStatus = statusData.status;

          if (taskStatus === 'COMPLETED') {
            clearInterval(pollInterval);
            const detail = formatDetail(statusData.result || {});
            const message = statusData.message || t('settings.messages.testSuccess');
            updateServiceTest(key, { status: 'success', message, detail });
            show({ message, type: 'success' });
          } else if (taskStatus === 'FAILED') {
            clearInterval(pollInterval);
            const errorMessage = statusData.error || t('settings.serviceTest.testFailed');
            updateServiceTest(key, { status: 'error', message: errorMessage });
            show({ message: `${t('settings.serviceTest.testFailed')}: ${errorMessage}`, type: 'error' });
          }
          // 如果是 PENDING 或 PROCESSING，继续轮询
        } catch (pollError: any) {
          const errorMessage = pollError?.response?.data?.error?.message || pollError?.message || t('settings.serviceTest.testFailed');
          finish({ status: 'error', message: errorMessage }, `${t('settings.serviceTest.testFailed')}: ${errorMessage}`, 'error');
        }
      }, 2000); // 每2秒轮询一次

      // 设置最大轮询时间（2分钟）
      setTimeout(() => {
        finish({ status: 'error', message: t('settings.serviceTest.testTimeout') }, t('settings.serviceTest.testTimeout'), 'error');
      }, 600000); // 10 分钟，覆盖 gpt-image-2 等慢模型的生成时间

    } catch (error: any) {
      const errorMessage = error?.response?.data?.error?.message || error?.message || t('common.unknownError');
      updateServiceTest(key, { status: 'error', message: errorMessage });
      show({ message: `${t('settings.serviceTest.testFailed')}: ${errorMessage}`, type: 'error' });
    }
  };

  const renderField = (field: FieldConfig) => {
    const value = formData[field.key] as string | number | boolean;

    if (field.type === 'buttons' && field.options) {
      return (
        <div key={field.key}>
          <label className="block text-sm font-medium text-gray-700 dark:text-foreground-secondary mb-2">
            {field.label}
          </label>
          <div className="flex flex-wrap gap-2">
            {field.options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleFieldChange(field.key, option.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  value === option.value
                    ? option.value === 'openai'
                      ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md'
                      : option.value === 'lazyllm'
                        ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md'
                        : 'bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-md'
                    : 'bg-white dark:bg-background-secondary border border-gray-200 dark:border-border-primary text-gray-700 dark:text-foreground-secondary hover:bg-gray-50 dark:hover:bg-background-hover hover:border-gray-300 dark:hover:border-gray-500'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {field.description && (
            <p className="mt-1 text-xs text-gray-500 dark:text-foreground-tertiary">{field.description}</p>
          )}
        </div>
      );
    }

    if (field.type === 'select' && field.options) {
      return (
        <div key={field.key}>
          <label className="block text-sm font-medium text-gray-700 dark:text-foreground-secondary mb-2">
            {field.label}
          </label>
          <select
            value={value as string}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            className="w-full h-10 px-4 rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary focus:outline-none focus:ring-2 focus:ring-banana-500 focus:border-transparent"
          >
            {!(value as string) && (
              <option value="" disabled>
                {field.placeholder || t('settings.fields.selectPlaceholder')}
              </option>
            )}
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {field.description && (
            <p className="mt-1 text-sm text-gray-500 dark:text-foreground-tertiary">{field.description}</p>
          )}
        </div>
      );
    }

    // switch 类型 - 开关切换
    if (field.type === 'switch') {
      const isEnabled = Boolean(value);
      return (
        <div key={field.key}>
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700 dark:text-foreground-secondary">
              {field.label}
            </label>
            <button
              type="button"
              onClick={() => handleFieldChange(field.key, !isEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-banana-500 focus:ring-offset-2 ${
                isEnabled ? 'bg-banana-500' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-background-secondary transition-transform ${
                  isEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {field.description && (
            <p className="mt-1 text-sm text-gray-500 dark:text-foreground-tertiary">{field.description}</p>
          )}
        </div>
      );
    }

    // text, password, number 类型
    const placeholder = field.sensitiveField && settings && field.lengthKey && (settings[field.lengthKey] as number) > 0
      ? t('settings.fields.apiKeySet', { length: settings[field.lengthKey] as string | number })
      : field.placeholder || '';

    // 判断是否禁用（思考负载字段在对应开关关闭时禁用）
    let isDisabled = false;
    if (field.key === 'text_thinking_budget') {
      isDisabled = !formData.enable_text_reasoning;
    } else if (field.key === 'image_thinking_budget') {
      isDisabled = !formData.enable_image_reasoning;
    }

    return (
      <div key={field.key} className={isDisabled ? 'opacity-50' : ''}>
        <Input
          label={field.label}
          type={field.type === 'number' ? 'number' : field.type}
          placeholder={placeholder}
          value={value as string | number}
          onChange={(e) => {
            const newValue = field.type === 'number' 
              ? parseInt(e.target.value) || (field.min ?? 0)
              : e.target.value;
            handleFieldChange(field.key, newValue);
          }}
          min={field.min}
          max={field.max}
          disabled={isDisabled}
        />
        {(field.description || field.link) && (
          <p className="mt-1 text-sm text-gray-500 dark:text-foreground-tertiary">
            {field.description}
            {field.link && (
              <a href={field.link} target="_blank" rel="noopener noreferrer" className="text-banana-500 hover:underline">{t('settings.fields.applyLink')}</a>
            )}
          </p>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loading message={t('common.loading')} />
      </div>
    );
  }

  return (
    <>
      <ToastContainer />
      {ConfirmDialog}
      <div className="space-y-6 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-6 lg:space-y-0">
        <aside className="lg:sticky lg:top-24 self-start">
          <Card className="p-2 md:p-3">
            <div className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
              {settingsNavItems.map((item) => {
                const active = activeSectionId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleJumpToSection(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-banana-400 ${
                      active
                        ? 'bg-banana-500 text-white shadow-sm'
                        : 'text-gray-700 dark:text-foreground-secondary hover:bg-gray-100 dark:hover:bg-background-hover'
                    }`}
                  >
                    <span className="flex-shrink-0">{item.icon}</span>
                    <span>{item.title}</span>
                  </button>
                );
              })}
            </div>
          </Card>
        </aside>

        <div className="min-w-0 space-y-6">
          {renderModuleSection({
            id: 'api-config',
            testId: 'global-api-config-section',
            title: t('settings.sections.apiConfig'),
            icon: <Key size={20} />,
            description: t('settings.sections.apiConfigDesc'),
            children: (
              <>
                <div className="p-4 bg-gray-50 dark:bg-background-primary border border-gray-200 dark:border-border-primary rounded-lg space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-foreground-secondary mb-2">
                      {t('settings.fields.aiProviderFormat')}
                    </label>
                    <select
                      value={formData.ai_provider_format}
                      onChange={(e) => handleFieldChange('ai_provider_format', e.target.value)}
                      className="w-full h-10 px-4 rounded-lg border border-gray-200 dark:border-border-primary bg-white dark:bg-background-secondary focus:outline-none focus:ring-2 focus:ring-banana-500 focus:border-transparent"
                    >
                      {GLOBAL_PROVIDER_SOURCES.map((option) => (
                        <option
                          key={option.value}
                          value={option.value}
                          disabled={option.value === 'codex' && !settings?.openai_oauth_connected}
                        >
                          {option.label}{option.value === 'codex' && !settings?.openai_oauth_connected ? ` (${t('settings.openaiOAuth.disconnected')})` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-sm text-gray-500 dark:text-foreground-tertiary">{t('settings.fields.aiProviderFormatDesc')}</p>
                  </div>

                  {API_KEY_PROVIDERS.has(formData.ai_provider_format) && formData.ai_provider_format !== 'azure-openai' && (
                    <div className="space-y-3 pl-3 border-l-2 border-banana-300 dark:border-banana-600">
                      <Input
                        label={t('settings.fields.apiBaseUrl')}
                        type="text"
                        placeholder={t('settings.fields.apiBaseUrlPlaceholder')}
                        value={formData.api_base_url}
                        onChange={(e) => handleFieldChange('api_base_url', e.target.value)}
                      />
                      <p className="-mt-2 text-sm text-gray-500 dark:text-foreground-tertiary">{t('settings.fields.apiBaseUrlDesc')}</p>
                      <div>
                        <Input
                          label={t('settings.fields.apiKey')}
                          type="password"
                          placeholder={
                            settings && (settings.api_key_length as number) > 0
                              ? t('settings.fields.apiKeySet', { length: settings.api_key_length })
                              : t('settings.fields.apiKeyPlaceholder')
                          }
                          value={formData.api_key}
                          onChange={(e) => handleFieldChange('api_key', e.target.value)}
                        />
                        <p className="mt-1 text-sm text-gray-500 dark:text-foreground-tertiary">{t('settings.fields.apiKeyDesc')}</p>
                      </div>
                    </div>
                  )}

                  {formData.ai_provider_format === 'azure-openai' && (
                    <div className="space-y-3 pl-3 border-l-2 border-banana-300 dark:border-banana-600">
                      <Input
                        label={t('settings.fields.azureOpenaiEndpoint')}
                        type="text"
                        placeholder={t('settings.fields.azureOpenaiEndpointPlaceholder')}
                        value={formData.azure_openai_endpoint}
                        onChange={(e) => handleFieldChange('azure_openai_endpoint', e.target.value)}
                      />
                      <p className="-mt-2 text-sm text-gray-500 dark:text-foreground-tertiary">{t('settings.fields.azureOpenaiEndpointDesc')}</p>
                      <Input
                        label={t('settings.fields.azureOpenaiApiVersion')}
                        type="text"
                        placeholder={t('settings.fields.azureOpenaiApiVersionPlaceholder')}
                        value={formData.azure_openai_api_version}
                        onChange={(e) => handleFieldChange('azure_openai_api_version', e.target.value)}
                      />
                      <p className="-mt-2 text-sm text-gray-500 dark:text-foreground-tertiary">{t('settings.fields.azureOpenaiApiVersionDesc')}</p>
                      <div>
                        <Input
                          label={t('settings.fields.apiKey')}
                          type="password"
                          placeholder={
                            settings && (settings.api_key_length as number) > 0
                              ? t('settings.fields.apiKeySet', { length: settings.api_key_length })
                              : t('settings.fields.apiKeyPlaceholder')
                          }
                          value={formData.api_key}
                          onChange={(e) => handleFieldChange('api_key', e.target.value)}
                        />
                        <p className="mt-1 text-sm text-gray-500 dark:text-foreground-tertiary">{t('settings.fields.apiKeyDesc')}</p>
                      </div>
                    </div>
                  )}

                  {isLazyllmVendor(formData.ai_provider_format) && (
                    <GlobalVendorKeyInput vendor={formData.ai_provider_format} formData={formData} setFormData={setFormData} settings={settings} t={t} />
                  )}
                </div>

              </>
            ),
          })}

          {renderModuleSection({
            id: 'openai-oauth',
            title: t('settings.openaiOAuth.title'),
            icon: <Link2 size={20} />,
            description: t('settings.openaiOAuth.description'),
            children: (
              <SettingsOpenAIOAuthSection
                settings={settings}
                t={t}
                oauthConnecting={oauthConnecting}
                manualCallbackUrl={manualCallbackUrl}
                manualCallbackOpen={manualCallbackOpen}
                manualCallbackSubmitting={manualCallbackSubmitting}
                onLogin={handleOAuthLogin}
                onDisconnect={handleOAuthDisconnect}
                onManualCallback={handleManualCallback}
                onManualCallbackUrlChange={setManualCallbackUrl}
                onManualCallbackOpenChange={setManualCallbackOpen}
              />
            ),
          })}

          {renderModuleSection({
            id: 'model-config',
            title: t('settings.sections.modelConfig'),
            icon: <FileText size={20} />,
            children: (
              <SettingsModelConfigSection
                formData={formData}
                providerProfiles={providerProfiles}
                settings={settings}
                t={t}
                handleFieldChange={handleFieldChange}
                handleImageChannelChange={handleImageChannelChange}
                handleImageModelChange={handleImageModelChange}
                setFormData={setFormData}
              />
            ),
          })}

          {settingsSections.map((section) => renderModuleSection({
            id: section.id,
            title: section.title,
            icon: section.icon,
            children: (
              <div className="space-y-4">
                {section.fields.map((field) => renderField(field))}
              </div>
            ),
          }))}

          {renderModuleSection({
            id: 'service-test',
            title: t('settings.serviceTest.title'),
            icon: <FileText size={20} />,
            description: t('settings.serviceTest.description'),
            children: (
              <div className="space-y-4">
                <div className="p-3 bg-yellow-50 dark:bg-background-primary border border-yellow-200 dark:border-yellow-700 rounded-lg">
                  <p className="text-sm text-gray-700 dark:text-foreground-secondary">
                    💡 {t('settings.serviceTest.tip')}
                  </p>
                </div>
                <div className="space-y-4">
                  {[
                    {
                      key: 'baidu-ocr',
                      titleKey: 'settings.serviceTest.tests.baiduOcr.title',
                      descriptionKey: 'settings.serviceTest.tests.baiduOcr.description',
                      resultKey: 'settings.serviceTest.results.recognizedText',
                      action: api.testBaiduOcr,
                      formatDetail: (data: any) => (data?.recognized_text ? t('settings.serviceTest.results.recognizedText', { text: data.recognized_text }) : ''),
                    },
                    {
                      key: 'text-model',
                      titleKey: 'settings.serviceTest.tests.textModel.title',
                      descriptionKey: 'settings.serviceTest.tests.textModel.description',
                      resultKey: 'settings.serviceTest.results.modelReply',
                      action: api.testTextModel,
                      formatDetail: (data: any) => (data?.reply ? t('settings.serviceTest.results.modelReply', { reply: data.reply }) : ''),
                    },
                    {
                      key: 'caption-model',
                      titleKey: 'settings.serviceTest.tests.captionModel.title',
                      descriptionKey: 'settings.serviceTest.tests.captionModel.description',
                      resultKey: 'settings.serviceTest.results.captionDesc',
                      action: api.testCaptionModel,
                      formatDetail: (data: any) => (data?.caption ? t('settings.serviceTest.results.captionDesc', { caption: data.caption }) : ''),
                    },
                    {
                      key: 'baidu-inpaint',
                      titleKey: 'settings.serviceTest.tests.baiduInpaint.title',
                      descriptionKey: 'settings.serviceTest.tests.baiduInpaint.description',
                      resultKey: 'settings.serviceTest.results.imageSize',
                      action: api.testBaiduInpaint,
                      formatDetail: (data: any) => (data?.image_size ? t('settings.serviceTest.results.imageSize', { width: data.image_size[0], height: data.image_size[1] }) : ''),
                    },
                    {
                      key: 'image-model',
                      titleKey: 'settings.serviceTest.tests.imageModel.title',
                      descriptionKey: 'settings.serviceTest.tests.imageModel.description',
                      resultKey: 'settings.serviceTest.results.imageSize',
                      action: api.testImageModel,
                      formatDetail: (data: any) => (data?.image_size ? t('settings.serviceTest.results.imageSize', { width: data.image_size[0], height: data.image_size[1] }) : ''),
                    },
                    {
                      key: 'mineru-pdf',
                      titleKey: 'settings.serviceTest.tests.mineruPdf.title',
                      descriptionKey: 'settings.serviceTest.tests.mineruPdf.description',
                      resultKey: 'settings.serviceTest.results.parsePreview',
                      action: api.testMineruPdf,
                      formatDetail: (data: any) => (data?.content_preview ? t('settings.serviceTest.results.parsePreview', { preview: data.content_preview }) : data?.message || ''),
                    },
                    {
                      key: 'mozjpeg',
                      titleKey: 'settings.serviceTest.tests.mozjpeg.title',
                      descriptionKey: 'settings.serviceTest.tests.mozjpeg.description',
                      resultKey: 'settings.serviceTest.results.mozjpegPath',
                      action: api.testMozjpeg,
                      formatDetail: (data: any) => {
                        const parts = [];
                        if (data?.cjpeg_path) {
                          parts.push(t('settings.serviceTest.results.mozjpegPath', { path: data.cjpeg_path }));
                        }
                        if (data?.butteraugli_path) {
                          parts.push(t('settings.serviceTest.results.butteraugliPath', { path: data.butteraugli_path }));
                        } else if (data?.butteraugli_available === false) {
                          parts.push(t('settings.serviceTest.results.butteraugliPath', { path: 'not found' }));
                        }
                        return parts.join(' ｜ ');
                      },
                      installHintKey: 'settings.serviceTest.results.mozjpegInstallHint',
                    },
                    {
                      key: 'oxipng',
                      titleKey: 'settings.serviceTest.tests.oxipng.title',
                      descriptionKey: 'settings.serviceTest.tests.oxipng.description',
                      resultKey: 'settings.serviceTest.results.oxipngPath',
                      action: api.testOxipng,
                      formatDetail: (data: any) => (data?.oxipng_path
                        ? t('settings.serviceTest.results.oxipngPath', { path: data.oxipng_path })
                        : ''),
                      installHintKey: 'settings.serviceTest.results.oxipngInstallHint',
                    },
                    {
                      key: 'pngquant',
                      titleKey: 'settings.serviceTest.tests.pngquant.title',
                      descriptionKey: 'settings.serviceTest.tests.pngquant.description',
                      resultKey: 'settings.serviceTest.results.pngquantPath',
                      action: api.testPngquant,
                      formatDetail: (data: any) => (data?.pngquant_path
                        ? t('settings.serviceTest.results.pngquantPath', { path: data.pngquant_path })
                        : ''),
                      installHintKey: 'settings.serviceTest.results.pngquantInstallHint',
                    },
                  ].map((item) => {
                    const testState = serviceTestStates[item.key] || { status: 'idle' as TestStatus };
                    const isLoadingTest = testState.status === 'loading';
                    return (
                      <div
                        key={item.key}
                        className="p-4 bg-gray-50 dark:bg-background-primary border border-gray-200 dark:border-border-primary rounded-lg space-y-2"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="text-base font-semibold text-gray-800 dark:text-foreground-primary">{t(item.titleKey)}</div>
                            <div className="text-sm text-gray-500 dark:text-foreground-tertiary">{t(item.descriptionKey)}</div>
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={isLoadingTest}
                            onClick={() => handleServiceTest(item.key, item.action, item.formatDetail)}
                          >
                            {isLoadingTest ? t('settings.serviceTest.testing') : t('settings.serviceTest.startTest')}
                          </Button>
                        </div>
                        {testState.status === 'success' && (
                          <p className="text-sm text-green-600">
                            {testState.message}{testState.detail ? `｜${testState.detail}` : ''}
                          </p>
                        )}
                        {testState.status === 'error' && (
                          <div className="space-y-1">
                            <p className="text-sm text-red-600">
                              {testState.message}
                            </p>
                            {item.installHintKey && (
                              <p className="text-xs text-gray-500 dark:text-foreground-tertiary">
                                {t(item.installHintKey)}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ),
          })}

          <Card className="p-4 md:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                variant="secondary"
                icon={<RotateCcw size={18} />}
                onClick={handleReset}
                disabled={isSaving}
              >
                {t('settings.actions.resetToDefault')}
              </Button>
              <Button
                variant="primary"
                icon={<Save size={18} />}
                onClick={handleSave}
                loading={isSaving}
              >
                {isSaving ? t('settings.actions.saving') : t('settings.actions.save')}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
};
