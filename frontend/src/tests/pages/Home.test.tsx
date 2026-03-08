import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Home } from '@/pages/Home';


const createStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
};

const {
  mockNavigate,
  mockInitializeProject,
  mockShow,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockInitializeProject: vi.fn(async () => undefined),
  mockShow: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<any>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      language: 'zh',
      changeLanguage: vi.fn(),
    },
  }),
}));

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'light',
    setTheme: vi.fn(),
    effectiveTheme: 'light',
    isDark: false,
  }),
}));

vi.mock('@/hooks/useImagePaste', () => ({
  useImagePaste: () => ({
    handlePaste: vi.fn(),
    handleFiles: vi.fn(),
    isUploading: false,
  }),
}));

vi.mock('@/store/useProjectStore', () => ({
  useProjectStore: () => ({
    initializeProject: mockInitializeProject,
    isGlobalLoading: false,
  }),
}));

vi.mock('@/api/endpoints', () => ({
  uploadReferenceFile: vi.fn(async () => ({ data: { file: { id: 'file-1', name: 'demo.txt', parse_status: 'completed' } } })),
  associateFileToProject: vi.fn(async () => ({ data: {} })),
  triggerFileParse: vi.fn(async () => ({ data: {} })),
  associateMaterialsToProject: vi.fn(async () => ({ data: {} })),
  createPptRenovationProject: vi.fn(async () => ({ data: { project_id: 'proj-1', task_id: 'task-1', page_count: 1 } })),
}));

vi.mock('mammoth/mammoth.browser', () => ({
  default: {
    extractRawText: vi.fn(async () => ({ value: '' })),
  },
}));

vi.mock('@/components/shared', async () => {
  const Button = ({ children, icon, className, disabled, onClick, title, type }: any) => (
    <button type={type ?? 'button'} className={className} disabled={disabled} onClick={onClick} title={title}>
      {icon}
      {children}
    </button>
  );
  const Card = ({ children, className }: any) => <div className={className}>{children}</div>;
  const ReferenceFileList = () => null;
  const ReferenceFileSelector = () => null;
  const FilePreviewModal = () => null;
  const HelpModal = () => null;
  const ToastContainer = () => null;

  return {
    Button,
    Card,
    ReferenceFileList,
    ReferenceFileSelector,
    FilePreviewModal,
    HelpModal,
    useToast: () => ({ show: mockShow, ToastContainer }),
  };
});

vi.mock('@/components/shared/MarkdownTextarea', async () => {
  const ReactModule = await vi.importActual<typeof import('react')>('react');

  const MarkdownTextarea = ReactModule.forwardRef<any, any>(({ value, onChange, onPaste, placeholder, className, rows }, ref) => {
    ReactModule.useImperativeHandle(ref, () => ({
      insertAtCursor: vi.fn(),
    }));

    return (
      <textarea
        value={value}
        placeholder={placeholder}
        className={className}
        rows={rows}
        onPaste={onPaste}
        onChange={(event) => onChange?.(event.target.value)}
      />
    );
  });

  MarkdownTextarea.displayName = 'MarkdownTextarea';

  return {
    MarkdownTextarea,
  };
});

describe('Home', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const local = createStorage();
    const session = createStorage();

    vi.stubGlobal('localStorage', local);
    vi.stubGlobal('sessionStorage', session);
    Object.defineProperty(window, 'localStorage', { value: local, configurable: true });
    Object.defineProperty(window, 'sessionStorage', { value: session, configurable: true });

    localStorage.setItem('hasSeenHelpModal', 'true');
  });

  it('does not render style template or text style mode in either creation flow', () => {
    render(<Home />);

    expect(screen.queryByText(/选择风格模板|Select Style Template/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/使用文字描述风格|Use text description for style/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /PPT 翻新|PPT Renovation/i }));

    expect(screen.queryByText(/选择风格模板|Select Style Template/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/使用文字描述风格|Use text description for style/i)).not.toBeInTheDocument();
  });
});
