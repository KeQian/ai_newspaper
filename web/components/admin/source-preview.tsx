'use client';

import { ArrowLeft, ExternalLink, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

import type { CandidateSummary } from './candidate-list';

type Source = {
  id: string;
  title: string;
  url: string;
  excerpt: string | null;
  publisher: string;
  reliability: string;
  relation: string;
  publishedAt: string | null;
};
type Detail = CandidateSummary & { documents: Source[] };

export function SourcePreview({
  candidateId,
  sourceId,
}: {
  candidateId: string;
  sourceId: string;
}) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/v1/admin/candidates/${candidateId}`, {
      credentials: 'same-origin',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('来源预览加载失败');
        return response.json() as Promise<Detail>;
      })
      .then(setData)
      .catch((reason: Error) => setError(reason.message));
  }, [candidateId]);
  if (error)
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <AlertTitle>无法打开来源</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  if (!data)
    return (
      <div className="space-y-3 p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  const source = data.documents.find((item) => item.id === sourceId);
  if (!source)
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <AlertTitle>来源不存在</AlertTitle>
          <AlertDescription>
            该来源不属于当前候选，或已不可用。
          </AlertDescription>
        </Alert>
      </div>
    );
  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-8">
      <a
        href={`/admin/candidates/${candidateId}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        返回候选详情
      </a>
      <Alert className="mt-6">
        <ShieldCheck aria-hidden="true" />
        <AlertTitle>隔离元数据预览</AlertTitle>
        <AlertDescription>
          这里只展示采集时保存的允许摘录，不加载来源网页脚本、图片或嵌入内容。
        </AlertDescription>
      </Alert>
      <article className="mt-6 rounded-lg border bg-card p-5 sm:p-8">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{source.publisher}</Badge>
          <Badge variant="outline">{source.relation}</Badge>
          <Badge variant="outline">{source.reliability.toUpperCase()}</Badge>
        </div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight">
          {source.title}
        </h1>
        <p className="mt-3 break-all font-mono text-xs text-muted-foreground">
          {source.url}
        </p>
        <div className="mt-8 border-t pt-6">
          <h2 className="text-sm font-semibold">允许摘录</h2>
          <p className="mt-3 whitespace-pre-wrap text-base leading-8">
            {source.excerpt ?? '该来源未保存允许摘录，请前往原始网站人工核验。'}
          </p>
        </div>
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        >
          在新窗口打开原始网站{' '}
          <ExternalLink className="size-4" aria-hidden="true" />
        </a>
      </article>
    </div>
  );
}
