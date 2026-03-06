import React, { useState, useEffect, useRef, useMemo, useCallback, useTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles, FileText, FileEdit, ImagePlus, Paperclip, Palette, Lightbulb, Settings, FolderOpen, HelpCircle, History, Sun, Moon, Globe, Monitor, ChevronDown, Upload, RefreshCw } from 'lucide-react';
import { Button, Card, useToast, MaterialGeneratorModal, MaterialCenterModal, ReferenceFileList, ReferenceFileSelector, FilePreviewModal, HelpModal, TextStyleSelector, StyleWorkflowPanel } from '@/components/shared';
import { MarkdownTextarea, type MarkdownTextareaRef } from '@/components/shared/MarkdownTextarea';
import { TemplateSelector, getTemplateFile } from '@/components/shared/TemplateSelector';
import { listUserTemplates, type UserTemplate, type StylePreset, uploadReferenceFile, type ReferenceFile, associateFileToProject, triggerFileParse, associateMaterialsToProject, createPptRenovationProject, createProject, startStyleRecommendations, updateProject } from '@/api/endpoints';
import { useProjectStore } from '@/store/useProjectStore';
import { devLog } from '@/utils/logger';
import { useTheme } from '@/hooks/useTheme';
import { useImagePaste } from '@/hooks/useImagePaste';
import { useT } from '@/hooks/useT';
import { ASPECT_RATIO_OPTIONS } from '@/config/aspectRatio';
import mammoth from 'mammoth/mammoth.browser';

type CreationType = 'idea' | 'outline' | 'description' | 'ppt_renovation';

// 页面特有翻译 - AI 可以直接看到所有文案，保留原始 key 结构
const homeI18n = {
  zh: {
    nav: {
      materialGenerate: '素材生成', materialCenter: '素材中心',
      styleLibrary: '模板管理',
      history: '历史项目', settings: '设置', help: '帮助'
    },
    settings: {
      language: { label: '界面语言' },
      theme: { label: '主题模式', light: '浅色', dark: '深色', system: '跟随系统' }
    },
    home: {
      title: '蕉幻',
      subtitle: 'Vibe your slides like vibe coding',
      tagline: '基于 nano banana pro🍌 的原生 AI PPT 生成器',
      features: {
        oneClick: '一句话生成 PPT',
        naturalEdit: '自然语言修改',
        regionEdit: '指定区域编辑',
        export: '一键导出 PPTX/PDF',
      },
      tabs: {
        idea: '一句话生成',
        outline: '从大纲生成',
        description: '从描述生成',
        ppt_renovation: 'PPT 翻新',
      },
      tabDescriptions: {
        idea: '输入你的想法，AI 将为你生成完整的 PPT',
        outline: '已有大纲？直接粘贴，AI 将自动切分为结构化大纲',
        description: '已有完整描述？AI 将自动解析并直接生成图片，跳过大纲步骤',
        ppt_renovation: '上传已有的 PDF/PPTX 文件，AI 将解析内容并重新生成翻新后的PPT',
      },
      placeholders: {
        idea: '例如：生成一份关于 AI 发展史的演讲 PPT',
        outline: '粘贴你的 PPT 大纲...',
        description: '粘贴你的完整页面描述...',
      },
      descriptionTools: {
        sourceLabel: '原文内容',
        sourcePlaceholder: '上传文档后会在这里显示原文，也可以直接粘贴',
        selectSourceFile: '选择文件',
        parseSource: '拆分文档',
        parsingSource: '拆分中...',
        collapse: '收起',
        expand: '展开',
      },
      examples: {
        outline: '格式示例：\n\n第一页：AI 的起源\n- 1956年达特茅斯会议\n- 早期研究者的愿景\n\n第二页：机器学习的发展\n- 从规则驱动到数据驱动\n- 经典算法介绍\n\n第三页：未来展望\n- 趋势与挑战\n\n支持标题+要点的形式，也可以只写标题。AI 会自动切分为结构化大纲。',
        description: '格式示例：\n\n第一页：AI 的起源\n介绍人工智能概念的诞生，从1956年达特茅斯会议讲起。页面采用左文右图布局，左侧展示时间线，右侧配一张复古风格的计算机插画。\n\n第二页：机器学习的发展\n讲解从规则驱动到数据驱动的转变。使用深蓝色背景，中央放置算法对比图表，底部列出关键里程碑。\n\n每页可包含内容描述、排版布局、视觉风格等，用空行分隔各页。',
      },
      template: {
        title: '选择风格模板',
        useTextStyle: '使用文字描述风格',
      },
      actions: {
        selectFile: '选择参考文件',
        parsing: '解析中...',
        createProject: '创建新项目',
      },
      renovation: {
        uploadHint: '点击或拖拽上传 PDF / PPTX 文件',
        formatHint: '支持 .pdf, .pptx, .ppt 格式（推荐上传 PDF）',
        keepLayout: '保留原始排版布局',
        onlyPdfPptx: '仅支持 PDF 和 PPTX 文件',
        uploadFile: '请先上传 PDF 或 PPTX 文件',
      },
      messages: {
        enterContent: '请输入内容',
        filesParsing: '还有 {{count}} 个参考文件正在解析中，请等待解析完成',
        projectCreateFailed: '项目创建失败',
        uploadingImage: '正在上传图片并识别内容...',
        imageUploadSuccess: '图片上传成功！已插入到光标位置',
        imageUploadFailed: '图片上传失败',
        fileUploadSuccess: '文件上传成功',
        fileUploadFailed: '文件上传失败',
        fileTooLarge: '文件过大：{{size}}MB，最大支持 200MB',
        unsupportedFileType: '不支持的文件类型: {{type}}',
        pptTip: '建议先在本地将 PPTX 转为 PDF 后再上传，可获得更好的兼容性和更快的处理速度',
        filesAdded: '已添加 {{count}} 个参考文件',
        imageRemoved: '已移除图片',
        serviceTestTip: '建议先到设置页底部进行服务测试，避免后续功能异常',
        verifying: '正在验证 API 配置...',
        verifyFailed: '请在设置页配置正确的 API Key，并在页面底部点击「服务测试」验证',
        parseSourceSuccess: '拆分完成',
        parseSourceFailed: '拆分失败',
        parseSourceEmpty: '请先选择文件或粘贴原文',
        unsupportedSourceFile: '仅支持 .docx / .txt / .md 文件',
      },
    },
  },
  en: {
    nav: {
      materialGenerate: 'Generate Material', materialCenter: 'Material Center',
      styleLibrary: 'Style Library',
      history: 'History', settings: 'Settings', help: 'Help'
    },
    settings: {
      language: { label: 'Interface Language' },
      theme: { label: 'Theme', light: 'Light', dark: 'Dark', system: 'System' }
    },
    home: {
      title: 'Banana Slides',
      subtitle: 'Vibe your slides like vibe coding',
      tagline: 'AI-native PPT generator powered by nano banana pro🍌',
      features: {
        oneClick: 'One-click PPT generation',
        naturalEdit: 'Natural language editing',
        regionEdit: 'Region-specific editing',
        export: 'Export to PPTX/PDF',
      },
      tabs: {
        idea: 'From Idea',
        outline: 'From Outline',
        description: 'From Description',
        ppt_renovation: 'PPT Renovation',
      },
      tabDescriptions: {
        idea: 'Enter your idea, AI will generate a complete PPT for you',
        outline: 'Have an outline? Paste it directly, AI will split it into a structured outline',
        description: 'Have detailed descriptions? AI will parse and generate images directly, skipping the outline step',
        ppt_renovation: 'Upload an existing PDF/PPTX file, AI will parse its content and regenerate the renovated PPT',
      },
      placeholders: {
        idea: 'e.g., Generate a presentation about the history of AI',
        outline: 'Paste your PPT outline...',
        description: 'Paste your complete page descriptions...',
      },
      descriptionTools: {
        sourceLabel: 'Source Text',
        sourcePlaceholder: 'Upload a document to show the source text, or paste it here',
        selectSourceFile: 'Choose File',
        parseSource: 'Split Document',
        parsingSource: 'Splitting...',
        collapse: 'Collapse',
        expand: 'Expand',
      },
      examples: {
        outline: 'Format example:\n\nSlide 1: The Origins of AI\n- 1956 Dartmouth Conference\n- Vision of early researchers\n\nSlide 2: The Rise of Machine Learning\n- From rule-based to data-driven\n- Classic algorithms overview\n\nSlide 3: Future Outlook\n- Trends and challenges\n\nTitles with bullet points, or titles only. AI will split it into a structured outline.',
        description: 'Format example:\n\nSlide 1: The Origins of AI\nIntroduce the birth of AI, starting from the 1956 Dartmouth Conference. Use a left-text right-image layout with a timeline on the left and a retro-style computer illustration on the right.\n\nSlide 2: The Rise of Machine Learning\nExplain the shift from rule-based to data-driven approaches. Dark blue background, algorithm comparison chart in the center, key milestones at the bottom.\n\nEach slide can include content, layout, and visual style. Separate slides with blank lines.',
      },
      template: {
        title: 'Select Style Template',
        useTextStyle: 'Use text description for style',
      },
      actions: {
        selectFile: 'Select reference file',
        parsing: 'Parsing...',
        createProject: 'Create New Project',
      },
      renovation: {
        uploadHint: 'Click or drag to upload PDF / PPTX file',
        formatHint: 'Supports .pdf, .pptx, .ppt formats (PDF recommended)',
        keepLayout: 'Keep original layout',
        onlyPdfPptx: 'Only PDF and PPTX files are supported',
        uploadFile: 'Please upload a PDF or PPTX file first',
      },
      messages: {
        enterContent: 'Please enter content',
        filesParsing: '{{count}} reference file(s) are still parsing, please wait',
        projectCreateFailed: 'Failed to create project',
        uploadingImage: 'Uploading and recognizing image...',
        imageUploadSuccess: 'Image uploaded! Inserted at cursor position',
        imageUploadFailed: 'Failed to upload image',
        fileUploadSuccess: 'File uploaded successfully',
        fileUploadFailed: 'Failed to upload file',
        fileTooLarge: 'File too large: {{size}}MB, maximum 200MB',
        unsupportedFileType: 'Unsupported file type: {{type}}',
        pptTip: 'We recommend converting your PPTX to PDF locally before uploading for better compatibility and faster processing',
        filesAdded: 'Added {{count}} reference file(s)',
        imageRemoved: 'Image removed',
        serviceTestTip: 'Test services in Settings first to avoid issues',
        verifying: 'Verifying API configuration...',
        verifyFailed: 'Please configure a valid API Key in Settings and click "Service Test" at the bottom to verify',
        parseSourceSuccess: 'Split complete',
        parseSourceFailed: 'Split failed',
        parseSourceEmpty: 'Please choose a file or paste source text first',
        unsupportedSourceFile: 'Only .docx, .txt, or .md files are supported',
      },
    },
  },
};

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const t = useT(homeI18n); // 组件内翻译 + 自动 fallback 到全局
  const { theme, isDark, setTheme } = useTheme();
  const { initializeProject, isGlobalLoading } = useProjectStore();
  const { show, ToastContainer } = useToast();
  
  const [activeTab, setActiveTab] = useState<CreationType>('idea');
  const [content, setContent] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<File | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedPresetTemplateId, setSelectedPresetTemplateId] = useState<string | null>(null);
  const [selectedStylePresetId, setSelectedStylePresetId] = useState<string | null>(null);
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  const [isMaterialCenterOpen, setIsMaterialCenterOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);
  const [referenceFiles, setReferenceFiles] = useState<ReferenceFile[]>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isFileSelectorOpen, setIsFileSelectorOpen] = useState(false);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);

  const [useTemplateStyle, setUseTemplateStyle] = useState(false);
  const [templateStyle, setTemplateStyle] = useState('');
  const [pendingStylePresetJson, setPendingStylePresetJson] = useState<string>('');
  const [stylePreviewProjectId, setStylePreviewProjectId] = useState<string | null>(null);
  const [stylePreviewTaskId, setStylePreviewTaskId] = useState<string | null>(null);
  const [stylePreviewTemplateJson, setStylePreviewTemplateJson] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [isAspectRatioOpen, setIsAspectRatioOpen] = useState(false);
  const [renovationFile, setRenovationFile] = useState<File | null>(null);
  const [keepLayout, setKeepLayout] = useState(false);
  const [sourceText, setSourceText] = useState('');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [isParsingSource, setIsParsingSource] = useState(false);
  const [isSourceCollapsed, setIsSourceCollapsed] = useState(false);
  const [isReadingSource, setIsReadingSource] = useState(false);
  const [isContentCollapsed, setIsContentCollapsed] = useState(false);
  const renovationFileInputRef = useRef<HTMLInputElement>(null);
  const sourceFileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const draftSaveHandleRef = useRef<{ type: 'timeout' | 'idle'; id: number } | null>(null);
  const [, startTransition] = useTransition();

  const setContentOptimized = useCallback((next: string) => {
    // Large text updates can make the whole Home page re-render and block the UI.
    // Defer big updates so paste stays responsive.
    if ((next?.length || 0) >= 8000) {
      startTransition(() => setContent(next));
      return;
    }
    setContent(next);
  }, [startTransition]);

  const setSourceTextOptimized = useCallback((next: string) => {
    if ((next?.length || 0) >= 8000) {
      startTransition(() => setSourceText(next));
      return;
    }
    setSourceText(next);
  }, [startTransition]);

  // 持久化草稿到 sessionStorage，确保跳转设置页后返回时内容不丢失
  useEffect(() => {
    const cancelScheduledSave = () => {
      const handle = draftSaveHandleRef.current;
      if (!handle) return;
      if (handle.type === 'timeout') {
        window.clearTimeout(handle.id);
      } else if (typeof (window as any).cancelIdleCallback === 'function') {
        (window as any).cancelIdleCallback(handle.id);
      }
      draftSaveHandleRef.current = null;
    };

    cancelScheduledSave();

    const doSave = () => {
      try {
        if (content) sessionStorage.setItem('home-draft-content', content);
        else sessionStorage.removeItem('home-draft-content');
      } catch {
        // Ignore storage failures (quota/disabled). Draft persistence is best-effort.
      }
    };

    // sessionStorage 写入是同步的；用 idle/timeout 推迟到空闲期，避免大段粘贴时卡顿
    if (typeof (window as any).requestIdleCallback === 'function') {
      const id = (window as any).requestIdleCallback(doSave, { timeout: 1500 });
      draftSaveHandleRef.current = { type: 'idle', id };
    } else {
      const id = window.setTimeout(doSave, 300);
      draftSaveHandleRef.current = { type: 'timeout', id };
    }

    return cancelScheduledSave;
  }, [content]);

  useEffect(() => {
    sessionStorage.setItem('home-draft-tab', activeTab);
  }, [activeTab]);


  // 检查是否有当前项目 & 加载用户模板
  useEffect(() => {
    const projectId = localStorage.getItem('currentProjectId');
    setCurrentProjectId(projectId);

    // 加载用户模板列表（用于按需获取File）
    const loadTemplates = async () => {
      try {
        const response = await listUserTemplates();
        if (response.data?.templates) {
          setUserTemplates(response.data.templates);
        }
      } catch (error) {
        console.error('加载用户模板失败:', error);
      }
    };
    loadTemplates();
  }, []);

  // 首次访问自动弹出帮助模态框
  useEffect(() => {
    const hasSeenHelp = localStorage.getItem('hasSeenHelpModal');
    if (!hasSeenHelp) {
      // 延迟500ms打开，让页面先渲染完成
      const timer = setTimeout(() => {
        setIsHelpModalOpen(true);
        localStorage.setItem('hasSeenHelpModal', 'true');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (!isThemeMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (themeMenuRef.current && !themeMenuRef.current.contains(target)) {
        setIsThemeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isThemeMenuOpen]);

  const handleOpenMaterialModal = () => {
    // 在主页始终生成全局素材，不关联任何项目
    setIsMaterialModalOpen(true);
  };

  const textareaRef = useRef<MarkdownTextareaRef>(null);

  // Callback to insert at cursor position in the textarea
  const insertAtCursor = useCallback((markdown: string) => {
    textareaRef.current?.insertAtCursor(markdown);
  }, []);

  // 图片粘贴使用统一 hook（批量支持，不对非图片文件发出警告，由下方 handlePaste 处理文档）
  const { handlePaste: handleImagePaste, handleFiles: handleImageFiles, isUploading: isUploadingImage } = useImagePaste({
    projectId: null,
    setContent,
    showToast: show,
    warnUnsupportedTypes: false,
    insertAtCursor,
  });

  // 检测粘贴事件，图片走 hook，文档走独立逻辑
  const handlePaste = async (e: React.ClipboardEvent<HTMLElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    // 分类：图片 vs 文档 vs 不支持
    let hasImages = false;
    const docFiles: File[] = [];
    const unsupportedExts: string[] = [];

    const allowedDocExtensions = ['pdf', 'docx', 'pptx', 'doc', 'ppt', 'xlsx', 'xls', 'csv', 'txt', 'md'];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (!file) continue;

      if (file.type.startsWith('image/')) {
        hasImages = true;
      } else {
        const fileExt = file.name.split('.').pop()?.toLowerCase();
        if (fileExt && allowedDocExtensions.includes(fileExt)) {
          docFiles.push(file);
        } else {
          unsupportedExts.push(fileExt || file.type);
        }
      }
    }

    // 图片交给 hook 处理（批量上传）
    if (hasImages) {
      handleImagePaste(e);
    }

    // 文档文件逐个上传
    if (docFiles.length > 0) {
      if (!hasImages) e.preventDefault();
      for (const file of docFiles) {
        await handleFileUpload(file);
      }
    }

    // 不支持的文件类型提示
    if (unsupportedExts.length > 0 && !hasImages && docFiles.length === 0) {
      show({ message: t('home.messages.unsupportedFileType', { type: unsupportedExts.join(', ') }), type: 'info' });
    }
  };

  // 上传文件
  // 在 Home 页面，文件始终上传为全局文件（不关联项目），因为此时还没有项目
  const handleFileUpload = async (file: File) => {
    if (isUploadingFile) return;

    // 检查文件大小（前端预检查）
    const maxSize = 200 * 1024 * 1024; // 200MB
    if (file.size > maxSize) {
      show({ 
        message: t('home.messages.fileTooLarge', { size: (file.size / 1024 / 1024).toFixed(1) }), 
        type: 'error' 
      });
      return;
    }

    // 检查是否是PPT文件，提示建议使用PDF
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    if (fileExt === 'ppt' || fileExt === 'pptx') 
      show({ message: `💡 ${t('home.messages.pptTip')}`, type: 'info' });
    
    setIsUploadingFile(true);
    try {
      // 在 Home 页面，始终上传为全局文件
      const response = await uploadReferenceFile(file, null);
      if (response?.data?.file) {
        const uploadedFile = response.data.file;
        setReferenceFiles(prev => [...prev, uploadedFile]);
        show({ message: t('home.messages.fileUploadSuccess'), type: 'success' });
        
        // 如果文件状态为 pending，自动触发解析
        if (uploadedFile.parse_status === 'pending') {
          try {
            const parseResponse = await triggerFileParse(uploadedFile.id);
            // 使用解析接口返回的文件对象更新状态
            if (parseResponse?.data?.file) {
              const parsedFile = parseResponse.data.file;
              setReferenceFiles(prev => 
                prev.map(f => f.id === uploadedFile.id ? parsedFile : f)
              );
            } else {
              // 如果没有返回文件对象，手动更新状态为 parsing（异步线程会稍后更新）
              setReferenceFiles(prev => 
                prev.map(f => f.id === uploadedFile.id ? { ...f, parse_status: 'parsing' as const } : f)
              );
            }
          } catch (parseError: any) {
            console.error('触发文件解析失败:', parseError);
            // 解析触发失败不影响上传成功提示
          }
        }
      } else {
        show({ message: t('home.messages.fileUploadFailed'), type: 'error' });
      }
    } catch (error: any) {
      console.error('文件上传失败:', error);
      
      // 特殊处理413错误
      if (error?.response?.status === 413) {
        show({
          message: t('home.messages.fileTooLarge', { size: (file.size / 1024 / 1024).toFixed(1) }),
          type: 'error'
        });
      } else {
        show({
          message: `${t('home.messages.fileUploadFailed')}: ${error?.response?.data?.error?.message || error.message || ''}`.replace(/: $/, ''),
          type: 'error'
        });
      }
    } finally {
      setIsUploadingFile(false);
    }
  };

  // 从当前项目移除文件引用（不删除文件本身）
  const handleFileRemove = (fileId: string) => {
    setReferenceFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // 文件状态变化回调
  const handleFileStatusChange = (updatedFile: ReferenceFile) => {
    setReferenceFiles(prev => 
      prev.map(f => f.id === updatedFile.id ? updatedFile : f)
    );
  };

  // 点击回形针按钮 - 打开文件选择器
  const handlePaperclipClick = () => {
    setIsFileSelectorOpen(true);
  };

  // 从选择器选择文件后的回调
  const handleFilesSelected = (selectedFiles: ReferenceFile[]) => {
    // 合并新选择的文件到列表（去重）
    setReferenceFiles(prev => {
      const existingIds = new Set(prev.map(f => f.id));
      const newFiles = selectedFiles.filter(f => !existingIds.has(f.id));
      // 合并时，如果文件已存在，更新其状态（可能解析状态已改变）
      const updated = prev.map(f => {
        const updatedFile = selectedFiles.find(sf => sf.id === f.id);
        return updatedFile || f;
      });
      return [...updated, ...newFiles];
    });
    show({ message: t('home.messages.filesAdded', { count: selectedFiles.length }), type: 'success' });
  };

  // 获取当前已选择的文件ID列表，传递给选择器（使用 useMemo 避免每次渲染都重新计算）
  const selectedFileIds = useMemo(() => {
    return referenceFiles.map(f => f.id);
  }, [referenceFiles]);

  // 文件选择变化
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      await handleFileUpload(files[i]);
    }

    // 清空 input，允许重复选择同一文件
    e.target.value = '';
  };

  const readSourceFileText = useCallback(async (file: File) => {
    const filename = file.name.toLowerCase();
    if (filename.endsWith('.txt') || filename.endsWith('.md') || filename.endsWith('.markdown')) {
      return await file.text();
    }
    if (filename.endsWith('.docx')) {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value || '';
    }
    throw new Error('UNSUPPORTED_FILE');
  }, []);

  const handleSourceFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSourceFile(file);
    e.target.value = '';

    if (!file) return;

    setIsReadingSource(true);
    try {
      const rawText = await readSourceFileText(file);
      setSourceText(rawText);
      setIsSourceCollapsed(false);
    } catch (error: any) {
      const message = error?.message === 'UNSUPPORTED_FILE'
        ? t('home.messages.unsupportedSourceFile')
        : t('home.messages.parseSourceFailed');
      show({ message, type: 'error' });
    } finally {
      setIsReadingSource(false);
    }
  }, [readSourceFileText, show, t]);

  const handleParseSource = useCallback(async () => {
    if (activeTab !== 'description' || isParsingSource) return;

    let rawText = sourceText;
    let trimmedText = rawText.trim();

    if (!trimmedText && sourceFile) {
      try {
        rawText = await readSourceFileText(sourceFile);
        setSourceText(rawText);
        trimmedText = rawText.trim();
      } catch (error: any) {
        const message = error?.message === 'UNSUPPORTED_FILE'
          ? t('home.messages.unsupportedSourceFile')
          : t('home.messages.parseSourceFailed');
        show({ message, type: 'error' });
        return;
      }
    }

    if (!trimmedText) {
      show({ message: t('home.messages.parseSourceEmpty'), type: 'warning' });
      return;
    }

    setIsParsingSource(true);
    try {
      const referenceFileIds = referenceFiles
        .filter((file) => file.parse_status === 'completed')
        .map((file) => file.id);

      const accessCode = localStorage.getItem('banana-access-code');
      const response = await fetch('/api/parse/report/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          ...(accessCode ? { 'X-Access-Code': accessCode } : {}),
        },
        body: JSON.stringify({
          report_text: trimmedText,
          reference_file_ids: referenceFileIds.length ? referenceFileIds : undefined,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP_${response.status}`);
      }

      setContent('');
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx = buffer.indexOf('\n\n');
        while (idx !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          const lines = chunk.split('\n');
          let eventType = '';
          const dataLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventType = line.slice(6).trim();
              continue;
            }
            if (line.startsWith('data:')) {
              let dataLine = line.slice(5);
              if (dataLine.startsWith(' ')) dataLine = dataLine.slice(1);
              dataLines.push(dataLine);
            }
          }

          const data = dataLines.join('\n');
          if (eventType === 'error') {
            throw new Error(data || 'Stream error');
          }
          if (data === '[DONE]') {
            buffer = '';
            break;
          }
          if (data) {
            accumulated += data;
            setContent(accumulated);
          }
          idx = buffer.indexOf('\n\n');
        }
      }

      if (!accumulated.trim()) {
        throw new Error('EMPTY_SPLIT_RESULT');
      }

      const cleaned = accumulated
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```$/i, '')
        .trim();
      setContent(cleaned);
      show({ message: t('home.messages.parseSourceSuccess'), type: 'success' });
    } catch (error: any) {
      const message = error?.response?.data?.error?.message
        || error?.message
        || t('home.messages.parseSourceFailed');
      show({ message, type: 'error' });
    } finally {
      setIsParsingSource(false);
    }
  }, [
    activeTab,
    isParsingSource,
    sourceText,
    sourceFile,
    readSourceFileText,
    referenceFiles,
    t,
    show
  ]);

  const tabConfig = {
    idea: {
      icon: <Sparkles size={20} />,
      label: t('home.tabs.idea'),
      placeholder: t('home.placeholders.idea'),
      description: t('home.tabDescriptions.idea'),
      example: null as string | null,
    },
    outline: {
      icon: <FileText size={20} />,
      label: t('home.tabs.outline'),
      placeholder: t('home.placeholders.outline'),
      description: t('home.tabDescriptions.outline'),
      example: t('home.examples.outline'),
    },
    description: {
      icon: <FileEdit size={20} />,
      label: t('home.tabs.description'),
      placeholder: t('home.placeholders.description'),
      description: t('home.tabDescriptions.description'),
      example: t('home.examples.description'),
    },
    ppt_renovation: {
      icon: <RefreshCw size={20} />,
      label: t('home.tabs.ppt_renovation'),
      placeholder: '',
      description: t('home.tabDescriptions.ppt_renovation'),
      example: null as string | null,
    },
  };

  const handleTemplateSelect = async (templateFile: File | null, templateId?: string) => {
    // 同步文件选择状态，避免保留过期的本地 File
    setSelectedTemplate(templateFile || null);
    setPendingStylePresetJson('');
    setSelectedStylePresetId(null);
    
    // 处理模板 ID
    if (templateId) {
      // 判断是用户模板还是预设模板
      // 预设模板 ID 通常是 '1', '2', '3' 等短字符串
      // 用户模板 ID 通常较长（UUID 格式）
      if (templateId.length <= 3 && /^\d+$/.test(templateId)) {
        // 预设模板
        setSelectedPresetTemplateId(templateId);
        setSelectedTemplateId(null);
      } else {
        // 用户模板
        setSelectedTemplateId(templateId);
        setSelectedPresetTemplateId(null);
      }
    } else {
      // 如果没有 templateId，可能是直接上传的文件
      // 清空所有选择状态
      setSelectedTemplateId(null);
      setSelectedPresetTemplateId(null);
    }
  };

  const handleSelectStylePreset = async (preset: StylePreset | null) => {
    if (!preset) {
      setPendingStylePresetJson('');
      setSelectedStylePresetId(null);
      return;
    }
    setPendingStylePresetJson((preset.style_json || '').trim());
    setSelectedStylePresetId(preset.id);
    setSelectedTemplate(null);
    setSelectedTemplateId(null);
    setSelectedPresetTemplateId(null);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGenerateStylePreviews = async (args: { templateJson: string; styleRequirements: string; generatePreviews?: boolean }) => {
    if (!content.trim()) {
      const label = activeTab === 'idea' ? '想法/主题' : activeTab === 'outline' ? '大纲' : '原文';
      show({ message: `请先填写${label}内容，再生成风格推荐`, type: 'error' });
      return;
    }
    // 检查是否有正在解析的文件
    const parsingFiles = referenceFiles.filter(f =>
      f.parse_status === 'pending' || f.parse_status === 'parsing'
    );
    if (parsingFiles.length > 0) {
      show({
        message: t('home.messages.filesParsing', { count: parsingFiles.length }),
        type: 'info'
      });
      return;
    }

    if (activeTab === 'ppt_renovation') {
      show({ message: 'PPT 翻新模式暂不支持风格预览工作流', type: 'error' });
      return;
    }

    setIsSubmitting(true);
    try {
      const request: any = {};
      if (activeTab === 'idea') request.idea_prompt = content;
      else if (activeTab === 'outline') request.outline_text = content;
      else if (activeTab === 'description') request.description_text = content;

      const styleDesc = (args.styleRequirements || '').trim();
      if (styleDesc) request.template_style = styleDesc;
      if (aspectRatio) request.image_aspect_ratio = aspectRatio;

      const resp = await createProject(request);
      const projectId = (resp.data as any)?.project_id;
      if (!projectId) throw new Error('项目创建失败：未返回项目ID');
      localStorage.setItem('currentProjectId', projectId);

      // 关联已完成解析的参考文件到项目（确保后端能读取内容用于推荐）
      const refFileIds = referenceFiles
        .filter(f => f.parse_status === 'completed')
        .map(f => f.id);
      if (refFileIds.length > 0) {
        try {
          await Promise.all(refFileIds.map(fileId => associateFileToProject(fileId, projectId)));
        } catch (e) {
          console.warn('Failed to associate reference files for style recommendations:', e);
        }
      }

      const taskResp = await startStyleRecommendations(projectId, {
        template_json: args.templateJson,
        style_requirements: styleDesc,
        generate_previews: typeof args.generatePreviews === 'boolean' ? args.generatePreviews : false,
      });
      const taskId = (taskResp.data as any)?.task_id;
      if (!taskId) throw new Error('风格预览任务创建失败：未返回 task_id');

      setStylePreviewProjectId(projectId);
      setStylePreviewTaskId(taskId);
      setStylePreviewTemplateJson(args.templateJson);
    } catch (error: any) {
      const msg = error?.response?.data?.error?.message || error?.message || '生成风格预览失败';
      show({ message: msg, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    // For ppt_renovation, validate file instead of content
    if (activeTab === 'ppt_renovation') {
      if (!renovationFile) {
        show({ message: t('home.renovation.uploadFile'), type: 'error' });
        return;
      }
    } else if (!content.trim()) {
      show({ message: t('home.messages.enterContent'), type: 'error' });
      return;
    }

    // 检查是否有正在解析的文件
    const parsingFiles = referenceFiles.filter(f =>
      f.parse_status === 'pending' || f.parse_status === 'parsing'
    );
    if (parsingFiles.length > 0) {
      show({
        message: t('home.messages.filesParsing', { count: parsingFiles.length }),
        type: 'info'
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // PPT 翻新模式：走独立的上传+异步解析流程
      if (activeTab === 'ppt_renovation' && renovationFile) {
        const styleDesc = templateStyle.trim() ? templateStyle.trim() : undefined;
        const result = await createPptRenovationProject(renovationFile, {
          keepLayout,
          templateStyle: styleDesc,
        });

        const projectId = result.data?.project_id;
        const taskId = result.data?.task_id;
        if (!projectId) {
          show({ message: t('home.messages.projectCreateFailed'), type: 'error' });
          return;
        }

        // Save project ID and task ID for DetailEditor to poll
        localStorage.setItem('currentProjectId', projectId);
        if (taskId) {
          localStorage.setItem('renovationTaskId', taskId);
        }

        // Clear draft
        sessionStorage.removeItem('home-draft-content');
        sessionStorage.removeItem('home-draft-tab');

        // Navigate to detail editor (will poll for task completion with skeleton UI)
        navigate(`/project/${projectId}/detail`);
        return;
      }

      // 如果有模板ID但没有File，按需加载
      let templateFile = selectedTemplate;
      if (!templateFile && (selectedTemplateId || selectedPresetTemplateId)) {
        const templateId = selectedTemplateId || selectedPresetTemplateId;
        if (templateId) {
          templateFile = await getTemplateFile(templateId, userTemplates);
        }
      }
      
      // 传递风格描述（只要有内容就传递，不管开关状态）
      const styleDesc = templateStyle.trim() ? templateStyle.trim() : undefined;

      // 传递参考文件ID列表，确保 AI 生成时能读取参考文件内容
      const refFileIds = referenceFiles
        .filter(f => f.parse_status === 'completed')
        .map(f => f.id);

      await initializeProject(activeTab as 'idea' | 'outline' | 'description', content, templateFile || undefined, styleDesc, refFileIds.length > 0 ? refFileIds : undefined, aspectRatio);
      
      // 根据类型跳转到不同页面
      const projectId = localStorage.getItem('currentProjectId');
      if (!projectId) {
        show({ message: t('home.messages.projectCreateFailed'), type: 'error' });
        return;
      }

      // 如选择了风格预设（style_json），在项目创建后直接写入（不影响既有生成流程）
      if (pendingStylePresetJson && pendingStylePresetJson.trim()) {
        try {
          await updateProject(projectId, { template_style_json: pendingStylePresetJson.trim() } as any);
          show({ message: '已应用风格预设', type: 'success' });
        } catch (e: any) {
          console.warn('Failed to apply style preset json:', e);
        }
      }
      
      // 关联未完成解析的参考文件（已完成的在 initializeProject 中关联）
      if (referenceFiles.length > 0) {
        const unassociatedFiles = referenceFiles.filter(f => f.parse_status !== 'completed');
        if (unassociatedFiles.length > 0) {
          devLog(`Associating ${unassociatedFiles.length} remaining reference files to project ${projectId}:`, unassociatedFiles);
          try {
            await Promise.all(
              unassociatedFiles.map(async file => {
                const response = await associateFileToProject(file.id, projectId);
                return response;
              })
            );
          } catch (error) {
            console.error('Failed to associate reference files:', error);
          }
        }
      }
      
      // 关联图片素材到项目（解析content中的markdown图片链接）
      const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
      const materialUrls: string[] = [];
      let match;
      while ((match = imageRegex.exec(content)) !== null) {
        materialUrls.push(match[2]); // match[2] 是 URL
      }
      
      if (materialUrls.length > 0) {
        devLog(`Associating ${materialUrls.length} materials to project ${projectId}:`, materialUrls);
        try {
          const response = await associateMaterialsToProject(projectId, materialUrls);
          devLog('Materials associated successfully:', response);
        } catch (error) {
          console.error('Failed to associate materials:', error);
          // 不影响主流程，继续执行
        }
      } else {
        devLog('No materials to associate');
      }
      
      if (activeTab === 'idea' || activeTab === 'outline') {
        navigate(`/project/${projectId}/outline`);
      } else if (activeTab === 'description') {
        // 从描述生成：直接跳到描述生成页（因为已经自动生成了大纲和描述）
        navigate(`/project/${projectId}/detail`);
      }
    } catch (error: any) {
      console.error('创建项目失败:', error);
      const msg = error?.response?.data?.error?.message || error?.message || t('home.messages.projectCreateFailed');
      show({ message: msg, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50/30 to-pink-50/50 dark:from-background-primary dark:via-background-primary dark:to-background-primary relative overflow-hidden">
      {/* 背景装饰元素 - 仅在亮色模式显示 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none dark:hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-banana-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-orange-400/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-yellow-400/5 rounded-full blur-3xl"></div>
      </div>

      {/* 导航栏 */}
      <nav className="relative z-50 h-16 md:h-18 bg-white/40 dark:bg-background-primary backdrop-blur-2xl dark:backdrop-blur-none dark:border-b dark:border-border-primary">

        <div className="max-w-5xl mx-auto px-4 md:px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center">
              <img
                src="/logo.png"
                alt="蕉幻 Banana Slides Logo"
                className="h-10 md:h-12 w-auto rounded-lg object-contain"
              />
            </div>
            <span className="text-xl md:text-2xl font-bold bg-gradient-to-r from-banana-600 via-orange-500 to-pink-500 bg-clip-text text-transparent">
              蕉幻
            </span>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            {/* 桌面端：带文字的素材生成按钮 */}
            <Button
              variant="ghost"
              size="sm"
              icon={<ImagePlus size={16} className="md:w-[18px] md:h-[18px]" />}
              onClick={handleOpenMaterialModal}
              className="hidden sm:inline-flex hover:bg-banana-100/60 hover:shadow-sm hover:scale-105 transition-all duration-200 font-medium"
            >
              <span className="hidden md:inline">{t('nav.materialGenerate')}</span>
            </Button>
            {/* 手机端：仅图标的素材生成按钮 */}
            <Button
              variant="ghost"
              size="sm"
              icon={<ImagePlus size={16} />}
              onClick={handleOpenMaterialModal}
              className="sm:hidden hover:bg-banana-100/60 hover:shadow-sm hover:scale-105 transition-all duration-200"
              title={t('nav.materialGenerate')}
            />
            {/* 桌面端：带文字的素材中心按钮 */}
            <Button
              variant="ghost"
              size="sm"
              icon={<FolderOpen size={16} className="md:w-[18px] md:h-[18px]" />}
              onClick={() => setIsMaterialCenterOpen(true)}
              className="hidden sm:inline-flex hover:bg-banana-100/60 hover:shadow-sm hover:scale-105 transition-all duration-200 font-medium"
            >
              <span className="hidden md:inline">{t('nav.materialCenter')}</span>
            </Button>
            {/* 手机端：仅图标的素材中心按钮 */}
            <Button
              variant="ghost"
              size="sm"
              icon={<FolderOpen size={16} />}
              onClick={() => setIsMaterialCenterOpen(true)}
              className="sm:hidden hover:bg-banana-100/60 hover:shadow-sm hover:scale-105 transition-all duration-200"
              title={t('nav.materialCenter')}
            />
            <Button
              variant="ghost"
              size="sm"
              icon={<Palette size={16} className="md:w-[18px] md:h-[18px]" />}
              onClick={() => navigate('/style-library')}
              className="text-xs md:text-sm hover:bg-banana-100/60 hover:shadow-sm hover:scale-105 transition-all duration-200 font-medium"
            >
              <span className="hidden md:inline">{t('nav.styleLibrary')}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<History size={16} className="md:w-[18px] md:h-[18px]" />}
              onClick={() => navigate('/history')}
              className="text-xs md:text-sm hover:bg-banana-100/60 hover:shadow-sm hover:scale-105 transition-all duration-200 font-medium"
            >
              <span className="hidden sm:inline">{t('nav.history')}</span>
              <span className="sm:hidden">{t('nav.history')}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<Settings size={16} className="md:w-[18px] md:h-[18px]" />}
              onClick={() => navigate('/settings')}
              className="text-xs md:text-sm hover:bg-banana-100/60 hover:shadow-sm hover:scale-105 transition-all duration-200 font-medium"
            >
              <span className="hidden md:inline">{t('nav.settings')}</span>
            </Button>
            {/* 分隔线 */}
            <div className="h-5 w-px bg-gray-300 dark:bg-border-primary mx-1" />
            {/* 语言切换按钮 */}
            <button
              onClick={() => i18n.changeLanguage(i18n.language?.startsWith('zh') ? 'en' : 'zh')}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 dark:text-foreground-tertiary hover:text-gray-900 dark:hover:text-gray-100 hover:bg-banana-100/60 dark:hover:bg-background-hover rounded-md transition-all"
              title={t('settings.language.label')}
            >
              <Globe size={14} />
              <span>{i18n.language?.startsWith('zh') ? 'EN' : '中'}</span>
            </button>
            {/* 主题切换按钮 */}
            <div className="relative" ref={themeMenuRef}>
              <button
                onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
                className="flex items-center gap-1 p-1.5 text-gray-600 dark:text-foreground-tertiary hover:text-gray-900 dark:hover:text-gray-100 hover:bg-banana-100/60 dark:hover:bg-background-hover rounded-md transition-all"
                title={t('settings.theme.label')}
              >
                {theme === 'system' ? <Monitor size={16} /> : isDark ? <Moon size={16} /> : <Sun size={16} />}
                <ChevronDown size={12} className={`transition-transform ${isThemeMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {/* 主题下拉菜单 */}
              {isThemeMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsThemeMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-background-secondary border border-gray-200 dark:border-border-primary rounded-lg shadow-lg dark:shadow-none py-1 min-w-[120px]">
                    <button
                      onClick={() => { setTheme('light'); setIsThemeMenuOpen(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-background-hover transition-colors ${theme === 'light' ? 'text-banana' : 'text-gray-700 dark:text-foreground-secondary'}`}
                    >
                      <Sun size={14} />
                      <span>{t('settings.theme.light')}</span>
                    </button>
                    <button
                      onClick={() => { setTheme('dark'); setIsThemeMenuOpen(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-background-hover transition-colors ${theme === 'dark' ? 'text-banana' : 'text-gray-700 dark:text-foreground-secondary'}`}
                    >
                      <Moon size={14} />
                      <span>{t('settings.theme.dark')}</span>
                    </button>
                    <button
                      onClick={() => { setTheme('system'); setIsThemeMenuOpen(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-background-hover transition-colors ${theme === 'system' ? 'text-banana' : 'text-gray-700 dark:text-foreground-secondary'}`}
                    >
                      <Monitor size={14} />
                      <span>{t('settings.theme.system')}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* 主内容 */}
      <main className="relative max-w-5xl mx-auto px-3 md:px-4 py-8 md:py-12">
        {/* 创建卡片 */}
        <Card className="p-4 md:p-10 bg-white/90 dark:bg-background-secondary backdrop-blur-xl dark:backdrop-blur-none shadow-2xl dark:shadow-none border-0 dark:border dark:border-border-primary hover:shadow-3xl dark:hover:shadow-none transition-all duration-300 dark:rounded-2xl">
          {/* 选项卡 */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mb-6 md:mb-8">
            {(Object.keys(tabConfig) as CreationType[]).map((type) => {
              const config = tabConfig[type];
              return (
                <button
                  key={type}
                  onClick={() => setActiveTab(type)}
                  className={`flex-1 flex items-center justify-center gap-1.5 md:gap-2 px-3 md:px-6 py-2.5 md:py-3 rounded-lg dark:rounded-xl font-medium transition-all text-sm md:text-base touch-manipulation ${
                    activeTab === type
                      ? 'bg-gradient-to-r from-banana-500 to-banana-600 dark:from-banana dark:to-banana text-black shadow-yellow dark:shadow-lg dark:shadow-banana/20'
                      : 'bg-white dark:bg-background-elevated border border-gray-200 dark:border-border-primary text-gray-700 dark:text-foreground-secondary hover:bg-banana-50 dark:hover:bg-background-hover active:bg-banana-100'
                  }`}
                >
                  <span className="scale-90 md:scale-100">{config.icon}</span>
                  <span className="truncate">{config.label}</span>
                </button>
              );
            })}
          </div>

          {/* 描述 */}
          <div className="relative">
            <p className="text-sm md:text-base mb-4 md:mb-6 leading-relaxed">
              <span className="inline-flex items-center gap-2 text-gray-600 dark:text-foreground-tertiary">
                <Lightbulb size={16} className="text-banana-600 dark:text-banana flex-shrink-0" />
                <span className="font-semibold">
                  {tabConfig[activeTab].description}
                </span>
                {tabConfig[activeTab].example && (
                  <span className="relative group/tip inline-flex">
                    <HelpCircle size={15} className="text-gray-400 dark:text-foreground-tertiary hover:text-banana-600 dark:hover:text-banana cursor-help transition-colors" />
                    <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover/tip:block z-50 w-72 md:w-80 p-3 bg-white dark:bg-background-elevated border border-gray-200 dark:border-border-primary rounded-lg shadow-xl dark:shadow-none text-xs text-gray-700 dark:text-foreground-secondary whitespace-pre-line leading-relaxed">
                      {tabConfig[activeTab].example}
                      <span className="absolute left-1/2 -translate-x-1/2 top-full -mt-px w-2 h-2 bg-white dark:bg-background-elevated border-r border-b border-gray-200 dark:border-border-primary rotate-45" />
                    </span>
                  </span>
                )}
              </span>
            </p>
          </div>

          {/* 输入区 - 带工具栏 */}
          <div className="mb-2">
            {activeTab === 'ppt_renovation' ? (
              /* PPT 翻新：文件上传区 */
              <div className="space-y-4">
                <div
                  className="border-2 border-dashed border-gray-300 dark:border-border-primary rounded-xl p-8 text-center cursor-pointer hover:border-banana-400 dark:hover:border-banana transition-colors duration-200"
                  onClick={() => renovationFileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const file = e.dataTransfer.files[0];
                    if (file && (file.name.toLowerCase().endsWith('.pdf') || file.name.toLowerCase().endsWith('.pptx') || file.name.toLowerCase().endsWith('.ppt'))) {
                      setRenovationFile(file);
                      const ext = file.name.split('.').pop()?.toLowerCase();
                      if (ext === 'ppt' || ext === 'pptx') {
                        show({ message: `💡 ${t('home.messages.pptTip')}`, type: 'info' });
                      }
                    } else {
                      show({ message: t('home.renovation.onlyPdfPptx'), type: 'error' });
                    }
                  }}
                >
                  {renovationFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <FileText size={24} className="text-banana-600 dark:text-banana" />
                      <div className="text-left">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{renovationFile.name}</p>
                        <p className="text-xs text-gray-500 dark:text-foreground-tertiary">{(renovationFile.size / 1024 / 1024).toFixed(1)} MB</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setRenovationFile(null); }}
                        className="ml-2 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload size={32} className="mx-auto text-gray-400 dark:text-foreground-tertiary" />
                      <p className="text-sm text-gray-600 dark:text-foreground-secondary">{t('home.renovation.uploadHint')}</p>
                      <p className="text-xs text-gray-400 dark:text-foreground-tertiary">{t('home.renovation.formatHint')}</p>
                    </div>
                  )}
                </div>
                <input
                  ref={renovationFileInputRef}
                  type="file"
                  accept=".pdf,.pptx,.ppt"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setRenovationFile(file);
                      const ext = file.name.split('.').pop()?.toLowerCase();
                      if (ext === 'ppt' || ext === 'pptx') {
                        show({ message: `💡 ${t('home.messages.pptTip')}`, type: 'info' });
                      }
                    }
                    e.target.value = '';
                  }}
                  className="hidden"
                />

                {/* 保留布局 toggle */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <span className="text-sm text-gray-600 dark:text-foreground-tertiary group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                      {t('home.renovation.keepLayout')}
                    </span>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={keepLayout}
                        onChange={(e) => setKeepLayout(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 dark:bg-background-hover peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-banana-300 dark:peer-focus:ring-banana/30 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white dark:after:bg-foreground-secondary after:border-gray-300 dark:after:border-border-hover after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-banana"></div>
                    </div>
                  </label>
                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    loading={isSubmitting || isGlobalLoading}
                    disabled={!renovationFile}
                    className="shadow-sm dark:shadow-background-primary/30 text-xs md:text-sm px-3 md:px-4"
                  >
                    {t('common.next')}
                  </Button>
                </div>
              </div>
            ) : (
            <>
              {activeTab === 'description' && (
                <div className="mb-3 bg-white dark:bg-background-tertiary border-2 border-gray-200 dark:border-border-primary rounded-xl shadow-sm overflow-hidden">
                  <div className="px-4 py-2.5 flex items-center gap-2 border-b border-gray-100 dark:border-border-secondary">
                    <FileText size={14} className="text-banana-500 flex-shrink-0" />
                    <span className="text-xs font-medium text-gray-500 dark:text-foreground-tertiary">
                      {t('home.descriptionTools.sourceLabel')}
                    </span>
                    {sourceFile?.name && (
                      <span className="text-[11px] text-gray-400 dark:text-foreground-tertiary truncate max-w-[160px]">
                        {sourceFile.name}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setIsSourceCollapsed((prev) => !prev)}
                        className="text-xs text-gray-400 hover:text-gray-600 dark:text-foreground-tertiary dark:hover:text-foreground-secondary px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-background-hover transition-colors"
                      >
                        {isSourceCollapsed ? t('home.descriptionTools.expand') : t('home.descriptionTools.collapse')}
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Upload size={14} />}
                        onClick={() => sourceFileInputRef.current?.click()}
                        className="h-7 px-2 text-xs"
                      >
                        {t('home.descriptionTools.selectSourceFile')}
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        loading={isParsingSource}
                        onClick={handleParseSource}
                        className="h-7 px-2 text-xs"
                        disabled={isParsingSource || isReadingSource || (!sourceText.trim() && !sourceFile)}
                      >
                        {isParsingSource ? t('home.descriptionTools.parsingSource') : t('home.descriptionTools.parseSource')}
                      </Button>
                    </div>
                  </div>
                  {!isSourceCollapsed && (
                    <MarkdownTextarea
                      value={sourceText}
                      onChange={setSourceTextOptimized}
                      placeholder={t('home.descriptionTools.sourcePlaceholder')}
                      rows={6}
                      maxHeight={240}
                      showUploadButton={false}
                      className="text-sm md:text-base border-0 rounded-none shadow-none"
                    />
                  )}
                </div>
              )}
              <MarkdownTextarea
                ref={textareaRef}
                placeholder={tabConfig[activeTab].placeholder}
                value={content}
                onChange={setContentOptimized}
                onPaste={handlePaste}
                onFiles={handleImageFiles}
                rows={activeTab === 'idea' ? 4 : 8}
                maxHeight={360}
                collapsed={activeTab === 'description' && isContentCollapsed}
                className="text-sm md:text-base border-2 border-gray-200 dark:border-border-primary dark:bg-background-tertiary dark:text-white focus-within:border-banana-400 dark:focus-within:border-banana transition-colors duration-200"
                toolbarLeft={
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handlePaperclipClick}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:text-foreground-tertiary dark:hover:text-foreground-secondary dark:hover:bg-background-hover rounded transition-colors active:scale-95 touch-manipulation"
                      title={t('home.actions.selectFile')}
                    >
                      <Paperclip size={18} />
                    </button>
                    {/* 画面比例选择 */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsAspectRatioOpen(!isAspectRatioOpen)}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:text-foreground-tertiary dark:hover:text-foreground-secondary dark:hover:bg-background-hover rounded transition-colors"
                        title={i18n.language?.startsWith('zh') ? '画面比例' : 'Aspect Ratio'}
                      >
                        <span>{aspectRatio}</span>
                        <ChevronDown size={12} className={`transition-transform ${isAspectRatioOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isAspectRatioOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setIsAspectRatioOpen(false)} />
                          <div className="absolute left-0 bottom-full mb-1 z-50 bg-white dark:bg-background-elevated border border-gray-200 dark:border-border-primary rounded-lg shadow-lg dark:shadow-none py-1 min-w-[80px]">
                            {ASPECT_RATIO_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                onClick={() => { setAspectRatio(opt.value); setIsAspectRatioOpen(false); }}
                                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-background-hover transition-colors ${aspectRatio === opt.value ? 'text-banana font-semibold' : 'text-gray-700 dark:text-foreground-secondary'}`}
                              >
                                {opt.label}
                              </button>
                            ))}
                        </div>
                      </>
                    )}
                  </div>
                  {activeTab === 'description' && (
                    <button
                      type="button"
                      onClick={() => setIsContentCollapsed((prev) => !prev)}
                      className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:text-foreground-tertiary dark:hover:text-foreground-secondary dark:hover:bg-background-hover rounded transition-colors"
                    >
                      {isContentCollapsed ? t('home.descriptionTools.expand') : t('home.descriptionTools.collapse')}
                    </button>
                  )}
                </div>
              }
                toolbarRight={
                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    loading={isSubmitting || isGlobalLoading}
                    disabled={
                      !content.trim() ||
                      isUploadingImage ||
                      referenceFiles.some(f => f.parse_status === 'pending' || f.parse_status === 'parsing')
                    }
                    className="shadow-sm dark:shadow-background-primary/30 text-xs md:text-sm px-3 md:px-4"
                  >
                    {referenceFiles.some(f => f.parse_status === 'pending' || f.parse_status === 'parsing')
                      ? t('home.actions.parsing')
                      : t('common.next')}
                  </Button>
                }
              />
            </>
            )}
          </div>

          {/* 隐藏的文件输入 */}
          <input
            ref={sourceFileInputRef}
            type="file"
            accept=".docx,.txt,.md,.markdown"
            onChange={handleSourceFileChange}
            className="hidden"
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md"
            onChange={handleFileSelect}
            className="hidden"
          />

          <ReferenceFileList
            files={referenceFiles}
            onFileClick={setPreviewFileId}
            onFileDelete={handleFileRemove}
            onFileStatusChange={handleFileStatusChange}
            deleteMode="remove"
            className="mb-4"
            showToast={show}
          />

          {/* 模板选择 */}
          <div className="mb-6 md:mb-8 pt-4 border-t border-gray-100 dark:border-border-primary">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <div className="flex items-center gap-2">
                <Palette size={18} className="text-orange-600 dark:text-banana flex-shrink-0" />
                <h3 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white">
                  {t('home.template.title')}
                </h3>
              </div>
              {/* 无模板图模式开关 */}
              <label className="flex items-center gap-2 cursor-pointer group">
                <span className="text-sm text-gray-600 dark:text-foreground-tertiary group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                  {t('home.template.useTextStyle')}
                </span>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={useTemplateStyle}
                    onChange={(e) => {
                      setUseTemplateStyle(e.target.checked);
                      // 切换到无模板图模式时，清空模板选择
                      if (e.target.checked) {
                        setSelectedTemplate(null);
                        setSelectedTemplateId(null);
                        setSelectedPresetTemplateId(null);
                        setPendingStylePresetJson('');
                        setSelectedStylePresetId(null);
                      } else {
                        setStylePreviewProjectId(null);
                        setStylePreviewTaskId(null);
                        setStylePreviewTemplateJson('');
                      }
                      // 不再清空风格描述，允许用户保留已输入的内容
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 dark:bg-background-hover peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-banana-300 dark:peer-focus:ring-banana/30 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white dark:after:bg-foreground-secondary after:border-gray-300 dark:after:border-border-hover after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-banana"></div>
                </div>
              </label>
            </div>
            
            {/* 根据模式显示不同的内容 */}
            {useTemplateStyle ? (
              <>
                <TextStyleSelector
                  value={templateStyle}
                  onChange={setTemplateStyle}
                  onToast={show}
                  onGenerateStylePreviews={handleGenerateStylePreviews}
                />
                {stylePreviewProjectId && stylePreviewTaskId ? (
                  <StyleWorkflowPanel
                    projectId={stylePreviewProjectId}
                    taskId={stylePreviewTaskId}
                    templateJson={stylePreviewTemplateJson}
                    onTaskIdChange={(newTaskId) => setStylePreviewTaskId(newTaskId)}
                    onBackToProject={() => {
                      setStylePreviewProjectId(null);
                      setStylePreviewTaskId(null);
                      setStylePreviewTemplateJson('');
                    }}
                    backButtonText="关闭预览"
                  />
                ) : null}
              </>
            ) : (
              <TemplateSelector
                onSelect={handleTemplateSelect}
                onSelectStylePreset={handleSelectStylePreset}
                selectedTemplateId={selectedTemplateId}
                selectedPresetTemplateId={selectedPresetTemplateId}
                selectedStylePresetId={selectedStylePresetId}
                showUpload={true} // 在主页上传的模板保存到用户模板库
                projectId={currentProjectId}
              />
            )}
          </div>

        </Card>
      </main>
      <ToastContainer />
      {/* 素材生成模态 - 在主页始终生成全局素材 */}
      <MaterialGeneratorModal
        projectId={null}
        isOpen={isMaterialModalOpen}
        onClose={() => setIsMaterialModalOpen(false)}
      />
      {/* 素材中心模态 */}
      <MaterialCenterModal
        isOpen={isMaterialCenterOpen}
        onClose={() => setIsMaterialCenterOpen(false)}
      />
      {/* 参考文件选择器 */}
      {/* 在 Home 页面，始终查询全局文件，因为此时还没有项目 */}
      <ReferenceFileSelector
        projectId={null}
        isOpen={isFileSelectorOpen}
        onClose={() => setIsFileSelectorOpen(false)}
        onSelect={handleFilesSelected}
        multiple={true}
        initialSelectedIds={selectedFileIds}
      />
      
      <FilePreviewModal fileId={previewFileId} onClose={() => setPreviewFileId(null)} />
      {/* 帮助模态框 */}
      <HelpModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
      />
    </div>
  );
};
