import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, Key, RefreshCw } from 'lucide-react';
import { Button, PageHeader, PAGE_CONTAINER_CLASS } from '@/components/shared';
import { useT } from '@/hooks/useT';
import { Settings } from './Settings';
import { settingsI18n } from './Settings.i18n';

// SettingsPage 组件 - 完整页面包装
const SCROLL_SHOW_THRESHOLD = 300;

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const t = useT(settingsI18n);
  const [showTop, setShowTop] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > SCROLL_SHOW_THRESHOLD);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleBack = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  }, [navigate]);

  const handleRefresh = useCallback(() => {
    setRefreshToken((prev) => prev + 1);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-banana-50 dark:from-background-primary to-yellow-50 dark:to-background-primary">
      <PageHeader
        title={t('settings.title')}
        icon={<Key size={18} />}
        onBack={handleBack}
        onHome={() => navigate('/')}
        backLabel={t('nav.back')}
        homeLabel={t('nav.home')}
        actions={(
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw size={16} className={isSettingsLoading ? 'animate-spin' : ''} />}
            onClick={handleRefresh}
            disabled={isSettingsLoading}
          >
            {isSettingsLoading ? t('nav.loading') : t('nav.refresh')}
          </Button>
        )}
      />

      <main className={`${PAGE_CONTAINER_CLASS} py-6 md:py-8`}>

        <Settings refreshToken={refreshToken} onLoadingChange={setIsSettingsLoading} />
      </main>

      {showTop && (
        <button
          data-testid="back-to-top-button"
          aria-label="Back to top"
          title="Back to top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 p-3 rounded-full bg-banana-500 text-white shadow-lg hover:bg-banana-600 transition-all z-50"
        >
          <ArrowUp size={20} />
        </button>
      )}
    </div>
  );
};
