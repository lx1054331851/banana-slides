import { describe, expect, it } from 'vitest';
import { applyPresentationMetaToDescription } from '@/utils/projectUtils';
import type { CoverEndingFieldDetect, PresentationMeta } from '@/types';

describe('applyPresentationMetaToDescription', () => {
  it('overrides existing presenter line with user input even when field is already present', () => {
    const description = [
      '页面标题：同价位更高体验必须用“可复制的低维护”来赢：2027优衣库衬衫面料开发路线图',
      '',
      '页面文字：',
      '- 覆盖四条主线：棉免烫/棉弹/针织免烫/亚麻抗皱',
      '- 量产落地：指标体系+证据链+JIT+风控SOP',
      '- 汇报人：供应商策略与研发团队｜2026.03',
      '',
      '其他页面素材：',
      '- 无',
    ].join('\n');

    const meta: PresentationMeta = {
      presenter: '李鑫',
    };

    const detectFields: CoverEndingFieldDetect[] = [
      {
        key: 'presenter',
        page_role: 'cover',
        present: true,
        value: '供应商策略与研发团队',
        is_placeholder: false,
      },
    ];

    const updated = applyPresentationMetaToDescription(description, meta, {
      pageRole: 'cover',
      detectFields,
    });

    expect(updated).toContain('汇报人：李鑫｜2026.03');
    expect(updated).not.toContain('汇报人：供应商策略与研发团队');
  });

  it('appends missing contact fields into 页面文字 block', () => {
    const description = [
      '页面标题：测试页',
      '',
      '页面文字：',
      '- 仅有主内容',
      '',
      '其他页面素材：',
      '- 无',
    ].join('\n');

    const meta: PresentationMeta = {
      phone: '18813185524',
      website_or_email: 'lixin@ctic.org.cn',
    };

    const updated = applyPresentationMetaToDescription(description, meta, {
      pageRole: 'cover',
      detectFields: [],
    });

    expect(updated).toContain('联系电话：18813185524');
    expect(updated).toContain('网址/邮箱：lixin@ctic.org.cn');
  });
});
