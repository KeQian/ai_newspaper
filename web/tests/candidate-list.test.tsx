import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CandidateList } from '@/components/admin/candidate-list';

describe('candidate list states', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders traceable candidate data returned by the admin API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          items: [
            {
              id: '10000000-0000-4000-8000-000000000001',
              title: '模型平台发布重要更新',
              factSummary: '官方发布页确认了本次更新。',
              occurredAt: '2026-09-12T08:00:00.000Z',
              status: 'review',
              verification: 'confirmed',
              importance: 5,
              confidence: 0.92,
              riskFlags: ['prompt_injection_suspected'],
              sourceCount: 2,
              primarySource: 'Official source',
              deferredUntil: null,
              createdAt: '2026-09-12T08:00:00.000Z',
              version: 1,
            },
          ],
          hasMore: false,
          nextCursor: null,
        }),
      ),
    );
    render(<CandidateList />);
    expect(
      await screen.findByRole('link', { name: '模型平台发布重要更新' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Official source')).toBeInTheDocument();
    expect(screen.getByText('2 个来源')).toBeInTheDocument();
  });

  it('distinguishes an empty queue from an unavailable API', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ items: [], hasMore: false, nextCursor: null }),
      )
      .mockResolvedValueOnce(
        Response.json({ message: 'Unavailable' }, { status: 503 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { unmount } = render(<CandidateList />);
    expect(await screen.findByText('暂无新候选')).toBeInTheDocument();
    unmount();
    render(<CandidateList />);
    await waitFor(() =>
      expect(screen.getByText('候选池暂时不可用')).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });
});
