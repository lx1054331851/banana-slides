import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LayoutTemplate, PanelRight, Play } from 'lucide-react';
import { Button } from '@/components/shared';
import { PagePropertiesDrawer, readStoredDrawerWidth } from '@/components/preview/PagePropertiesDrawer';
import { SlidePlayer } from '@/components/preview/SlidePlayer';
import { useProjectStore } from '@/store/useProjectStore';
import type { Project } from '@/types';

interface SlidePreviewUpstreamPanelsProps {
  project: Project;
  selectedIndex: number;
  versionCount: number;
  extraFieldNames: string[];
  imagePromptFields: string[];
  onSelectIndex: (index: number) => void;
  showToast: (props: { message: string; type: 'success' | 'error' | 'info' | 'warning' }) => void;
}

/** Connect upstream template, property and player features to the custom preview editor. */
export const SlidePreviewUpstreamPanels: React.FC<SlidePreviewUpstreamPanelsProps> = ({
  project, selectedIndex, versionCount, extraFieldNames, imagePromptFields, onSelectIndex, showToast,
}) => {
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(readStoredDrawerWidth);
  const { templateAssets, loadTemplateAssets, updatePageLocal, updatePageTemplate, uploadTemplateAsset, isSavingPages } = useProjectStore();
  const page = project.pages[selectedIndex];

  useEffect(() => {
    void loadTemplateAssets(project.id!).catch((error) => {
      showToast({ message: error?.message || '读取模板失败', type: 'error' });
    });
  }, [project.id!, loadTemplateAssets]);

  const openTemplateSetup = () => navigate(`/project/${project.id!}/template-setup`);
  return (
    <>
      <div className="flex flex-wrap justify-end gap-2 py-2">
        <Button size="sm" variant="ghost" icon={<ArrowLeft size={15} />}
          onClick={() => navigate(`/project/${project.id!}/detail`)}>上一步</Button>
        <Button size="sm" variant="secondary" icon={<LayoutTemplate size={15} />}
          onClick={openTemplateSetup}>每页模板配置</Button>
        <Button size="sm" variant="secondary" icon={<PanelRight size={15} />}
          onClick={() => setDrawerOpen((open) => !open)}>页面属性</Button>
        <Button size="sm" variant="secondary" icon={<Play size={15} />}
          onClick={() => setPlayerOpen(true)}>播放</Button>
      </div>
      {drawerOpen && createPortal(
        <div className="fixed right-0 top-16 bottom-0 z-40 flex shadow-xl">
          <PagePropertiesDrawer page={page} projectId={project.id!} pageIndex={selectedIndex}
            pageCount={project.pages.length} versionCount={versionCount}
            templateMode={project.template_mode} templateAssets={templateAssets}
            extraFieldNames={extraFieldNames} imagePromptFields={imagePromptFields}
            isOpen={drawerOpen} isSaving={isSavingPages} width={drawerWidth}
            onWidthChange={setDrawerWidth} onOpen={() => setDrawerOpen(true)} onClose={() => setDrawerOpen(false)}
            onUpdate={(pageId, data) => updatePageLocal(pageId, data)}
            onUpdatePageTemplate={(pageId, patch) => updatePageTemplate(project.id!, pageId, patch)}
            onUploadTemplateAsset={(file) => uploadTemplateAsset(project.id!, file, { bindToPageId: page?.id || page?.page_id })}
            onOpenTemplateSetup={openTemplateSetup} showToast={showToast} />
        </div>, document.body,
      )}
      <SlidePlayer open={playerOpen} initialIndex={selectedIndex} pages={project.pages}
        aspectRatio={project.image_aspect_ratio || '16:9'} onClose={() => setPlayerOpen(false)}
        onIndexChange={onSelectIndex} />
    </>
  );
};
