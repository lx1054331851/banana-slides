import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X, ArrowUp, Bot, UserRound } from 'lucide-react';

type ChatMessageRole = 'assistant' | 'user';
type ChatMessageTone = 'default' | 'error';

interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  tone?: ChatMessageTone;
}

interface GlobalAiAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  placeholder: string;
  welcomeTitle: string;
  welcomeDescription: string;
  suggestions: string[];
  loadingLabel: string;
  responseFallback: string;
  errorFallback: string;
  submitTooltip: string;
  inputHint: string;
  onSubmit: (requirement: string, previousRequirements: string[]) => Promise<string | void>;
}

const createMessage = (
  role: ChatMessageRole,
  content: string,
  tone: ChatMessageTone = 'default',
): ChatMessage => ({
  id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  role,
  content,
  tone,
});

export const GlobalAiAssistantDrawer: React.FC<GlobalAiAssistantDrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  placeholder,
  welcomeTitle,
  welcomeDescription,
  suggestions,
  loadingLabel,
  responseFallback,
  errorFallback,
  submitTooltip,
  inputHint,
  onSubmit,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setIsAnimating(true)));
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }

    setIsAnimating(false);
    const timer = window.setTimeout(() => setIsVisible(false), 220);
    document.body.style.overflow = '';
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isSubmitting, isOpen]);

  const canSubmit = inputValue.trim().length > 0 && !isSubmitting;

  const emptySuggestions = useMemo(
    () => suggestions.filter((item) => item.trim().length > 0).slice(0, 3),
    [suggestions],
  );

  const handleSend = async (overrideValue?: string) => {
    const nextValue = (overrideValue ?? inputValue).trim();
    if (!nextValue || isSubmitting) return;

    setInputValue('');
    setMessages((prev) => [...prev, createMessage('user', nextValue)]);
    setIsSubmitting(true);

    try {
      const responseMessage = await onSubmit(nextValue, history);
      setHistory((prev) => [...prev, nextValue]);
      setMessages((prev) => [
        ...prev,
        createMessage('assistant', responseMessage?.trim() || responseFallback),
      ]);
    } catch (error: any) {
      const message = error?.message || errorFallback;
      setMessages((prev) => [...prev, createMessage('assistant', message, 'error')]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.nativeEvent as KeyboardEvent).isComposing) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  if (!isVisible || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[80]" aria-hidden={!isOpen}>
      <button
        type="button"
        className={`absolute inset-0 bg-slate-950/35 backdrop-blur-sm transition-opacity duration-200 ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-label="close global ai assistant backdrop"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`absolute bottom-0 right-0 top-0 flex w-full max-w-[520px] flex-col border-l border-[#eadfba] bg-[linear-gradient(180deg,#fbf7ec_0%,#fffdf7_12%,#fff_100%)] shadow-[-18px_0_48px_rgba(15,23,42,0.14)] transition-transform duration-200 ease-out ${isAnimating ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="border-b border-[#eee3bf] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-[#ecd67c] bg-[#fff3bf] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7c5a00]">
                <Sparkles size={12} />
                AI
              </div>
              <h2 className="text-base font-semibold text-slate-900">{title}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">{subtitle}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
              aria-label="close global ai assistant"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5">
          {messages.length === 0 ? (
            <div className="space-y-5">
              <div className="rounded-[28px] border border-[#f0e2ab] bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_rgba(255,255,255,0.92)_42%,_rgba(255,255,255,1)_72%)] p-5 shadow-[0_18px_40px_rgba(234,179,8,0.08)]">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-[#facc15] shadow-sm">
                  <Bot size={20} />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">{welcomeTitle}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{welcomeDescription}</p>
              </div>

              <div className="space-y-2">
                {emptySuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setInputValue(suggestion)}
                    className="flex w-full items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-[#e6ca67] hover:bg-[#fffbed]"
                  >
                    <span className="text-sm leading-6 text-slate-700">{suggestion}</span>
                    <Sparkles size={15} className="mt-1 flex-shrink-0 text-[#c79a00]" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => {
                const isUser = message.role === 'user';
                return (
                  <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex max-w-[88%] gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`mt-1 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl ${isUser ? 'bg-slate-900 text-white' : 'bg-[#fff1bf] text-[#8a6200]'}`}>
                        {isUser ? <UserRound size={16} /> : <Bot size={16} />}
                      </div>
                      <div
                        className={`rounded-[22px] px-4 py-3 text-sm leading-6 shadow-sm ${
                          isUser
                            ? 'bg-slate-900 text-white'
                            : message.tone === 'error'
                              ? 'border border-rose-200 bg-rose-50 text-rose-700'
                              : 'border border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        {message.content}
                      </div>
                    </div>
                  </div>
                );
              })}
              {isSubmitting && (
                <div className="flex justify-start">
                  <div className="flex max-w-[88%] gap-3">
                    <div className="mt-1 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-[#fff1bf] text-[#8a6200]">
                      <Bot size={16} />
                    </div>
                    <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex gap-1">
                          <span className="h-2 w-2 animate-bounce rounded-full bg-[#d8a900] [animation-delay:-0.2s]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-[#d8a900] [animation-delay:-0.1s]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-[#d8a900]" />
                        </span>
                        <span>{loadingLabel}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-[#eee3bf] bg-white/90 px-5 py-4 backdrop-blur">
          <div className="rounded-[26px] border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.08)]">
            <textarea
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder={placeholder}
              rows={4}
              className="min-h-[108px] w-full resize-none rounded-[26px] bg-transparent px-4 py-4 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400"
              disabled={isSubmitting}
            />
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-3 py-3">
              <div className="text-xs text-slate-400">{inputHint}</div>
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!canSubmit}
                title={submitTooltip}
                className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl transition-all ${
                  canSubmit
                    ? 'bg-slate-900 text-[#facc15] shadow-[0_10px_24px_rgba(15,23,42,0.2)] hover:-translate-y-0.5'
                    : 'bg-slate-100 text-slate-300'
                }`}
              >
                <ArrowUp size={18} />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
};
