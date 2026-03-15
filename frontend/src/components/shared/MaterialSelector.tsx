import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImageIcon, RefreshCw, Upload, Sparkles, Trash2 } from 'lucide-react';
import { Button, useToast, Modal } from '@/components/shared';
import { useT } from '@/hooks/useT';
import { listMaterials, uploadMaterial, listProjects, deleteMaterial, type Material } from '@/api/endpoints';
import type { Project } from '@/types';
import { getImageUrl } from '@/api/client';
import { MaterialGeneratorModal } from './MaterialGeneratorModal';

const INITIAL_BATCH = 24;
const BATCH_SIZE = 24;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml'];

const materialSelectorI18n = {
  zh: {
    material: {
      selectTitle: '选择素材',
      totalMaterials: '共 {{count}} 个素材',
      noMaterials: '暂无素材',
      selectedCount: '已选择 {{count}} 个',
      allMaterials: '所有素材',
      unassociated: '未关联项目',
      currentProject: '当前项目',
      viewMoreProjects: '+ 查看更多项目...',
      uploadFile: '上传文件',
      previewMaterial: '预览素材',
      deleteMaterial: '删除素材',
      closePreview: '关闭预览',
      canUploadOrGenerate: '可以上传图片或通过素材生成功能创建素材',
      canUploadImages: '可以上传图片作为素材',
      selectOnlyHint: '这里只展示已有素材；如需上传或生成，请前往素材管理后回来刷新',
      generateMaterial: '生成素材',
      searchPlaceholder: '搜索素材名称',
      saveAsTemplate: '选择后同时保存到我的模版库',
      messages: {
        loadMaterialFailed: '加载素材失败',
        unsupportedFormat: '不支持的图片格式',
        uploadSuccess: '素材上传成功',
        uploadFailed: '上传素材失败',
        cannotDelete: '无法删除：缺少素材ID',
        deleteSuccess: '素材已删除',
        deleteFailed: '删除素材失败',
        selectAtLeastOne: '请至少选择一个素材',
        maxSelection: '最多只能选择 {{count}} 个素材',
      }
    }
  },
  en: {
    material: {
      selectTitle: 'Select Material',
      totalMaterials: '{{count}} materials',
      noMaterials: 'No materials',
      selectedCount: '{{count}} selected',
      allMaterials: 'All Materials',
      unassociated: 'Unassociated',
      currentProject: 'Current Project',
      viewMoreProjects: '+ View more projects...',
      uploadFile: 'Upload File',
      previewMaterial: 'Preview Material',
      deleteMaterial: 'Delete Material',
      closePreview: 'Close Preview',
      canUploadOrGenerate: 'You can upload images or create materials through the material generator',
      canUploadImages: 'You can upload images as materials',
      selectOnlyHint: 'This panel only shows existing materials. Upload or generate in Material Management, then come back and refresh.',
      generateMaterial: 'Generate Material',
      searchPlaceholder: 'Search materials',
      saveAsTemplate: 'Also save selection to my template library',
      messages: {
        loadMaterialFailed: 'Failed to load materials',
        unsupportedFormat: 'Unsupported image format',
        uploadSuccess: 'Material uploaded successfully',
        uploadFailed: 'Failed to upload material',
        cannotDelete: 'Cannot delete: Missing material ID',
        deleteSuccess: 'Material deleted',
        deleteFailed: 'Failed to delete material',
        selectAtLeastOne: 'Please select at least one material',
        maxSelection: 'Maximum {{count}} materials can be selected',
      }
    }
  }
};

interface MaterialSelectorProps {
  projectId?: string;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (materials: Material[], saveAsTemplate?: boolean) => void;
  multiple?: boolean;
  maxSelection?: number;
  showSaveAsTemplateOption?: boolean;
}

export interface MaterialLibraryPanelProps {
  projectId?: string;
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  onSelectedMaterialsChange?: (materials: Material[]) => void;
  multiple?: boolean;
  maxSelection?: number;
  showUpload?: boolean;
  showGenerate?: boolean;
  showDelete?: boolean;
  showSelectionSummary?: boolean;
  emptyHintMode?: 'default' | 'select-only';
  footerContent?: React.ReactNode;
  className?: string;
}

const getMaterialKey = (material: Material): string => material.id;
const getMaterialDisplayName = (material: Material) =>
  (material.prompt && material.prompt.trim()) ||
  (material.name && material.name.trim()) ||
  (material.original_filename && material.original_filename.trim()) ||
  (material.source_filename && material.source_filename.trim()) ||
  material.filename ||
  material.url;

const renderProjectLabel = (project: Project) => {
  const text = project.idea_prompt || project.outline_text || `Project ${project.project_id.slice(0, 8)}`;
  return text.length > 20 ? `${text.slice(0, 20)}…` : text;
};

export const MaterialLibraryPanel: React.FC<MaterialLibraryPanelProps> = ({
  projectId,
  selectedIds,
  onSelectedIdsChange,
  onSelectedMaterialsChange,
  multiple = false,
  maxSelection,
  showUpload = true,
  showGenerate = true,
  showDelete = true,
  showSelectionSummary = true,
  emptyHintMode = 'default',
  footerContent,
  className,
}) => {
  const t = useT(materialSelectorI18n);
  const { show } = useToast();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [filterProjectId, setFilterProjectId] = useState<string>('all');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(INITIAL_BATCH);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const response = await listProjects(100, 0);
      if (response.data?.projects) {
        setProjects(response.data.projects);
        setProjectsLoaded(true);
      }
    } catch (error: any) {
      console.error('Failed to load projects:', error);
    }
  }, []);

  const loadMaterials = useCallback(async () => {
    setIsLoading(true);
    try {
      const targetProjectId = filterProjectId === 'all' ? 'all' : filterProjectId === 'none' ? 'none' : filterProjectId;
      const response = await listMaterials(targetProjectId);
      if (response.data?.materials) {
        setMaterials(response.data.materials);
      } else {
        setMaterials([]);
      }
    } catch (error: any) {
      console.error('Failed to load materials:', error);
      show({
        message: error?.response?.data?.error?.message || error.message || t('material.messages.loadMaterialFailed'),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [filterProjectId, show]);

  useEffect(() => {
    if (!projectsLoaded) {
      void loadProjects();
    }
    void loadMaterials();
    setShowAllProjects(false);
  }, [loadMaterials, loadProjects, projectsLoaded]);

  const filteredMaterials = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) return materials;
    return materials.filter((material) =>
      getMaterialDisplayName(material).toLowerCase().includes(keyword)
    );
  }, [materials, searchQuery]);

  const visibleMaterials = useMemo(
    () => filteredMaterials.slice(0, visibleCount),
    [filteredMaterials, visibleCount]
  );

  useEffect(() => {
    setVisibleCount(INITIAL_BATCH);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [filterProjectId, searchQuery, materials.length]);

  useEffect(() => {
    const selectedMaterials = materials.filter((material) => selectedIds.has(getMaterialKey(material)));
    onSelectedMaterialsChange?.(selectedMaterials);
  }, [materials, onSelectedMaterialsChange, selectedIds]);

  const handleScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (remaining < 180 && visibleCount < filteredMaterials.length) {
      setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, filteredMaterials.length));
    }
  };

  const handleSelectMaterial = (material: Material) => {
    const key = getMaterialKey(material);
    if (multiple) {
      const next = new Set(selectedIds);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (maxSelection && next.size >= maxSelection) {
          show({ message: t('material.messages.maxSelection', { count: maxSelection }), type: 'info' });
          return;
        }
        next.add(key);
      }
      onSelectedIdsChange(next);
      return;
    }
    onSelectedIdsChange(new Set([key]));
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      show({ message: t('material.messages.unsupportedFormat'), type: 'error' });
      e.target.value = '';
      return;
    }

    setIsUploading(true);
    try {
      const targetProjectId = (filterProjectId === 'all' || filterProjectId === 'none') ? null : filterProjectId;
      await uploadMaterial(file, targetProjectId);
      show({ message: t('material.messages.uploadSuccess'), type: 'success' });
      await loadMaterials();
    } catch (error: any) {
      console.error('Failed to upload material:', error);
      show({
        message: error?.response?.data?.error?.message || error.message || t('material.messages.uploadFailed'),
        type: 'error',
      });
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteMaterial = async (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
    material: Material
  ) => {
    e.stopPropagation();
    const materialId = material.id;
    const key = getMaterialKey(material);

    if (!materialId) {
      show({ message: t('material.messages.cannotDelete'), type: 'error' });
      return;
    }

    setDeletingIds((prev) => {
      const next = new Set(prev);
      next.add(materialId);
      return next;
    });

    try {
      await deleteMaterial(materialId);
      setMaterials((prev) => prev.filter((item) => getMaterialKey(item) !== key));
      const next = new Set(selectedIds);
      next.delete(key);
      onSelectedIdsChange(next);
      show({ message: t('material.messages.deleteSuccess'), type: 'success' });
    } catch (error: any) {
      console.error('Failed to delete material:', error);
      show({
        message: error?.response?.data?.error?.message || error.message || t('material.messages.deleteFailed'),
        type: 'error',
      });
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(materialId);
        return next;
      });
    }
  };

  return (
    <>
      <div className={className || 'space-y-4'}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-foreground-tertiary">
            <span>{materials.length > 0 ? t('material.totalMaterials', { count: filteredMaterials.length }) : t('material.noMaterials')}</span>
            {showSelectionSummary && selectedIds.size > 0 && (
              <span className="ml-2 text-banana-600">
                {t('material.selectedCount', { count: selectedIds.size })}
              </span>
            )}
            {isLoading && materials.length > 0 && (
              <RefreshCw size={14} className="animate-spin text-gray-400" />
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={filterProjectId}
              onChange={(e) => {
                const value = e.target.value;
                if (value === 'show_more') {
                  setShowAllProjects(true);
                  return;
                }
                setFilterProjectId(value);
              }}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-border-primary rounded-md bg-white dark:bg-background-secondary focus:outline-none focus:ring-2 focus:ring-banana-500 w-40 sm:w-48 max-w-[200px] truncate"
            >
              <option value="all">{t('material.allMaterials')}</option>
              <option value="none">{t('material.unassociated')}</option>
              {projectId && (
                <option value={projectId}>
                  {t('material.currentProject')}{projects.find((project) => project.project_id === projectId) ? `: ${renderProjectLabel(projects.find((project) => project.project_id === projectId)!)}` : ''}
                </option>
              )}
              {showAllProjects ? (
                <>
                  <option disabled>───────────</option>
                  {projects.filter((project) => project.project_id !== projectId).map((project) => (
                    <option key={project.project_id} value={project.project_id} title={project.idea_prompt || project.outline_text}>
                      {renderProjectLabel(project)}
                    </option>
                  ))}
                </>
              ) : (
                projects.length > (projectId ? 1 : 0) && (
                  <option value="show_more">{t('material.viewMoreProjects')}</option>
                )
              )}
            </select>

            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('material.searchPlaceholder')}
              className="w-40 sm:w-48 px-3 py-1.5 text-sm border border-gray-300 dark:border-border-primary rounded-md bg-white dark:bg-background-secondary focus:outline-none focus:ring-2 focus:ring-banana-500"
            />

            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw size={16} />}
              onClick={() => void loadMaterials()}
              disabled={isLoading}
            >
              {t('common.refresh')}
            </Button>

            {showUpload && (
              <label className="inline-block cursor-pointer">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-foreground-secondary bg-white dark:bg-background-secondary border border-gray-300 dark:border-border-primary rounded-md hover:bg-gray-50 dark:hover:bg-background-hover disabled:opacity-50 disabled:cursor-not-allowed">
                  <Upload size={16} />
                  <span>{isUploading ? t('common.uploading') : t('common.upload')}</span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleUpload}
                  className="hidden"
                  disabled={isUploading}
                />
              </label>
            )}

            {projectId && showGenerate && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Sparkles size={16} />}
                onClick={() => setIsGeneratorOpen(true)}
              >
                {t('material.generateMaterial')}
              </Button>
            )}

            {showSelectionSummary && selectedIds.size > 0 && (
              <Button variant="ghost" size="sm" onClick={() => onSelectedIdsChange(new Set())}>
                {t('common.clearSelection')}
              </Button>
            )}
          </div>
        </div>

        {isLoading && materials.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-400">{t('common.loading')}</div>
          </div>
        ) : filteredMaterials.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 p-4 border border-dashed border-gray-200 dark:border-border-primary rounded-2xl bg-gray-50/70 dark:bg-background-tertiary/30">
            <ImageIcon size={48} className="mb-4 opacity-50" />
            <div className="text-sm">{t('material.noMaterials')}</div>
            <div className="text-xs mt-1 text-center max-w-md">
              {emptyHintMode === 'select-only'
                ? t('material.selectOnlyHint')
                : (projectId ? t('material.canUploadOrGenerate') : t('material.canUploadImages'))}
            </div>
          </div>
        ) : (
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="grid grid-cols-2 lg:grid-cols-3 gap-4 max-h-[52vh] overflow-y-auto p-1 pr-2"
          >
            {visibleMaterials.map((material) => {
              const key = getMaterialKey(material);
              const isSelected = selectedIds.has(key);
              const isDeleting = deletingIds.has(material.id);
              return (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectMaterial(material)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectMaterial(material);
                    }
                  }}
                  className={`group relative text-left aspect-video rounded-2xl border-2 overflow-hidden transition-all cursor-pointer ${
                    isSelected
                      ? 'border-banana-500 ring-2 ring-banana-200 shadow-lg shadow-banana-100/60'
                      : 'border-gray-200 dark:border-border-primary hover:border-banana-300 hover:-translate-y-0.5'
                  }`}
                  data-testid={`material-card-${key}`}
                >
                  <img
                    src={getImageUrl(material.url)}
                    alt={getMaterialDisplayName(material)}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  {showDelete && (
                    <button
                      type="button"
                      onClick={(e) => void handleDeleteMaterial(e, material)}
                      disabled={isDeleting}
                      className="absolute top-2 right-2 w-8 h-8 bg-black/55 backdrop-blur-sm text-white rounded-full flex items-center justify-center opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 shadow-md z-10 hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:opacity-60 disabled:cursor-not-allowed"
                      aria-label={t('material.deleteMaterial')}
                    >
                      {isDeleting ? <RefreshCw size={15} className="animate-spin" /> : <Trash2 size={15} />}
                    </button>
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <div className="text-sm font-medium text-white line-clamp-2">
                      {getMaterialDisplayName(material)}
                    </div>
                  </div>
                  {isSelected && (
                    <div className="absolute top-3 left-3 rounded-full bg-banana-500 text-black text-xs font-semibold px-2 py-1">
                      {multiple ? '已选中' : '当前选择'}
                    </div>
                  )}
                </div>
              );
            })}
            {visibleCount < filteredMaterials.length && (
              <div className="col-span-full flex items-center justify-center py-2 text-xs text-gray-500 dark:text-foreground-tertiary">
                {t('common.loading')}…
              </div>
            )}
          </div>
        )}

        {footerContent ? (
          <div className="pt-4 border-t border-gray-200 dark:border-border-primary">
            {footerContent}
          </div>
        ) : null}
      </div>

      {projectId && showGenerate && (
        <MaterialGeneratorModal
          projectId={projectId}
          isOpen={isGeneratorOpen}
          onClose={() => {
            setIsGeneratorOpen(false);
            void loadMaterials();
          }}
        />
      )}
    </>
  );
};

export const MaterialSelector: React.FC<MaterialSelectorProps> = ({
  projectId,
  isOpen,
  onClose,
  onSelect,
  multiple = false,
  maxSelection,
  showSaveAsTemplateOption = false,
}) => {
  const t = useT(materialSelectorI18n);
  const { show } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedMaterials, setSelectedMaterials] = useState<Material[]>([]);
  const [saveAsTemplate, setSaveAsTemplate] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedIds(new Set());
    setSelectedMaterials([]);
  }, [isOpen]);

  const handleConfirm = () => {
    if (selectedMaterials.length === 0) {
      show({ message: t('material.messages.selectAtLeastOne'), type: 'info' });
      return;
    }
    onSelect(selectedMaterials, showSaveAsTemplateOption ? saveAsTemplate : undefined);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('material.selectTitle')} size="lg">
      <MaterialLibraryPanel
        projectId={projectId}
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
        onSelectedMaterialsChange={setSelectedMaterials}
        multiple={multiple}
        maxSelection={maxSelection}
        showUpload={true}
        showGenerate={true}
        showDelete={true}
        showSelectionSummary={true}
        emptyHintMode="default"
        footerContent={
          <>
            {showSaveAsTemplateOption && (
              <div className="mb-3 p-3 bg-gray-50 dark:bg-background-primary rounded-lg border border-gray-200 dark:border-border-primary">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveAsTemplate}
                    onChange={(e) => setSaveAsTemplate(e.target.checked)}
                    className="w-4 h-4 text-banana-500 border-gray-300 dark:border-border-primary rounded focus:ring-banana-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-foreground-secondary">
                    {t('material.saveAsTemplate')}
                  </span>
                </label>
              </div>
            )}
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirm}
                disabled={selectedMaterials.length === 0}
              >
                {t('common.confirm')} ({selectedMaterials.length})
              </Button>
            </div>
          </>
        }
      />
    </Modal>
  );
};

export const materialUrlToFile = async (
  material: Material,
  filename?: string
): Promise<File> => {
  const imageUrl = getImageUrl(material.url);
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  return new File(
    [blob],
    filename || material.filename,
    { type: blob.type || 'image/png' }
  );
};
