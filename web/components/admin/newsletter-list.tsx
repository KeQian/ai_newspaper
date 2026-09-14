'use client';

import { MailPlus, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

type Issue = {
  id: string;
  issueDate: string;
  subject: string;
  status: string;
  version: number;
  queuedCount: number;
  deliveredCount: number;
  bouncedCount: number;
  complainedCount: number;
  unsubscribedCount: number;
};

export function NewsletterList() {
  const [items, setItems] = useState<Issue[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const response = await fetch('/api/v1/admin/newsletters', {
        credentials: 'same-origin',
      });
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? '需要管理员登录后查看 Newsletter。'
            : response.status === 403
              ? '当前角色没有查看权限。'
              : 'Newsletter 数据暂时不可用。',
        );
      setItems(((await response.json()) as { items: Issue[] }).items);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Newsletter 数据暂时不可用。',
      );
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function create(event: {
    preventDefault(): void;
    currentTarget: HTMLFormElement;
  }) {
    event.preventDefault();
    setCreating(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/v1/admin/newsletters', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          issueDate: data.get('issueDate'),
          subject: data.get('subject'),
          preheader: data.get('preheader'),
          body: {
            schemaVersion: 1,
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: '在这里写本期编辑导语。' }],
              },
            ],
          },
          contentIds: [],
        }),
      });
      const result = (await response.json()) as {
        id?: string;
        message?: string;
      };
      if (!response.ok || !result.id)
        throw new Error(result.message ?? '创建失败。');
      window.location.assign(`/admin/newsletters/${result.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '创建失败。');
      setCreating(false);
    }
  }

  return (
    <section className="px-4 pb-10 sm:px-6 lg:px-8">
      <form
        onSubmit={create}
        className="grid gap-4 border bg-card p-4 sm:grid-cols-[160px_minmax(220px,1fr)_minmax(220px,1fr)_auto] sm:items-end"
      >
        <div>
          <Label htmlFor="issue-date">期刊日期</Label>
          <Input id="issue-date" name="issueDate" type="date" required />
        </div>
        <div>
          <Label htmlFor="issue-subject">主题</Label>
          <Input id="issue-subject" name="subject" maxLength={160} required />
        </div>
        <div>
          <Label htmlFor="issue-preheader">预览文案</Label>
          <Input id="issue-preheader" name="preheader" maxLength={200} />
        </div>
        <Button type="submit" disabled={creating}>
          <MailPlus aria-hidden="true" />
          {creating ? '创建中' : '新建一期'}
        </Button>
      </form>
      {error && (
        <Alert variant="destructive" className="mt-5">
          <AlertTitle>无法加载</AlertTitle>
          <AlertDescription>
            {error}
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void load()}
            >
              <RefreshCw aria-hidden="true" />
              重试
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {!items && !error && (
        <div className="mt-6 space-y-3" aria-label="正在加载">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      )}
      {items?.length === 0 && (
        <p className="mt-6 border border-dashed p-8 text-center text-sm text-muted-foreground">
          还没有期刊草稿，从上方创建第一期。
        </p>
      )}
      {items && items.length > 0 && (
        <ul className="mt-6 divide-y border-y">
          {items.map((item) => (
            <li key={item.id}>
              <a
                href={`/admin/newsletters/${item.id}`}
                className="grid gap-3 py-4 hover:bg-muted/50 sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:items-center"
              >
                <span className="font-mono text-xs">{item.issueDate}</span>
                <span>
                  <strong>{item.subject}</strong>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    排队 {item.queuedCount} · 送达 {item.deliveredCount} · 退信{' '}
                    {item.bouncedCount} · 投诉 {item.complainedCount} · 退订{' '}
                    {item.unsubscribedCount}
                  </span>
                </span>
                <Badge variant="outline">{item.status}</Badge>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
