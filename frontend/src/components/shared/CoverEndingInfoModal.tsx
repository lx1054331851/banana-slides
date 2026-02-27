import React, { useMemo, useState, useEffect } from 'react';
import { Upload, Image as ImageIcon, Trash2 } from 'lucide-react';
import { Button, Input, Modal, Textarea, useToast, MaterialSelector } from '@/components/shared';
import { uploadMaterial, type Material } from '@/api/endpoints';
import { getImageUrl } from '@/api/client';
import type { CoverEndingFieldDetect, PresentationMeta } from '@/types';

interface FieldDef {
  key: keyof PresentationMeta | 'logo';
  label: string;
  roles: Array<'cover' | 'ending'>;
  type?: 'text' | 'textarea' | 'logo';
}

const FIELD_DEFS: FieldDef[] = [
  { key: 'logo', label: 'Logo', roles: ['cover', 'ending'], type: 'logo' },
  { key: 'company_name', label: '公司名称', roles: ['cover', 'ending'], type: 'text' },
  { key: 'project_name', label: '项目名', roles: ['cover'], type: 'text' },
  { key: 'presenter', label: '汇报人', roles: ['cover', 'ending'], type: 'text' },
  { key: 'presenter_title', label: '部门/职位', roles: ['cover', 'ending'], type: 'text' },
  { key: 'date', label: '日期', roles: ['cover'], type: 'text' },
  { key: 'location', label: '地点', roles: ['cover'], type: 'text' },
  { key: 'phone', label: '联系电话', roles: ['cover', 'ending'], type: 'text' },
  { key: 'website_or_email', label: '网址/邮箱', roles: ['cover', 'ending'], type: 'text' },
  { key: 'thanks_or_slogan', label: '致谢/口号', roles: ['ending'], type: 'textarea' },
];

interface CoverEndingInfoModalProps {
  isOpen: boolean;
  detectFields: CoverEndingFieldDetect[];
  initialMeta: PresentationMeta;
  onSave: (meta: PresentationMeta) => Promise<void> | void;
  onSkip: () => void;
  onClose?: () => void;
  mode?: 'missing' | 'all';
  showSkip?: boolean;
  skipLabel?: string;
}

export const CoverEndingInfoModal: React.FC<CoverEndingInfoModalProps> = ({
  isOpen,
  detectFields,
  initialMeta,
  onSave,
  onSkip,
  onClose,
  mode = 'missing',
  showSkip = true,
  skipLabel = '跳过',
}) => {
  const { show } = useToast();
  const [form, setForm] = useState<PresentationMeta>(initialMeta || {});
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [isMaterialSelectorOpen, setIsMaterialSelectorOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm(initialMeta || {});
    }
  }, [isOpen, initialMeta]);

  const missingFields = useMemo(() => {
    return detectFields.filter(f => !f.present || f.is_placeholder);
  }, [detectFields]);

  const missingByRole = useMemo(() => {
    return {
      cover: missingFields.filter(f => f.page_role === 'cover'),
      ending: missingFields.filter(f => f.page_role === 'ending'),
    };
  }, [missingFields]);

  const getHint = (key: string, role: 'cover' | 'ending') => {
    const field = missingFields.find(f => f.key === key && f.page_role === role);
    if (!field || !field.is_placeholder || !field.placeholders?.length) return '';
    return `检测到占位符：${field.placeholders.join('，')}`;
  };

  const updateField = (key: keyof PresentationMeta, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleUploadLogo = async (file?: File | null) => {
    if (!file) return;
    setUploadingLogo(true);
    try {
      const response = await uploadMaterial(file, null);
      const url = response.data?.url;
      if (url) {
        updateField('logo_url', url);
        show({ message: 'Logo 上传成功，已保存到素材中心', type: 'success' });
      } else {
        show({ message: 'Logo 上传失败：未返回素材链接', type: 'error' });
      }
    } catch (error: any) {
      show({
        message: error?.response?.data?.error?.message || error.message || 'Logo 上传失败',
        type: 'error',
      });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSelectMaterial = (materials: Material[]) => {
    if (!materials.length) return;
    const url = materials[0].url;
    if (url) {
      updateField('logo_url', url);
      show({ message: '已选择素材作为 Logo', type: 'success' });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  const renderLogoField = (role: 'cover' | 'ending') => {
    const hint = getHint('logo', role);
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-gray-700 dark:text-foreground-secondary">Logo</div>
          <div className="text-xs text-gray-500 dark:text-foreground-tertiary">上传后保存到素材中心</div>
        </div>
        {form.logo_url ? (
          <div className="flex items-center gap-3 p-2 border border-gray-200 dark:border-border-primary rounded-lg bg-gray-50 dark:bg-background-secondary">
            <img
              src={getImageUrl(form.logo_url)}
              alt="Logo"
              className="w-20 h-12 object-contain bg-white rounded"
            />
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-foreground-secondary cursor-pointer">
                <Upload size={14} />
                更换
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleUploadLogo(e.target.files?.[0] || null)}
                  disabled={uploadingLogo}
                />
              </label>
              <Button
                variant="ghost"
                size="sm"
                icon={<ImageIcon size={14} />}
                onClick={() => setIsMaterialSelectorOpen(true)}
              >
                从素材中心选择
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={14} />}
                onClick={() => updateField('logo_url', '')}
              >
                移除
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-foreground-secondary bg-white dark:bg-background-secondary border border-gray-300 dark:border-border-primary rounded-md hover:bg-gray-50 dark:hover:bg-background-hover cursor-pointer">
              <Upload size={14} />
              {uploadingLogo ? '上传中...' : '上传 Logo'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleUploadLogo(e.target.files?.[0] || null)}
                disabled={uploadingLogo}
              />
            </label>
            <Button
              variant="ghost"
              size="sm"
              icon={<ImageIcon size={14} />}
              onClick={() => setIsMaterialSelectorOpen(true)}
            >
              从素材中心选择
            </Button>
          </div>
        )}
        {hint && <div className="text-xs text-orange-500">{hint}</div>}
      </div>
    );
  };

  const renderField = (def: FieldDef, role: 'cover' | 'ending') => {
    const hint = getHint(def.key, role);
    if (def.type === 'logo') return renderLogoField(role);
    if (def.type === 'textarea') {
      return (
        <div className="space-y-1">
          <Textarea
            label={def.label}
            rows={2}
            value={(form as any)[def.key] || ''}
            onChange={(e) => updateField(def.key as keyof PresentationMeta, (e.target as HTMLTextAreaElement).value)}
          />
          {hint && <div className="text-xs text-orange-500">{hint}</div>}
        </div>
      );
    }
    return (
      <div className="space-y-1">
        <Input
          label={def.label}
          value={(form as any)[def.key] || ''}
          onChange={(e) => updateField(def.key as keyof PresentationMeta, e.target.value)}
        />
        {hint && <div className="text-xs text-orange-500">{hint}</div>}
      </div>
    );
  };

  if (!isOpen) return null;

  const renderSection = (role: 'cover' | 'ending', title: string) => {
    const missingKeys = new Set(missingByRole[role].map(f => f.key));
    const defs = FIELD_DEFS.filter(def => def.roles.includes(role) && (mode === 'all' || missingKeys.has(def.key as string)));
    if (defs.length === 0) return null;
    return (
      <div className="space-y-4">
        <div className="text-sm font-semibold text-gray-900 dark:text-foreground-primary">{title}</div>
        <div className="space-y-4">
          {defs.map(def => (
            <div key={`${role}-${def.key}`}>
              {renderField(def, role)}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose || onSkip} title="补全封面与结尾信息" size="lg">
        <div className="space-y-6">
          {mode === 'missing' ? (
            <div className="text-sm text-gray-600 dark:text-foreground-tertiary">
              检测到封面或结尾页存在缺失/占位符信息。补全后可避免生成图片中的 mock 内容。
            </div>
          ) : (
            <div className="text-sm text-gray-600 dark:text-foreground-tertiary">
              在此查看或编辑封面/结尾信息，保存后会回填到对应页面描述中。
            </div>
          )}

          {renderSection('cover', '封面信息')}
          {renderSection('ending', '结尾信息')}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-border-primary">
            {showSkip && (
              <Button variant="ghost" onClick={onSkip} disabled={saving}>
                {skipLabel}
              </Button>
            )}
            <Button variant="primary" onClick={handleSave} disabled={saving || uploadingLogo}>
              {saving ? '保存中...' : mode === 'all' ? '保存' : '保存并继续'}
            </Button>
          </div>
        </div>
      </Modal>

      <MaterialSelector
        isOpen={isMaterialSelectorOpen}
        onClose={() => setIsMaterialSelectorOpen(false)}
        onSelect={handleSelectMaterial}
        multiple={false}
        maxSelection={1}
      />
    </>
  );
};
