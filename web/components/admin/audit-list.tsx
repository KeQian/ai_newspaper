'use client';

import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

type AuditItem = {
  id: string;
  actorName: string | null;
  action: string;
  objectType: string;
  objectId: string;
  requestId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
};

export function AuditList({
  initialFilters,
}: {
  initialFilters: { action: string; objectType: string; requestId: string };
}) {
  const [items, setItems] = useState<AuditItem[] | null>(null);
  const [error, setError] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const load = useCallback(async (cursor?: string) => {
    setError('');
    try {
      const parameters = new URLSearchParams(window.location.search);
      if (cursor) parameters.set('cursor', cursor);
      const response = await fetch(`/api/v1/admin/audit?${parameters}`, {
        credentials: 'same-origin',
      });
      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? '需要管理员登录后查看审计日志。'
            : response.status === 403
              ? '仅 Admin 可查看审计日志。'
              : '审计数据暂时不可用。',
        );
      }
      const result = (await response.json()) as {
        items: AuditItem[];
        nextCursor: string | null;
      };
      setItems((current) =>
        cursor ? [...(current ?? []), ...result.items] : result.items,
      );
      setNextCursor(result.nextCursor);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : '审计数据暂时不可用。',
      );
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function filter(event: {
    preventDefault(): void;
    currentTarget: HTMLFormElement;
  }) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parameters = new URLSearchParams();
    for (const key of ['action', 'objectType', 'requestId']) {
      const entry = data.get(key);
      const value = typeof entry === 'string' ? entry.trim() : '';
      if (value) parameters.set(key, value);
    }
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}?${parameters}`,
    );
    setItems(null);
    void load();
  }

  return (
    <section className="px-4 pb-10 sm:px-6 lg:px-8">
      <form
        onSubmit={filter}
        className="grid gap-4 border bg-card p-4 sm:grid-cols-3 sm:items-end"
      >
        <div>
          <Label htmlFor="audit-action">动作</Label>
          <Input
            id="audit-action"
            name="action"
            placeholder="content.published"
            defaultValue={initialFilters.action}
          />
        </div>
        <div>
          <Label htmlFor="audit-object">对象类型</Label>
          <Input
            id="audit-object"
            name="objectType"
            placeholder="content_item"
            defaultValue={initialFilters.objectType}
          />
        </div>
        <div>
          <Label htmlFor="audit-request">Request ID</Label>
          <div className="flex gap-2">
            <Input
              id="audit-request"
              name="requestId"
              defaultValue={initialFilters.requestId}
            />
            <Button type="submit">筛选</Button>
          </div>
        </div>
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
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      )}
      {items?.length === 0 && (
        <p className="mt-6 border border-dashed p-8 text-center text-sm text-muted-foreground">
          没有匹配的审计记录。
        </p>
      )}
      {items && items.length > 0 && (
        <ol className="mt-6 divide-y border-y">
          {items.map((item) => (
            <li
              key={item.id}
              className="grid gap-3 py-5 lg:grid-cols-[180px_minmax(0,1fr)_260px]"
            >
              <div className="text-xs text-muted-foreground">
                <time dateTime={item.createdAt}>
                  {new Intl.DateTimeFormat('zh-CN', {
                    dateStyle: 'medium',
                    timeStyle: 'medium',
                    timeZone: 'Asia/Shanghai',
                  }).format(new Date(item.createdAt))}
                </time>
                <span className="mt-1 block">
                  {item.actorName ?? '系统任务'}
                </span>
              </div>
              <div className="min-w-0">
                <strong className="break-all font-mono text-sm">
                  {item.action}
                </strong>
                <p className="mt-1 break-all text-xs text-muted-foreground">
                  {item.objectType} · {item.objectId}
                </p>
                {(item.before || item.after) && (
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer">查看脱敏差异</summary>
                    <pre className="mt-2 max-h-72 overflow-auto border bg-muted p-3">
                      {JSON.stringify(
                        { before: item.before, after: item.after },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                )}
              </div>
              <code className="break-all text-xs text-muted-foreground">
                {item.requestId}
              </code>
            </li>
          ))}
        </ol>
      )}
      {nextCursor && (
        <Button
          variant="outline"
          className="mt-6"
          onClick={() => void load(nextCursor)}
        >
          加载更早记录
        </Button>
      )}
    </section>
  );
}
