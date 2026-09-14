import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/public-content/page-data', () => ({
  loadHomeData: vi.fn(async () => ({
    state: 'ready',
    headlines: [story('first-story', '第一条已核验动态', 5)],
    radar: [story('first-story', '第一条已核验动态', 5)],
    analyses: [],
    topics: [
      {
        id: '20000000-0000-4000-8000-000000000002',
        slug: 'foundation-models',
        name: '基础模型',
        count: 1,
      },
    ],
    lastUpdatedAt: new Date('2026-09-12T08:00:00Z'),
  })),
}));

import Home from '@/app/page';

describe('home foundation', () => {
  it('renders the editorial hierarchy and transparent topic metric', async () => {
    render(await Home({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole('heading', { level: 1, name: '今日必读' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('第一条已核验动态')).toHaveLength(2);
    expect(screen.getByText(/不代表实时热度或涨跌/)).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: '主导航' }),
    ).toBeInTheDocument();
  });
});

function story(slug: string, title: string, importance: number) {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    type: 'news' as const,
    slug,
    title,
    dek: '面向从业者的关键信息',
    summary: '一条可追溯的内容摘要。',
    status: 'published' as const,
    verification: 'confirmed' as const,
    importance,
    actionability: 4,
    authorName: '编辑部',
    publishedAt: new Date('2026-09-12T08:00:00Z'),
    updatedAt: new Date('2026-09-12T08:00:00Z'),
    aiDisclosure: null,
    seo: {},
    topics: [],
    sourceCount: 1,
  };
}
