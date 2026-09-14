import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContentList } from '@/components/admin/content-list';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('content list', () => {
  it('renders workflow status, author, source health and an accessible edit link', async () => {
    window.history.replaceState({}, '', '/admin/content?status=in_review');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [
              {
                id: '10000000-0000-4000-8000-000000000001',
                type: 'news',
                title: '模型发布动态',
                status: 'in_review',
                authorName: 'Editor',
                updatedAt: '2026-09-12T08:00:00Z',
                scheduledAt: null,
                publishedAt: null,
                sourceHealth: 'healthy',
                version: 2,
              },
            ],
            hasMore: false,
            nextCursor: null,
          }),
          { status: 200 },
        ),
      ),
    );
    render(<ContentList />);
    expect(
      await screen.findByRole('link', { name: '模型发布动态' }),
    ).toHaveAttribute(
      'href',
      '/admin/content/10000000-0000-4000-8000-000000000001',
    );
    expect(screen.getAllByText('审核中')).toHaveLength(2);
    expect(screen.getByText('Editor')).toBeInTheDocument();
    expect(screen.getByText('正常')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '审核中' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('shows a recoverable API error state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 503 })),
    );
    render(<ContentList />);
    await waitFor(() =>
      expect(screen.getByText('内容列表暂时不可用')).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /重试/ })).toBeInTheDocument();
  });
});
