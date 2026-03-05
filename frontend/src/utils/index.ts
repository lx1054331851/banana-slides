import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Project, Page } from '@/types';

/**
 * 合并 className (支持 Tailwind CSS)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 标准化后端返回的项目数据
 */
export function normalizeProject(data: any): Project {
  return {
    ...data,
    id: data.project_id || data.id,
    template_image_path: data.template_image_url || data.template_image_path,
    pages: (data.pages || []).map(normalizePage),
  };
}

/**
 * 标准化后端返回的页面数据
 */
export function normalizePage(data: any): Page {
  const original = data.generated_image_url || data.generated_image_path;
  const preview = data.preview_image_url || data.cached_image_url || original;
  return {
    ...data,
    id: data.page_id || data.id,
    generated_image_path: original,
    preview_image_path: preview,
  };
}

/**
 * 防抖函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * 节流函数
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * 下载文件
 */
export function downloadFile(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/**
 * 格式化日期
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const lang = localStorage.getItem('i18nextLng') || navigator.language || 'zh-CN';
  const locale = lang.startsWith('zh') ? 'zh-CN' : 'en-US';
  return date.toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 生成唯一ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 将错误消息转换为友好的中英文提示
 */
export function normalizeErrorMessage(errorMessage: string | null | undefined): string {
  const lang = localStorage.getItem('i18nextLng') || navigator.language || 'zh';
  const isZh = lang.startsWith('zh');

  if (!errorMessage) return isZh ? '操作失败' : 'Operation failed';

  const message = errorMessage.toLowerCase();

  // Handle specific error messages
  if (message.includes('no template image found')) {
    return isZh
      ? '当前项目还没有模板，请先点击页面工具栏的"更换模板"按钮，选择或上传一张模板图片后再生成。'
      : 'No template found. Please select or upload a template image first.';
  } else if (message.includes('page must have outline content first')) {
    return isZh
      ? '该页暂未保存大纲。现在已支持无大纲流程：请直接填写并保存页面描述后再生成。'
      : 'This page has no saved outline. Outline is optional now; please save page description and retry.';
  } else if (message.includes('page must have generated image first')) {
    return isZh
      ? '当前页面还没有已生成图片，系统将自动切换为文生图模式。若仍失败，请先补充页面描述后重试。'
      : 'This page has no generated image yet. The system should fall back to text-to-image mode.';
  } else if (message.includes('edit_instruction is required')) {
    return isZh
      ? '编辑指令为空时将自动切换为文生图模式。若仍失败，请补充页面描述后重试。'
      : 'Empty edit instruction should fall back to text-to-image mode.';
  } else if (
    message.includes('page must have description content') ||
    message.includes('no saved description content for page') ||
    message.includes('no saved description text for page')
  ) {
    return isZh
      ? '后端读取到该页尚无“已保存”的描述内容。若你刚在弹窗里修改，请先保存（或等待自动保存完成）后再生成。'
      : 'No saved description was found for this page. If you just edited it in the modal, save it first and retry.';
  } else if (message.includes('image already exists')) {
    return isZh
      ? '该页面已经有图片，如需重新生成，请在生成时选择"重新生成"或稍后重试。'
      : 'Image already exists. Choose "Regenerate" to create a new one.';
  }

  // Handle HTTP error codes
  if (message.includes('503') || message.includes('service unavailable')) {
    return isZh ? 'AI 服务暂时不可用，请稍后重试。如果问题持续，请检查设置页的 API 配置。' : 'AI service temporarily unavailable. Please try again later.';
  } else if (message.includes('500') || message.includes('internal server error')) {
    return isZh ? '服务器内部错误，请稍后重试。' : 'Internal server error. Please try again later.';
  } else if (message.includes('502') || message.includes('bad gateway')) {
    return isZh ? '网关错误，请稍后重试。' : 'Bad gateway. Please try again later.';
  } else if (message.includes('504') || message.includes('gateway timeout')) {
    return isZh ? '请求超时，请稍后重试。' : 'Gateway timeout. Please try again later.';
  } else if (message.includes('429') || message.includes('too many requests')) {
    return isZh ? '请求过于频繁，请稍后重试。' : 'Too many requests. Please try again later.';
  } else if (message.includes('401') || message.includes('unauthorized')) {
    return isZh ? '认证失败，请检查 API 密钥配置。' : 'Authentication failed. Please check API key settings.';
  } else if (message.includes('403') || message.includes('forbidden')) {
    return isZh ? '访问被拒绝，请检查 API 权限配置。' : 'Access denied. Please check API permissions.';
  } else if (message.includes('aspect_ratio') || message.includes('aspect ratio')) {
    return isZh
      ? '当前画面比例不被该模型支持，请在项目设置中尝试其他画面比例后重试。'
      : 'The selected aspect ratio is not supported by this model. Please try a different ratio in project settings.';
  } else if (message.includes('network error') || message.includes('econnrefused')) {
    return isZh ? '网络连接失败，请检查网络或后端服务是否正常运行。' : 'Network error. Please check your connection.';
  } else if (message.includes('timeout')) {
    return isZh ? '请求超时，请稍后重试。' : 'Request timed out. Please try again later.';
  }

  return errorMessage;
}
