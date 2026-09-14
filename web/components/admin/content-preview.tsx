'use client';

import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

import { ContentBody } from './content-body';

type PreviewData = {
  id: string;
  title: string;
  dek: string;
  summary: string;
  body: Record<string, unknown>;
  status: string;
  verification: string;
  version: number;
  sources: Array<{ id: string; title: string; publisher: string; url: string }>;
};

export function ContentPreview({ id }: { id: string }) {
  const [item, setItem] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/admin/content/${id}`, {
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('预览数据加载失败。');
        return response.json() as Promise<PreviewData>;
      })
      .then(setItem)
      .catch((reason: Error) => {
        if (reason.name !== 'AbortError') setError(reason.message);
      });
    return () => controller.abort();
  }, [id]);
  if (error)
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>无法预览</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </main>
    );
  if (!item)
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </main>
    );
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:py-16">
      <a
        href={`/admin/content/${id}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        返回编辑
      </a>
      <div className="mt-8 flex flex-wrap gap-2">
        <Badge variant="outline">内部预览</Badge>
        <Badge variant="outline">{item.status}</Badge>
        <Badge variant="outline">{item.verification}</Badge>
        <Badge variant="outline">v{item.version}</Badge>
      </div>
      <article className="mt-6">
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          {item.title}
        </h1>
        {item.dek ? (
          <p className="mt-5 text-xl leading-8 text-muted-foreground">
            {item.dek}
          </p>
        ) : null}
        <p className="mt-8 rounded-lg border-l-4 border-primary bg-muted/40 p-5 font-medium leading-7">
          {item.summary}
        </p>
        <div className="mt-10">
          <ContentBody document={item.body} />
        </div>
        <footer className="mt-12 border-t pt-6">
          <h2 className="font-semibold">资料来源</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
            {item.sources.map((source) => (
              <li key={source.id}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium hover:text-primary hover:underline"
                >
                  {source.title}
                </a>
                <span className="text-muted-foreground">
                  {' '}
                  · {source.publisher}
                </span>
              </li>
            ))}
          </ol>
        </footer>
      </article>
    </main>
  );
}
