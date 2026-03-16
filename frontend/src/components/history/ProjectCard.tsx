import React, { useState, useEffect } from 'react';
import { Clock, FileText, Trash2 } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { Card } from '@/components/shared';
import { getProjectTitle, getFirstPageImage, formatDate, getStatusText, getStatusColor } from '@/utils/projectUtils';
import type { Project } from '@/types';

// ProjectCard 组件自包含翻译
const projectCardI18n = {
  zh: {
    projectCard: { pages: "{{count}} 页", page: "第 {{num}} 页", outline: "大纲", detail: "细化" }
  },
  en: {
    projectCard: { pages: "{{count}} pages", page: "Page {{num}}", outline: "Outline", detail: "Detail" }
  }
};

export interface ProjectCardProps {
  project: Project;
  isSelected: boolean;
  isEditing: boolean;
  editingTitle: string;
  onPreview: (project: Project) => void;
  onOpenOutline: (e: React.MouseEvent, project: Project) => void;
  onOpenDetail: (e: React.MouseEvent, project: Project) => void;
  onToggleSelect: (projectId: string) => void;
  onDelete: (e: React.MouseEvent, project: Project) => void;
  onStartEdit: (e: React.MouseEvent, project: Project) => void;
  onTitleChange: (title: string) => void;
  onTitleKeyDown: (e: React.KeyboardEvent, projectId: string) => void;
  onSaveEdit: (projectId: string) => void;
  isBatchMode: boolean;
  viewMode?: 'list' | 'grid';
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  isSelected,
  isEditing,
  editingTitle,
  onPreview,
  onOpenOutline,
  onOpenDetail,
  onToggleSelect,
  onDelete,
  onStartEdit,
  onTitleChange,
  onTitleKeyDown,
  onSaveEdit,
  isBatchMode,
  viewMode = 'list',
}) => {
  const t = useT(projectCardI18n);
  const isGridView = viewMode === 'grid';
  // 检测屏幕尺寸，只在非手机端加载图片（必须在早期返回之前声明hooks）
  const [shouldLoadImage, setShouldLoadImage] = useState(false);
  
  useEffect(() => {
    const checkScreenSize = () => {
      // sm breakpoint is 640px
      setShouldLoadImage(isGridView || window.innerWidth >= 640);
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    
    return () => window.removeEventListener('resize', checkScreenSize);
  }, [isGridView]);

  const projectId = project.id || project.project_id;
  if (!projectId) return null;

  const title = getProjectTitle(project);
  const pageCount = project.pages?.length || 0;
  const statusText = getStatusText(project);
  const statusColor = getStatusColor(project);
  
  const firstPageImage = shouldLoadImage ? getFirstPageImage(project) : null;

  if (isGridView) {
    return (
      <Card
        className={`group h-full p-4 md:p-5 transition-all ${isSelected
          ? 'border-2 border-banana-500 bg-banana-50/70 dark:bg-background-secondary shadow-yellow'
          : 'border border-gray-200 dark:border-border-primary hover:shadow-lg hover:-translate-y-0.5'
          } ${isBatchMode ? 'cursor-default' : 'cursor-pointer'}`}
        onClick={() => onPreview(project)}
      >
        <div className="flex h-full flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="pt-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelect(projectId)}
                className="w-4 h-4 text-banana-600 border-gray-300 dark:border-border-primary rounded focus:ring-banana-500 cursor-pointer"
              />
            </div>
            <div className="min-w-0 flex-1">
              <span className={`inline-flex px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${statusColor}`}>
                {statusText}
              </span>
            </div>
            <button
              onClick={(e) => onDelete(e, project)}
              className="p-2 -m-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title={t('common.delete')}
            >
              <Trash2 size={16} />
            </button>
          </div>

          <div className="aspect-[16/9] w-full rounded-2xl overflow-hidden bg-gray-100 dark:bg-background-primary border border-gray-200 dark:border-border-primary">
            {firstPageImage ? (
              <img
                src={firstPageImage}
                alt={t('projectCard.page', { num: 1 })}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                <FileText size={28} />
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0">
            {isEditing ? (
              <input
                type="text"
                value={editingTitle}
                onChange={(e) => onTitleChange(e.target.value)}
                onKeyDown={(e) => onTitleKeyDown(e, projectId)}
                onBlur={() => onSaveEdit(projectId)}
                autoFocus
                className="w-full text-base font-semibold text-gray-900 dark:text-foreground-primary px-2.5 py-2 border border-banana-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-banana-500"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <h3
                className={`text-base md:text-lg font-semibold text-gray-900 dark:text-foreground-primary line-clamp-2 min-h-[3.5rem] ${isBatchMode
                  ? 'cursor-default'
                  : 'cursor-pointer hover:text-banana-600 transition-colors'
                  }`}
                onClick={(e) => onStartEdit(e, project)}
                title={isBatchMode ? undefined : t('common.edit')}
              >
                {title}
              </h3>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs md:text-sm text-gray-500 dark:text-foreground-tertiary">
              <span className="flex items-center gap-1">
                <FileText size={14} />
                {t('projectCard.pages', { count: pageCount })}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={14} />
                {formatDate(project.updated_at || project.created_at)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={(e) => onOpenOutline(e, project)}
              disabled={isBatchMode || isEditing}
              className={`h-10 px-3 text-sm font-medium rounded-xl border border-gray-200 dark:border-border-primary text-gray-700 dark:text-foreground-secondary transition-colors ${isBatchMode || isEditing
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:bg-banana-50 dark:hover:bg-background-hover'
                }`}
              title={t('projectCard.outline')}
            >
              {t('projectCard.outline')}
            </button>
            <button
              type="button"
              onClick={(e) => onOpenDetail(e, project)}
              disabled={isBatchMode || isEditing}
              className={`h-10 px-3 text-sm font-medium rounded-xl border border-gray-200 dark:border-border-primary text-gray-700 dark:text-foreground-secondary transition-colors ${isBatchMode || isEditing
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:bg-banana-50 dark:hover:bg-background-hover'
                }`}
              title={t('projectCard.detail')}
            >
              {t('projectCard.detail')}
            </button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      className={`p-3 md:p-6 transition-all ${
        isSelected 
          ? 'border-2 border-banana-500 bg-banana-50 dark:bg-background-secondary' 
          : 'hover:shadow-lg border border-gray-200 dark:border-border-primary'
      } ${isBatchMode ? 'cursor-default' : 'cursor-pointer'}`}
      onClick={() => onPreview(project)}
    >
      <div className="flex items-start gap-3 md:gap-4">
        {/* 复选框 */}
        <div className="pt-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(projectId)}
            className="w-4 h-4 text-banana-600 border-gray-300 dark:border-border-primary rounded focus:ring-banana-500 cursor-pointer"
          />
        </div>
        
        {/* 中间：项目信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 md:gap-3 mb-2 flex-wrap">
            {isEditing ? (
              <input
                type="text"
                value={editingTitle}
                onChange={(e) => onTitleChange(e.target.value)}
                onKeyDown={(e) => onTitleKeyDown(e, projectId)}
                onBlur={() => onSaveEdit(projectId)}
                autoFocus
                className="text-base md:text-lg font-semibold text-gray-900 dark:text-foreground-primary px-2 py-1 border border-banana-500 rounded focus:outline-none focus:ring-2 focus:ring-banana-500 flex-1 min-w-0"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <h3 
                className={`text-base md:text-lg font-semibold text-gray-900 dark:text-foreground-primary truncate flex-1 min-w-0 ${
                  isBatchMode 
                    ? 'cursor-default' 
                    : 'cursor-pointer hover:text-banana-600 transition-colors'
                }`}
                onClick={(e) => onStartEdit(e, project)}
                title={isBatchMode ? undefined : t('common.edit')}
              >
                {title}
              </h3>
            )}
            <span className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap flex-shrink-0 ${statusColor}`}>
              {statusText}
            </span>
          </div>
          <div className="flex items-center gap-3 md:gap-4 text-xs md:text-sm text-gray-500 dark:text-foreground-tertiary flex-wrap">
            <span className="flex items-center gap-1">
              <FileText size={14} />
              {t('projectCard.pages', { count: pageCount })}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={14} />
              {formatDate(project.updated_at || project.created_at)}
            </span>
          </div>
        </div>
        
        {/* 右侧：图片预览 */}
        <div className="hidden sm:block w-40 h-24 md:w-64 md:h-36 rounded-lg overflow-hidden bg-gray-100 dark:bg-background-secondary border border-gray-200 dark:border-border-primary flex-shrink-0">
          {firstPageImage ? (
            <img
              src={firstPageImage}
              alt={t('projectCard.page', { num: 1 })}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <FileText size={20} className="md:w-6 md:h-6" />
            </div>
          )}
        </div>
        
        {/* 右侧：操作按钮 */}
        <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={(e) => onOpenOutline(e, project)}
            disabled={isBatchMode || isEditing}
            className={`px-2.5 py-1.5 text-xs md:text-sm font-medium rounded-md border border-gray-200 dark:border-border-primary text-gray-700 dark:text-foreground-secondary transition-colors ${
              isBatchMode || isEditing
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:bg-banana-50 dark:hover:bg-background-hover'
            }`}
            title={t('projectCard.outline')}
          >
            {t('projectCard.outline')}
          </button>
          <button
            type="button"
            onClick={(e) => onOpenDetail(e, project)}
            disabled={isBatchMode || isEditing}
            className={`px-2.5 py-1.5 text-xs md:text-sm font-medium rounded-md border border-gray-200 dark:border-border-primary text-gray-700 dark:text-foreground-secondary transition-colors ${
              isBatchMode || isEditing
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:bg-banana-50 dark:hover:bg-background-hover'
            }`}
            title={t('projectCard.detail')}
          >
            {t('projectCard.detail')}
          </button>
          <button
            onClick={(e) => onDelete(e, project)}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title={t('common.delete')}
          >
            <Trash2 size={16} className="md:w-[18px] md:h-[18px]" />
          </button>
        </div>
      </div>
    </Card>
  );
};
