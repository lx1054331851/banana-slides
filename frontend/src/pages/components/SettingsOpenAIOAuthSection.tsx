import type React from 'react';
import type { Settings as SettingsType } from '@/types';

type SettingsTranslator = (key: string, params?: Record<string, string | number>) => string;

interface SettingsOpenAIOAuthSectionProps {
  settings: SettingsType | null;
  t: SettingsTranslator;
  oauthConnecting: boolean;
  manualCallbackUrl: string;
  manualCallbackOpen: boolean;
  manualCallbackSubmitting: boolean;
  onLogin: () => void;
  onDisconnect: () => void;
  onManualCallback: () => void;
  onManualCallbackUrlChange: (value: string) => void;
  onManualCallbackOpenChange: React.Dispatch<React.SetStateAction<boolean>>;
}

// 渲染 OpenAI OAuth 连接状态、登录按钮与手动回调兜底入口。
export const SettingsOpenAIOAuthSection: React.FC<SettingsOpenAIOAuthSectionProps> = ({
  settings,
  t,
  oauthConnecting,
  manualCallbackUrl,
  manualCallbackOpen,
  manualCallbackSubmitting,
  onLogin,
  onDisconnect,
  onManualCallback,
  onManualCallbackUrlChange,
  onManualCallbackOpenChange,
}) => (
  <div className="p-4 border border-gray-200 dark:border-border-primary rounded-lg">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className={`w-2.5 h-2.5 rounded-full ${settings?.openai_oauth_connected ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
        <div>
          <span className="text-sm font-medium text-gray-700 dark:text-foreground-secondary">
            {settings?.openai_oauth_connected ? t('settings.openaiOAuth.connected') : t('settings.openaiOAuth.disconnected')}
          </span>
          {settings?.openai_oauth_connected && settings?.openai_oauth_account_id && (
            <span className="ml-2 text-sm text-gray-500 dark:text-foreground-tertiary">
              ({settings.openai_oauth_account_id})
            </span>
          )}
        </div>
      </div>
      <div>
        {settings?.openai_oauth_connected ? (
          <button
            type="button"
            onClick={onDisconnect}
            className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          >
            {t('settings.openaiOAuth.disconnectBtn')}
          </button>
        ) : (
          <button
            type="button"
            onClick={onLogin}
            disabled={oauthConnecting}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 dark:bg-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            {oauthConnecting ? t('settings.openaiOAuth.connecting') : t('settings.openaiOAuth.loginBtn')}
          </button>
        )}
      </div>
    </div>
    <p className="mt-3 text-xs text-gray-500 dark:text-foreground-tertiary">{t('settings.openaiOAuth.hint')}</p>
    {!settings?.openai_oauth_connected && (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => onManualCallbackOpenChange((value) => !value)}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          {t('settings.openaiOAuth.manualCallbackLabel')}
        </button>
        {manualCallbackOpen && (
          <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">{t('settings.openaiOAuth.manualCallbackHint')}</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualCallbackUrl}
                onChange={(event) => onManualCallbackUrlChange(event.target.value)}
                placeholder={t('settings.openaiOAuth.manualCallbackPlaceholder')}
                className="flex-1 px-3 py-1.5 text-xs border border-gray-300 dark:border-border-primary rounded-md bg-white dark:bg-background-secondary text-gray-900 dark:text-foreground-primary placeholder-gray-400"
              />
              <button
                type="button"
                onClick={onManualCallback}
                disabled={manualCallbackSubmitting || !manualCallbackUrl.trim()}
                className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 dark:bg-white dark:text-gray-900 rounded-md hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                {t('settings.openaiOAuth.manualCallbackSubmit')}
              </button>
            </div>
          </div>
        )}
      </div>
    )}
  </div>
);
