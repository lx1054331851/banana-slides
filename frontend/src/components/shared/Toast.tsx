import React, { useEffect, useRef } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/utils';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  onClose: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'info',
  onClose,
  duration = 3000,
}) => {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => onCloseRef.current(), duration);
      return () => clearTimeout(timer);
    }
  }, [duration]);

  const icons = {
    success: <CheckCircle size={20} />,
    error: <AlertCircle size={20} />,
    info: <Info size={20} />,
    warning: <AlertTriangle size={20} />,
  };

  const styles = {
    success: 'bg-green-500 text-white',
    error: 'bg-red-500 text-white',
    info: 'bg-gray-900 dark:bg-background-hover text-white',
    warning: 'bg-amber-500 text-white',
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg',
        'animate-in slide-in-from-right transition-all duration-300',
        styles[type]
      )}
    >
      {icons[type]}
      <span className="flex-1">{message}</span>
      <button
        onClick={onClose}
        className="hover:opacity-75 transition-opacity"
      >
        <X size={18} />
      </button>
    </div>
  );
};

// Toast 管理器
export const useToast = () => {
  const [toasts, setToasts] = React.useState<Array<{ id: string; props: Omit<ToastProps, 'onClose'> }>>([]);
  const timersRef = useRef<Map<string, number>>(new Map());
  const recentRef = useRef<Map<string, number>>(new Map());
  const toastsRef = useRef(toasts);

  useEffect(() => {
    toastsRef.current = toasts;
  }, [toasts]);

  const remove = React.useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = React.useCallback((props: Omit<ToastProps, 'onClose'>) => {
    const type = props.type ?? 'info';
    const key = `${type}:${props.message}`;
    const now = Date.now();

    // Deduplicate noisy toasts (e.g. repeated polling/network errors) to avoid UI "shaking".
    // If the same message is already visible or was shown very recently, skip it.
    const lastShown = recentRef.current.get(key) ?? 0;
    if (now - lastShown < 1500) return;
    if (toastsRef.current.some((t) => (t.props.type ?? 'info') === type && t.props.message === props.message)) return;
    recentRef.current.set(key, now);

    const id = Math.random().toString(36);
    setToasts((prev) => {
      const newToasts = [...prev, { id, props }];
      // 最多保留5个toast，超过则移除最早的
      return newToasts.length > 5 ? newToasts.slice(-5) : newToasts;
    });
    const duration = props.duration ?? 3000;
    if (duration > 0) {
      const timer = window.setTimeout(() => {
        remove(id);
      }, duration);
      timersRef.current.set(id, timer);
    }
  }, [remove]);

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current.clear();
  }, []);

  return {
    show,
    ToastContainer: () => (
      <div className="fixed top-20 right-4 z-50 flex flex-col items-end gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast
              {...toast.props}
              onClose={() => remove(toast.id)}
            />
          </div>
        ))}
      </div>
    ),
  };
};
