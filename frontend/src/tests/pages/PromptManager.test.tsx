import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PromptManager } from '@/pages/PromptManager';

const {
  mockNavigate,
  mockGetPromptTemplates,
  mockUpdatePromptTemplate,
  mockResetPromptTemplate,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGetPromptTemplates: vi.fn(async () => ({
    data: {
      templates: [
        {
          id: 1,
          key: 'image_generation',
          mode: 'image',
          stage: 'generate',
          title: '图片生成',
          description: '根据页面描述生成图片提示词',
          default_content: '默认图片提示词',
          custom_content: '',
          effective_content: '默认图片提示词',
          enabled: false,
          is_customized: false,
        },
        {
          id: 2,
          key: 'outline_generation',
          mode: 'outline',
          stage: 'generate',
          title: '大纲生成',
          description: '生成结构化大纲',
          default_content: '默认大纲提示词',
          custom_content: '自定义大纲提示词',
          effective_content: '自定义大纲提示词',
          enabled: true,
          is_customized: true,
        },
      ],
    },
  })),
  mockUpdatePromptTemplate: vi.fn(async () => ({
    data: {
      id: 1,
      key: 'image_generation',
      mode: 'image',
      stage: 'generate',
      title: '图片生成',
      description: '根据页面描述生成图片提示词',
      default_content: '默认图片提示词',
      custom_content: '新的图片提示词',
      effective_content: '新的图片提示词',
      enabled: true,
      is_customized: true,
    },
  })),
  mockResetPromptTemplate: vi.fn(async () => ({
    data: {
      id: 1,
      key: 'image_generation',
      mode: 'image',
      stage: 'generate',
      title: '图片生成',
      description: '根据页面描述生成图片提示词',
      default_content: '默认图片提示词',
      custom_content: '',
      effective_content: '默认图片提示词',
      enabled: false,
      is_customized: false,
    },
  })),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<any>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/api/endpoints', () => ({
  getPromptTemplates: mockGetPromptTemplates,
  updatePromptTemplate: mockUpdatePromptTemplate,
  resetPromptTemplate: mockResetPromptTemplate,
}));

describe('PromptManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads prompt templates and selects the first template', async () => {
    render(<PromptManager />);

    expect(await screen.findByText('提示词管理')).toBeInTheDocument();
    expect(screen.getByTestId('prompt-template-row-image_generation')).toBeInTheDocument();
    expect(screen.getByLabelText('默认提示词')).toHaveValue('默认图片提示词');
    expect(mockGetPromptTemplates).toHaveBeenCalledTimes(1);
  });

  it('refreshes prompt templates from the header action', async () => {
    render(<PromptManager />);

    fireEvent.click(await screen.findByRole('button', { name: '刷新' }));

    await waitFor(() => {
      expect(mockGetPromptTemplates).toHaveBeenCalledTimes(2);
    });
  });

  it('saves custom prompt content and enabled state', async () => {
    render(<PromptManager />);

    const customTextarea = await screen.findByLabelText('自定义提示词');
    fireEvent.change(customTextarea, { target: { value: '新的图片提示词' } });
    fireEvent.click(screen.getByLabelText('启用自定义提示词'));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(mockUpdatePromptTemplate).toHaveBeenCalledWith('image_generation', {
        custom_content: '新的图片提示词',
        enabled: true,
      });
    });
  });

  it('expands and restores a prompt editor area', async () => {
    render(<PromptManager />);

    expect(await screen.findByLabelText('默认提示词')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '扩大自定义提示词编辑区' }));

    expect(screen.getByLabelText('默认提示词').parentElement).toHaveClass('hidden');
    expect(screen.getByLabelText('自定义提示词')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '收起自定义提示词编辑区' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '收起自定义提示词编辑区' }));

    expect(screen.getByLabelText('默认提示词').parentElement).not.toHaveClass('hidden');
    expect(screen.getByLabelText('自定义提示词')).toBeInTheDocument();
  });

  it('resets the selected prompt template after confirmation', async () => {
    render(<PromptManager />);

    await screen.findByTestId('prompt-template-row-image_generation');
    fireEvent.click(screen.getByRole('button', { name: '恢复默认' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认恢复' }));

    await waitFor(() => {
      expect(mockResetPromptTemplate).toHaveBeenCalledWith('image_generation');
    });
  });
});
