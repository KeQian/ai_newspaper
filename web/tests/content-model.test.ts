// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  contentDraftInputSchema,
  richTextDocumentSchema,
} from '@/lib/content/model';

describe('content input model', () => {
  it('accepts the supported structured document and strict editorial metadata', () => {
    expect(contentDraftInputSchema.safeParse(draft()).success).toBe(true);
  });

  it('rejects script links, unknown node fields and nested lists', () => {
    const unsafeLink = document([
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'click',
            marks: [{ type: 'link', href: 'javascript:alert(1)' }],
          },
        ],
      },
    ]);
    expect(richTextDocumentSchema.safeParse(unsafeLink).success).toBe(false);

    const unknownField = document([
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'safe', html: '<script />' }],
      },
    ]);
    expect(richTextDocumentSchema.safeParse(unknownField).success).toBe(false);

    const nested = document([
      { type: 'bulletList', items: [[{ type: 'bulletList', items: [] }]] },
    ]);
    expect(richTextDocumentSchema.safeParse(nested).success).toBe(false);
  });

  it('validates editorial tables, charts, callouts and footnotes', () => {
    const rich = document([
      {
        type: 'table',
        caption: '模型对比',
        headers: ['模型', '分数'],
        rows: [
          ['A', '92'],
          ['B', '88'],
        ],
      },
      {
        type: 'chart',
        title: '采用率',
        summary: '样本口径为受访开发者。',
        unit: '%',
        data: [{ label: '团队 A', value: 42 }],
      },
      {
        type: 'callout',
        tone: 'warning',
        title: '样本限制',
        content: [{ type: 'text', text: '结果不能代表全部团队。' }],
      },
      {
        type: 'footnotes',
        items: [{ id: '1', text: '统计截至 2026 年 9 月。' }],
      },
    ]);
    expect(richTextDocumentSchema.safeParse(rich).success).toBe(true);
    expect(
      richTextDocumentSchema.safeParse(
        document([
          { type: 'table', headers: ['A', 'B'], rows: [['only one']] },
          {
            type: 'chart',
            title: 'Bad',
            summary: 'Bad',
            data: [{ label: 'A', value: Number.POSITIVE_INFINITY }],
          },
        ]),
      ).success,
    ).toBe(false);
  });
});

function draft() {
  return {
    type: 'news',
    title: 'OpenAI 发布新模型',
    dek: '面向开发者的新能力',
    summary: '官方发布了新的模型能力。',
    body: document([
      { type: 'paragraph', content: [{ type: 'text', text: '正文。' }] },
    ]),
    verification: 'confirmed',
    importance: 4,
    actionability: 4,
    sourceIds: ['20000000-0000-4000-8000-000000000002'],
    topicIds: ['30000000-0000-4000-8000-000000000003'],
    seo: {
      title: 'OpenAI 发布新模型',
      description: '了解官方发布的新模型能力。',
    },
    aiDisclosure: { assisted: true, note: 'AI 用于初稿整理，已由编辑核验。' },
    changeSummary: '创建首版',
  };
}

function document(content: Array<Record<string, unknown>>) {
  return { schemaVersion: 1 as const, type: 'doc' as const, content };
}
