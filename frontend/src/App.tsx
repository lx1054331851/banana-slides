import { useEffect } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate, useSearchParams, useNavigate } from 'react-router-dom';
import { Home } from './pages/Home';
import { Landing } from './pages/Landing';
import { History } from './pages/History';
import { OutlineEditor } from './pages/OutlineEditor';
import { DetailEditor } from './pages/DetailEditor';
import { TemplateSetupPage } from './pages/TemplateSetupPage';
import { SlidePreview } from './pages/SlidePreview';
import { StyleWorkflow } from './pages/StyleWorkflow';
import { SettingsPage } from './pages/SettingsPage';
import { StyleLibrary } from './pages/StyleLibrary';
import { MaterialManagement } from './pages/MaterialManagement';
import { PromptManager } from './pages/PromptManager';
import { useProjectStore } from './store/useProjectStore';
import { useToast, AccessCodeGuard, DesktopTitleBar, UpdateChecker } from './components/shared';
import { getDesktopTopInset } from './components/shared/UpdateChecker';
import { isDesktop } from '@/utils';

/** Route desktop material shortcuts to the custom material workspace. */
function DesktopShortcuts() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'material-generate' || action === 'material-center') navigate('/materials', { replace: true });
  }, [searchParams, navigate]);
  return null;
}

function App() {
  const { currentProject, syncProject, error, setError } = useProjectStore();
  const { show, ToastContainer } = useToast();

  // 恢复项目状态
  useEffect(() => {
    const savedProjectId = localStorage.getItem('currentProjectId');
    if (savedProjectId && !currentProject) {
      syncProject();
    }
  }, [currentProject, syncProject]);

  // 显示全局错误
  useEffect(() => {
    if (error) {
      show({ message: error, type: 'error' });
      setError(null);
    }
  }, [error, setError, show]);


  return (
    <>
      <UpdateChecker />
      <div style={isDesktop ? { paddingTop: `${getDesktopTopInset()}px` } : undefined}>
        <AccessCodeGuard>
          {(() => {
            const Router = isDesktop ? HashRouter : BrowserRouter;
            return (
              <Router>
                <DesktopTitleBar />
                <DesktopShortcuts />
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/landing" element={<Landing />} />
                  <Route path="/materials" element={<MaterialManagement />} />
                  <Route path="/style-library" element={<StyleLibrary />} />
                  <Route path="/prompt-manager" element={<PromptManager />} />
                  <Route path="/project/:projectId/style" element={<StyleWorkflow />} />
                  <Route path="/history" element={<History />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/project/:projectId/outline" element={<OutlineEditor />} />
                  <Route path="/project/:projectId/detail" element={<DetailEditor />} />
                  <Route path="/project/:projectId/template-setup" element={<TemplateSetupPage />} />
                  <Route path="/project/:projectId/preview" element={<SlidePreview />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                <ToastContainer />
              </Router>
            );
          })()}
        </AccessCodeGuard>
      </div>
    </>
  );
}

export default App;
