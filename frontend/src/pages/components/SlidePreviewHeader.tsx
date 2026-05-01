import React from 'react';
import { ArrowLeft, Download, FileText, Home, ImagePlus, LayoutGrid, Loader2, RefreshCw, Settings, Sparkles, Video } from 'lucide-react';
import { Button, ExportTasksPanel } from '@/components/shared';

type ExportTaskLite = {
  projectId?: string;
  status?: string;
};

type SlidePreviewHeaderProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  navigate: (to: string) => void;
  fromHistory: boolean;
  projectId?: string;
  isRefreshing: boolean;
  handleRefresh: () => void;
  setIsGlobalAiDrawerOpen: (value: boolean) => void;
  setIsProjectSettingsOpen: (value: boolean) => void;
  openTemplateModal: () => void;
  setIsMaterialModalOpen: (value: boolean) => void;
  exportTasks: ExportTaskLite[];
  exportTasksPanelRef: React.RefObject<HTMLDivElement | null>;
  showExportTasksPanel: boolean;
  setShowExportTasksPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setShowExportMenu: React.Dispatch<React.SetStateAction<boolean>>;
  currentProjectPages: unknown[];
  exportMenuRef: React.RefObject<HTMLDivElement | null>;
  isExporting: boolean;
  isMultiSelectMode: boolean;
  selectedPageCount: number;
  hasAllImages: boolean;
  missingImageCount: number;
  showExportMenu: boolean;
  handleExport: (type: 'pptx' | 'pdf' | 'editable-pptx' | 'images') => void;
  openVideoExportDialog: () => void;
};

// Renders the preview toolbar and export menu for the slide preview page.
export const SlidePreviewHeader: React.FC<SlidePreviewHeaderProps> = ({
  t,
  navigate,
  fromHistory,
  projectId,
  isRefreshing,
  handleRefresh,
  setIsGlobalAiDrawerOpen,
  setIsProjectSettingsOpen,
  openTemplateModal,
  setIsMaterialModalOpen,
  exportTasks,
  exportTasksPanelRef,
  showExportTasksPanel,
  setShowExportTasksPanel,
  setShowExportMenu,
  currentProjectPages,
  exportMenuRef,
  isExporting,
  isMultiSelectMode,
  selectedPageCount,
  hasAllImages,
  missingImageCount,
  showExportMenu,
  handleExport,
  openVideoExportDialog,
}) => {
  const projectTasks = exportTasks.filter((task) => task.projectId === projectId);
  const activeProjectTaskCount = exportTasks.filter(
    (task) =>
      task.projectId === projectId &&
      (task.status === 'PROCESSING' || task.status === 'RUNNING' || task.status === 'PENDING')
  ).length;

  return (
    <header className="h-14 md:h-16 bg-white dark:bg-background-secondary shadow-sm dark:shadow-background-primary/30 border-b border-gray-200 dark:border-border-primary flex items-center justify-between px-3 md:px-6 flex-shrink-0">
      <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
        <Button
          variant="ghost"
          size="sm"
          icon={<Home size={16} className="md:w-[18px] md:h-[18px]" />}
          onClick={() => navigate('/')}
          className="hidden sm:inline-flex flex-shrink-0"
        >
          <span className="hidden md:inline">{t('nav.home')}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowLeft size={16} className="md:w-[18px] md:h-[18px]" />}
          onClick={() => {
            if (fromHistory) {
              navigate('/history');
            } else {
              navigate(`/project/${projectId}/outline`);
            }
          }}
          className="flex-shrink-0"
        >
          <span className="hidden sm:inline">{t('common.back')}</span>
        </Button>
        <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
          <span className="text-xl md:text-2xl">🍌</span>
          <span className="text-base md:text-xl font-bold truncate">{t('home.title')}</span>
        </div>
        <span className="text-gray-400 hidden md:inline">|</span>
        <span className="text-sm md:text-lg font-semibold truncate hidden sm:inline">{t('preview.title')}</span>
      </div>
      <div className="flex items-center gap-1 md:gap-3 flex-shrink-0">
        <button
          type="button"
          onClick={() => setIsGlobalAiDrawerOpen(true)}
          title={t('preview.globalAiOpen')}
          aria-label={t('preview.globalAiOpen')}
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#ecd67c] bg-[#fff5cf] text-[#8a6200] shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#ffefb5] focus:outline-none focus:ring-2 focus:ring-banana-500 focus:ring-offset-2 dark:border-banana-700/50 dark:bg-banana-500/10 dark:text-banana"
        >
          <Sparkles size={18} />
        </button>
        <Button
          variant="ghost"
          size="sm"
          icon={<Settings size={16} className="md:w-[18px] md:h-[18px]" />}
          onClick={() => setIsProjectSettingsOpen(true)}
          className="hidden lg:inline-flex"
        >
          <span className="hidden xl:inline">{t('preview.projectSettings')}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<LayoutGrid size={16} className="md:w-[18px] md:h-[18px]" />}
          onClick={openTemplateModal}
          className="hidden lg:inline-flex"
        >
          <span className="hidden xl:inline">{t('preview.changeTemplate')}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<ImagePlus size={16} className="md:w-[18px] md:h-[18px]" />}
          onClick={() => setIsMaterialModalOpen(true)}
          className="hidden lg:inline-flex"
        >
          <span className="hidden xl:inline">{t('nav.materialGenerate')}</span>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<ArrowLeft size={16} className="md:w-[18px] md:h-[18px]" />}
          onClick={() => navigate(`/project/${projectId}/outline`)}
          className="hidden sm:inline-flex"
        >
          <span className="hidden md:inline">{t('common.previous')}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw size={16} className={`md:w-[18px] md:h-[18px] ${isRefreshing ? 'animate-spin' : ''}`} />}
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="hidden md:inline-flex"
        >
          <span className="hidden lg:inline">{t('preview.refresh')}</span>
        </Button>
        {projectTasks.length > 0 && (
          <div className="relative" ref={exportTasksPanelRef}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowExportTasksPanel(!showExportTasksPanel);
                setShowExportMenu(false);
              }}
              className="relative"
            >
              {activeProjectTaskCount > 0 ? (
                <Loader2 size={16} className="animate-spin text-banana-500" />
              ) : (
                <FileText size={16} />
              )}
              <span className="ml-1 text-xs">{projectTasks.length}</span>
            </Button>
            {showExportTasksPanel && (
              <div className="absolute right-0 mt-2 z-20">
                <ExportTasksPanel
                  projectId={projectId}
                  pages={currentProjectPages}
                  className="w-96 max-h-[28rem] shadow-lg"
                />
              </div>
            )}
          </div>
        )}

        <div className="relative" ref={exportMenuRef}>
          <Button
            variant="primary"
            size="sm"
            icon={isExporting ? <Loader2 size={16} className="md:w-[18px] md:h-[18px] animate-spin text-banana-500" /> : <Download size={16} className="md:w-[18px] md:h-[18px]" />}
            onClick={() => {
              setShowExportMenu(!showExportMenu);
              setShowExportTasksPanel(false);
            }}
            disabled={isMultiSelectMode ? selectedPageCount === 0 : !hasAllImages}
            title={!isMultiSelectMode && !hasAllImages ? t('preview.disabledExportTip', { count: missingImageCount }) : undefined}
            className="text-xs md:text-sm"
          >
            <span className="hidden sm:inline">
              {isMultiSelectMode && selectedPageCount > 0
                ? `${t('preview.export')} (${selectedPageCount})`
                : t('preview.export')}
            </span>
            <span className="sm:hidden">
              {isMultiSelectMode && selectedPageCount > 0
                ? `(${selectedPageCount})`
                : t('preview.export')}
            </span>
          </Button>
          {showExportMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-background-secondary rounded-lg shadow-lg border border-gray-200 dark:border-border-primary py-2 z-10">
              {isMultiSelectMode && selectedPageCount > 0 && (
                <div className="px-4 py-2 text-xs text-gray-500 dark:text-foreground-tertiary border-b border-gray-100 dark:border-border-primary">
                  {t('preview.exportSelectedPages', { count: selectedPageCount })}
                </div>
              )}
              <button onClick={() => handleExport('pptx')} className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-background-hover transition-colors text-sm">
                {t('preview.exportPptx')}
              </button>
              <button onClick={() => handleExport('editable-pptx')} className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-background-hover transition-colors text-sm">
                {t('preview.exportEditablePptx')}
              </button>
              <button onClick={() => handleExport('pdf')} className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-background-hover transition-colors text-sm">
                {t('preview.exportPdf')}
              </button>
              <button onClick={() => handleExport('images')} className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-background-hover transition-colors text-sm">
                {t('preview.exportImages')}
              </button>
              <button
                onClick={() => {
                  setShowExportMenu(false);
                  openVideoExportDialog();
                }}
                className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-background-hover transition-colors text-sm flex items-center gap-2"
              >
                <Video size={14} />
                {t('preview.exportVideo')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
