import React, { useEffect, useState } from 'react';
import { ArrowUp, ArrowUpRight, Info, RefreshCw, CheckCircle } from 'lucide-react';
import { appVersion } from '@/utils/appVersion';
import { isDesktop } from '@/utils';
import type { DesktopAutoUpdateSettings, DesktopUpdateCheckResult, DesktopUpdateElectronApi } from '@/types/desktopUpdate';
import { Button, Markdown, Modal } from '@/components/shared';
import * as api from '@/api/endpoints';
import type { UpdateCheckInfo } from '@/api/endpoints';

type SettingsTranslator = (key: string, vars?: Record<string, string>) => string;

interface UpdateResultView {
  status: 'up_to_date' | 'update_available' | 'downloading' | 'update_downloaded' | 'unknown';
  updateAvailable: boolean;
  version: string;
  downloadUrl?: string;
  canAutoUpdate?: boolean;
  progress?: number;
  notes?: string;
}

/** Normalize update information for the settings view. */
function getLatestVersion(info: UpdateCheckInfo): string {
  const sha = info.latest?.sha;
  if (sha) {
    return sha.length > 7 ? sha.slice(0, 7) : sha;
  }
  return info.latest?.tag || '';
}

/** Normalize update information for the settings view. */
function toUpdateResultView(info: UpdateCheckInfo): UpdateResultView {
  return {
    status: info.status,
    updateAvailable: info.update_available,
    version: getLatestVersion(info),
  };
}

/** Normalize update information for the settings view. */
function toDesktopUpdateResultView(info: DesktopUpdateCheckResult): UpdateResultView {
  if (
    (
      info.status === 'update_available'
      || info.status === 'downloading'
      || info.status === 'update_downloaded'
      || info.status === 'error'
    )
    && info.update
  ) {
    return {
      status: info.status === 'error' ? 'update_available' : info.status,
      updateAvailable: true,
      version: info.update.version,
      downloadUrl: info.update.url,
      canAutoUpdate: info.canAutoUpdate,
      progress: info.progress?.percent,
      notes: info.update.notes,
    };
  }

  if (info.status !== 'up_to_date') {
    return {
      status: 'unknown',
      updateAvailable: false,
      version: info.latestVersion,
    };
  }

  return {
    status: 'up_to_date',
    updateAvailable: false,
    version: info.latestVersion,
  };
}

/** Normalize update information for the settings view. */
function formatUpdateMessage(t: SettingsTranslator, info: UpdateResultView): string {
  if (info.status === 'up_to_date') return t('settings.about.upToDate');
  if (info.status === 'update_available') return t('settings.about.updateAvailable', { version: info.version });
  if (info.status === 'downloading') {
    return t('settings.about.updateDownloading', {
      version: info.version,
      progress: String(Math.round(info.progress || 0)),
    });
  }
  if (info.status === 'update_downloaded') return t('settings.about.updateReady', { version: info.version });
  return t('settings.about.unknown');
}

/** Display web and desktop update status and installation actions. */
export const SettingsAbout: React.FC<{ t: SettingsTranslator }> = ({ t }) => {
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateActionPending, setUpdateActionPending] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateResultView | null>(null);
  const [updateError, setUpdateError] = useState('');
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [automaticUpdatesEnabled, setAutomaticUpdatesEnabled] = useState(true);
  const [automaticUpdatesSupported, setAutomaticUpdatesSupported] = useState(true);
  const [automaticUpdatesLoading, setAutomaticUpdatesLoading] = useState(isDesktop);
  const [automaticUpdatesSaving, setAutomaticUpdatesSaving] = useState(false);
  const [automaticUpdatesError, setAutomaticUpdatesError] = useState('');

  const desktopUpdateApi = isDesktop
    ? (window as typeof window & { electronAPI?: DesktopUpdateElectronApi }).electronAPI
    : undefined;

  useEffect(() => {
    if (!desktopUpdateApi) return;
    let disposed = false;
    const applySettings = (settings: DesktopAutoUpdateSettings) => {
      if (!disposed) {
        setAutomaticUpdatesEnabled(settings.automaticUpdatesEnabled);
        setAutomaticUpdatesSupported(settings.canAutoUpdate !== false);
      }
    };
    const applyUpdateState = (state: DesktopUpdateCheckResult) => {
      if (!disposed) setUpdateInfo(toDesktopUpdateResultView(state));
    };
    const unsubscribe = desktopUpdateApi.onUpdateStatus?.(applyUpdateState);

    if (desktopUpdateApi.getAutoUpdateSettings) {
      desktopUpdateApi.getAutoUpdateSettings()
        .then(applySettings)
        .catch((error) => {
          if (!disposed) setAutomaticUpdatesError(error?.message || t('settings.about.automaticUpdatesSaveFailed'));
        })
        .finally(() => {
          if (!disposed) setAutomaticUpdatesLoading(false);
        });
    } else {
      setAutomaticUpdatesLoading(false);
    }

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [desktopUpdateApi, t]);

  const handleAutomaticUpdatesChange = async () => {
    if (!desktopUpdateApi?.setAutomaticUpdatesEnabled || automaticUpdatesSaving) return;
    const nextEnabled = !automaticUpdatesEnabled;
    setAutomaticUpdatesSaving(true);
    setAutomaticUpdatesError('');
    try {
      const settings = await desktopUpdateApi.setAutomaticUpdatesEnabled(nextEnabled);
      setAutomaticUpdatesEnabled(settings.automaticUpdatesEnabled);
    } catch (error: any) {
      setAutomaticUpdatesError(error?.message || t('settings.about.automaticUpdatesSaveFailed'));
    } finally {
      setAutomaticUpdatesSaving(false);
    }
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateError('');
    try {
      if (isDesktop) {
        const response = await desktopUpdateApi!.checkForUpdates();
        setUpdateInfo(toDesktopUpdateResultView(response));
      } else {
        const response = await api.checkForUpdates();
        setUpdateInfo(response.data ? toUpdateResultView(response.data) : null);
      }
      setUpdateDialogOpen(true);
    } catch (error: any) {
      setUpdateInfo(null);
      setUpdateError(error?.response?.data?.error?.message || error?.message || t('settings.about.failed'));
      setUpdateDialogOpen(true);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleDesktopUpdateAction = async () => {
    if (!desktopUpdateApi || !updateInfo || updateActionPending) return;
    setUpdateActionPending(true);
    setUpdateError('');
    try {
      if (updateInfo.status === 'update_downloaded' && desktopUpdateApi.installUpdate) {
        const result = await desktopUpdateApi.installUpdate();
        if (!result.success) throw new Error(result.error || 'UPDATE_INSTALL_FAILED');
      } else if (updateInfo.canAutoUpdate && desktopUpdateApi.downloadUpdate) {
        const response = await desktopUpdateApi.downloadUpdate();
        setUpdateInfo(toDesktopUpdateResultView(response));
      } else if (updateInfo.downloadUrl) {
        await desktopUpdateApi.openExternal(updateInfo.downloadUrl);
      }
    } catch (error: any) {
      setUpdateError(error?.message || t('settings.about.failed'));
    } finally {
      setUpdateActionPending(false);
    }
  };

  const showSuccessCheck = updateInfo?.status === 'up_to_date';

  return (
    <>
      <div className="pt-4 border-t border-gray-200 dark:border-border-primary">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-foreground-primary mb-3 flex items-center">
          <Info size={20} />
          <span className="ml-2">{t('settings.sections.about')}</span>
        </h2>
        {isDesktop && (
          <div className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-border-primary dark:bg-background-secondary">
            <div className="min-w-0">
              <div className="font-medium text-gray-900 dark:text-foreground-primary">
                {automaticUpdatesSupported
                  ? t('settings.about.automaticUpdates')
                  : t('settings.about.automaticUpdateChecks')}
              </div>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-foreground-tertiary">
                {automaticUpdatesSupported
                  ? t('settings.about.automaticUpdatesDesc')
                  : t('settings.about.automaticUpdateChecksDesc')}
              </p>
              {automaticUpdatesError && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {t('settings.about.automaticUpdatesSaveFailed')}: {automaticUpdatesError}
                </p>
              )}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={automaticUpdatesEnabled}
              aria-label={automaticUpdatesSupported
                ? t('settings.about.automaticUpdates')
                : t('settings.about.automaticUpdateChecks')}
              disabled={automaticUpdatesLoading || automaticUpdatesSaving || !desktopUpdateApi?.setAutomaticUpdatesEnabled}
              onClick={handleAutomaticUpdatesChange}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-banana-500 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-50 ${
                automaticUpdatesEnabled ? 'bg-banana-500' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform ${
                  automaticUpdatesEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        )}
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
            {updateInfo && (
              <div className={updateInfo.updateAvailable ? 'text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-foreground-tertiary'}>
                <div>{formatUpdateMessage(t, updateInfo)}</div>
              </div>
            )}
            {updateError && (
              <div className="text-red-600 dark:text-red-400">
                {t('settings.about.failed')}: {updateError}
              </div>
            )}
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

      <Modal isOpen={updateDialogOpen} onClose={() => setUpdateDialogOpen(false)} title={t('settings.about.resultTitle')}>
        <div className="space-y-4">
          {updateInfo && (
            <div className="space-y-2 text-sm text-gray-700 dark:text-foreground-secondary">
              <div className="flex flex-col items-center gap-3 py-2 text-center">
                {showSuccessCheck && (
                  <CheckCircle
                    size={44}
                    data-testid="update-success-icon"
                    className="text-green-600 dark:text-green-400"
                    aria-hidden="true"
                  />
                )}
                {updateInfo.updateAvailable && (
                  <ArrowUp
                    size={44}
                    data-testid="update-available-icon"
                    className="text-orange-600 dark:text-orange-400"
                    aria-hidden="true"
                  />
                )}
                <p className={updateInfo.updateAvailable
                  ? 'text-xl font-semibold text-orange-600 dark:text-orange-400'
                  : 'text-xl font-semibold text-gray-900 dark:text-foreground-primary'
                }>
                  {formatUpdateMessage(t, updateInfo)}
                </p>
              </div>
              {updateInfo.updateAvailable && updateInfo.notes?.trim() && (
                <section aria-label={t('settings.about.summary')} className="space-y-2">
                  <h3 className="font-semibold text-gray-900 dark:text-foreground-primary">
                    {t('settings.about.summary')}
                  </h3>
                  <div className="max-h-52 overflow-y-auto rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-border-primary dark:bg-background-secondary">
                    <Markdown>{updateInfo.notes.trim()}</Markdown>
                  </div>
                </section>
              )}
              {updateInfo.updateAvailable && updateInfo.downloadUrl && (
                <button
                  type="button"
                  onClick={() => desktopUpdateApi?.openExternal(updateInfo.downloadUrl!)}
                  className="inline-flex items-center gap-1.5 font-medium text-banana-700 hover:text-banana-800 hover:underline dark:text-banana-300 dark:hover:text-banana-200"
                >
                  {t('settings.about.changelog')}
                  <ArrowUpRight size={15} aria-hidden="true" />
                </button>
              )}
            </div>
          )}
          {updateError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {t('settings.about.failed')}: {updateError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            {isDesktop && updateInfo?.updateAvailable && updateInfo.status !== 'downloading' && (
              <Button
                size="sm"
                onClick={handleDesktopUpdateAction}
                loading={updateActionPending}
              >
                {updateInfo.status === 'update_downloaded'
                  ? t('settings.about.restart')
                  : updateInfo.canAutoUpdate
                    ? t('settings.about.download')
                    : t('settings.about.fallbackDownload')}
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setUpdateDialogOpen(false)}>
              {updateInfo?.updateAvailable ? t('settings.about.later') : t('settings.about.close')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

