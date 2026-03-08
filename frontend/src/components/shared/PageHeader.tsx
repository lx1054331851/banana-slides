import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Globe, Home, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/utils';
import { Button } from './Button';

export const PAGE_CONTAINER_CLASS = 'max-w-7xl mx-auto px-4';

interface PageHeaderProps {
  title: string;
  icon: React.ReactNode;
  onBack?: () => void;
  onHome?: () => void;
  backLabel?: string;
  homeLabel?: string;
  languageLabel?: string;
  showLanguageToggle?: boolean;
  showThemeToggle?: boolean;
  themeLightLabel?: string;
  themeDarkLabel?: string;
  actions?: React.ReactNode;
  className?: string;
  innerClassName?: string;
  backTestId?: string;
  homeTestId?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  icon,
  onBack,
  onHome,
  backLabel,
  homeLabel,
  languageLabel,
  showLanguageToggle = false,
  showThemeToggle = false,
  themeLightLabel,
  themeDarkLabel,
  actions,
  className,
  innerClassName,
  backTestId,
  homeTestId,
}) => {
  const { i18n } = useTranslation();
  const { isDark, setTheme } = useTheme();
  const hasNavButtons = Boolean(onBack || onHome);

  const handleLanguageToggle = () => {
    void i18n.changeLanguage(i18n.language?.startsWith('zh') ? 'en' : 'zh');
  };

  const handleThemeToggle = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  return (
    <nav className={cn('h-20 bg-white/85 dark:bg-background-secondary/95 border-b border-gray-200 dark:border-border-primary backdrop-blur-sm', className)}>
      <div className={cn(`${PAGE_CONTAINER_CLASS} h-full flex items-center justify-between gap-3`, innerClassName)}>
        <div className="min-w-0 flex items-center gap-2 md:gap-3">
          {onBack && (
            <Button
              variant="ghost"
              size="sm"
              icon={<ArrowLeft size={16} className="md:w-[18px] md:h-[18px]" />}
              onClick={onBack}
              className="text-xs md:text-sm"
              title={backLabel}
              aria-label={backLabel}
              data-testid={backTestId}
            >
              {backLabel}
            </Button>
          )}
          {onHome && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Home size={16} className="md:w-[18px] md:h-[18px]" />}
              onClick={onHome}
              className="text-xs md:text-sm"
              title={homeLabel}
              aria-label={homeLabel}
              data-testid={homeTestId}
            >
              {homeLabel}
            </Button>
          )}
          {hasNavButtons && <div className="hidden sm:block h-5 w-px bg-gray-300 dark:bg-border-primary mx-1" />}
          <div className="min-w-0 flex items-center gap-2">
            <div className="flex-shrink-0 text-orange-600 dark:text-banana">{icon}</div>
            <h1 className="truncate text-base md:text-lg font-semibold text-gray-900 dark:text-white">{title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-1 md:gap-2">
          {showLanguageToggle && (
            <button
              type="button"
              onClick={handleLanguageToggle}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 dark:text-foreground-tertiary hover:text-gray-900 dark:hover:text-gray-100 hover:bg-banana-100/60 dark:hover:bg-background-hover rounded-md transition-all"
              title={languageLabel}
              aria-label={languageLabel}
            >
              <Globe size={14} />
              <span>{i18n.language?.startsWith('zh') ? 'EN' : '中'}</span>
            </button>
          )}
          {showThemeToggle && (
            <button
              type="button"
              onClick={handleThemeToggle}
              className="flex items-center gap-1 p-1.5 text-gray-600 dark:text-foreground-tertiary hover:text-gray-900 dark:hover:text-gray-100 hover:bg-banana-100/60 dark:hover:bg-background-hover rounded-md transition-all"
              title={isDark ? themeLightLabel : themeDarkLabel}
              aria-label={isDark ? themeLightLabel : themeDarkLabel}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          )}
          {actions}
        </div>
      </div>
    </nav>
  );
};
