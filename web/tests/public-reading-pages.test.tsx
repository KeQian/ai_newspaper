import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/public-content/page-data', () => ({
  loadPublicList: vi.fn(async () => ({
    state: 'ready',
    items: [story()],
    nextCursor: 'next-page',
    topics: [
      {
        id: '20000000-0000-4000-8000-000000000002',
        slug: 'foundation-models',
        name: '基础模型',
        description: '持续跟踪基础模型。',
        contentCount: 1,
        updatedAt: new Date('2026-09-12T08:00:00Z'),
      },
    ],
  })),
}));

import LatestPage from '@/app/latest/page';

describe('public reading pages', () => {
  it('renders a filtered latest timeline with explicit importance treatment', async () => {
    render(
      await LatestPage({
        searchParams: Promise.resolve({ importanceMin: '4' }),
      }),
    );
    expect(
      screen.getByRole('heading', { level: 1, name: '最新动态' }),
    ).toBeInTheDocument();
    expect(screen.getByText('为什么重要：')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /加载更多/ })).toHaveAttribute(
      'href',
      expect.stringContaining('cursor=next-page'),
    );
  });
});

function story() {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    type: 'news' as const,
    slug: 'test-story',
    title: '测试内容标题',
    dek: '简短导语',
    summary: '这项变化会影响产品与技术决策。',
    status: 'published' as const,
    verification: 'confirmed' as const,
    importance: 5,
    actionability: 4,
    authorName: '编辑部',
    publishedAt: new Date('2026-09-12T08:00:00Z'),
    updatedAt: new Date('2026-09-12T08:00:00Z'),
    aiDisclosure: null,
    seo: {},
    topics: [
      {
        id: '20000000-0000-4000-8000-000000000002',
        slug: 'foundation-models',
        name: '基础模型',
      },
    ],
    sourceCount: 1,
  };
}
