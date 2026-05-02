import { useState } from 'react';
import type React from 'react';
import * as api from '@/api/endpoints';
import type { Settings as SettingsType } from '@/types';

type SettingsTranslator = (key: string, params?: Record<string, string | number>) => string;
type ToastType = 'success' | 'error' | 'info' | 'warning';

interface UseSettingsOpenAIOAuthOptions {
  t: SettingsTranslator;
  show: (props: { message: string; type?: ToastType; duration?: number }) => void;
  setSettings: React.Dispatch<React.SetStateAction<SettingsType | null>>;
}

// 管理设置页 OpenAI OAuth 登录、断开和手动回调兜底流程。
export const useSettingsOpenAIOAuth = ({
  t,
  show,
  setSettings,
}: UseSettingsOpenAIOAuthOptions) => {
  const [oauthConnecting, setOauthConnecting] = useState(false);
  const [manualCallbackUrl, setManualCallbackUrl] = useState('');
  const [manualCallbackOpen, setManualCallbackOpen] = useState(false);
  const [manualCallbackSubmitting, setManualCallbackSubmitting] = useState(false);

  // 处理 OpenAI OAuth 登录弹窗和回调状态同步。
  const handleOAuthLogin = async () => {
    setOauthConnecting(true);
    try {
      const resp = await api.getOpenAIOAuthUrl();
      if (resp.success && resp.data?.auth_url) {
        const popup = window.open(resp.data.auth_url, 'openai-oauth', 'width=600,height=700');
        const onMessage = async (event: MessageEvent) => {
          if (event.data?.type === 'openai-oauth-callback') {
            window.removeEventListener('message', onMessage);
            setOauthConnecting(false);
            if (event.data.success) {
              const statusResp = await api.getOpenAIOAuthStatus();
              if (statusResp.success && statusResp.data) {
                setSettings(prev => prev ? {
                  ...prev,
                  openai_oauth_connected: statusResp.data!.connected,
                  openai_oauth_account_id: statusResp.data!.account_id || undefined,
                } : prev);
              }
            } else {
              show({ message: t('settings.openaiOAuth.connectFailed'), type: 'error' });
            }
          }
        };
        window.addEventListener('message', onMessage);
        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
            setOauthConnecting(false);
            window.removeEventListener('message', onMessage);
          }
        }, 1000);
      } else {
        setOauthConnecting(false);
        show({ message: t('settings.openaiOAuth.connectFailed'), type: 'error' });
      }
    } catch {
      setOauthConnecting(false);
      show({ message: t('settings.openaiOAuth.connectFailed'), type: 'error' });
    }
  };

  // 处理 OpenAI OAuth 断开连接并刷新本地设置状态。
  const handleOAuthDisconnect = async () => {
    try {
      const resp = await api.disconnectOpenAIOAuth();
      if (resp.success) {
        setSettings(prev => prev ? {
          ...prev,
          openai_oauth_connected: false,
          openai_oauth_account_id: undefined,
        } : prev);
        show({ message: t('settings.openaiOAuth.disconnectSuccess'), type: 'success' });
      }
    } catch {
      show({ message: t('settings.openaiOAuth.disconnectFailed'), type: 'error' });
    }
  };

  // 处理端口 1455 不可用时手动粘贴 OAuth 回调地址。
  const handleManualCallback = async () => {
    if (!manualCallbackUrl.trim()) return;
    setManualCallbackSubmitting(true);
    try {
      const resp = await api.submitOAuthManualCallback(manualCallbackUrl.trim());
      if (resp.success) {
        setManualCallbackUrl('');
        setManualCallbackOpen(false);
        const statusResp = await api.getOpenAIOAuthStatus();
        if (statusResp.success && statusResp.data) {
          setSettings(prev => prev ? {
            ...prev,
            openai_oauth_connected: statusResp.data!.connected,
            openai_oauth_account_id: statusResp.data!.account_id || undefined,
          } : prev);
        }
        show({ message: t('settings.openaiOAuth.manualCallbackSuccess'), type: 'success' });
      } else {
        show({ message: t('settings.openaiOAuth.connectFailed'), type: 'error' });
      }
    } catch {
      show({ message: t('settings.openaiOAuth.connectFailed'), type: 'error' });
    } finally {
      setManualCallbackSubmitting(false);
    }
  };

  return {
    oauthConnecting,
    manualCallbackUrl,
    manualCallbackOpen,
    manualCallbackSubmitting,
    setManualCallbackUrl,
    setManualCallbackOpen,
    handleOAuthLogin,
    handleOAuthDisconnect,
    handleManualCallback,
  };
};
