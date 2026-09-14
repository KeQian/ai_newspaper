'use client';

import { ArrowRight, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { highlight } from '@/components/site/search-command';
import { VerificationBadge } from '@/components/site/story-card';
import { buttonVariants } from '@/components/ui/button';
import type { PublicTopicSummary } from '@/lib/public-content/types';
import type { SearchPage } from '@/lib/search/types';
import { cn } from '@/lib/utils';

export function SearchResults({ params }: { params: Record<string, string> }) {
  const queryString = useMemo(
    () => new URLSearchParams(params).toString(),
    [params],
  );
  const [data, setData] = useState<SearchPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.q) return;
    const controller = new AbortController();
    fetch(`/api/v1/search?${queryString}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json()) as { code?: string };
          throw new Error(
            response.status === 429
              ? '搜索请求过于频繁，请稍后再试。'
              : body.code === 'BAD_REQUEST'
                ? '查询条件无效或超过 120 个字符。'
                : '搜索服务暂时不可用。',
          );
        }
        return response.json() as Promise<SearchPage>;
      })
      .then(setData)
      .catch((reason: Error) => {
        if (reason.name !== 'AbortError') setError(reason.message);
      });
    return () => controller.abort();
  }, [params.q, queryString]);

  if (!params.q) return <SearchStart />;
  if (error)
    return (
      <State title={error} description="你可以调整关键词，或先浏览最新动态。" />
    );
  if (!data) return <Loading />;
  if (!data.items.length)
    return (
      <div>
        <State
          title={`没有找到“${data.query}”`}
          description="请检查拼写、尝试更短的关键词，或浏览下方相关主题。"
        />
        <RelatedTopics topics={data.topics} />
      </div>
    );
  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div>
        <p
          className="border-b border-border pb-4 text-sm text-muted-foreground"
          aria-live="polite"
        >
          找到约 <strong className="text-foreground">{data.totalApprox}</strong>{' '}
          条结果
        </p>
        <ol className="divide-y divide-border">
          {data.items.map((item) => (
            <li key={item.id}>
              <article className="py-6">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{typeLabel(item.type)}</span>
                  <VerificationBadge status={item.verification} />
                  <time dateTime={new Date(item.publishedAt).toISOString()}>
                    {formatDate(item.publishedAt)}
                  </time>
                </div>
                <h2 className="mt-3 text-xl font-bold leading-7">
                  <a
                    href={hrefFor(item)}
                    className="hover:text-primary hover:underline"
                  >
                    {highlight(item.title, data.query)}
                  </a>
                </h2>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
                  {highlight(item.snippet, data.query)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.topics.map((topic) => (
                    <a
                      key={topic.id}
                      href={`/topics/${topic.slug}`}
                      className="border px-2 py-1 text-xs hover:border-foreground"
                    >
                      {topic.name}
                    </a>
                  ))}
                </div>
              </article>
            </li>
          ))}
        </ol>
        {data.nextCursor ? (
          <a
            href={nextPage(params, data.nextCursor)}
            className={cn(
              buttonVariants({ variant: 'outline', size: 'lg' }),
              'mt-6 w-full',
            )}
          >
            加载更多 <ArrowRight />
          </a>
        ) : (
          <p className="border-t pt-5 text-center text-sm text-muted-foreground">
            已显示全部结果
          </p>
        )}
      </div>
      <aside>
        <RelatedTopics topics={data.topics} />
        <a
          href="/latest"
          className={cn(buttonVariants({ variant: 'outline' }), 'mt-6')}
        >
          浏览最新动态
        </a>
      </aside>
    </div>
  );
}

export function SearchFilters({
  params,
  topics,
}: {
  params: Record<string, string>;
  topics: PublicTopicSummary[];
}) {
  return (
    <form
      method="get"
      action="/search"
      className="mt-7 grid gap-3 border-y border-border py-5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_150px_150px_150px_auto]"
    >
      <label>
        <span className="sr-only">搜索关键词</span>
        <span className="relative block">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
          <input
            name="q"
            required
            maxLength={120}
            defaultValue={params.q ?? ''}
            placeholder="事件、公司、产品、模型或主题"
            className="h-10 w-full border bg-card pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </span>
      </label>
      <label>
        <span className="sr-only">内容类型</span>
        <select
          name="type"
          defaultValue={params.type ?? ''}
          className="h-10 w-full border bg-card px-3 text-sm"
        >
          <option value="">全部类型</option>
          <option value="news">快讯</option>
          <option value="analysis">深度分析</option>
          <option value="briefing">日报</option>
        </select>
      </label>
      <label>
        <span className="sr-only">排序方式</span>
        <select
          name="sort"
          defaultValue={params.sort ?? 'relevance'}
          className="h-10 w-full border bg-card px-3 text-sm"
        >
          <option value="relevance">按相关性</option>
          <option value="latest">按最新</option>
        </select>
      </label>
      <label>
        <span className="sr-only">主题</span>
        <select
          name="topic"
          defaultValue={params.topic ?? ''}
          className="h-10 w-full border bg-card px-3 text-sm"
        >
          <option value="">全部主题</option>
          {topics.map((topic) => (
            <option key={topic.id} value={topic.slug}>
              {topic.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className={buttonVariants()}>
        搜索
      </button>
    </form>
  );
}

function SearchStart() {
  return (
    <State
      title="查找可信的 AI 上下文"
      description="搜索标题、摘要、正文，以及公司、产品、模型和主题别名。"
    />
  );
}
function State({ title, description }: { title: string; description: string }) {
  return (
    <section className="my-10 border-y border-border py-14 text-center">
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
        {description}
      </p>
      <a
        href="/latest"
        className={cn(buttonVariants({ variant: 'outline' }), 'mt-6')}
      >
        查看最新动态
      </a>
    </section>
  );
}
function Loading() {
  return (
    <div className="mt-8 space-y-4" aria-label="正在搜索">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="h-32 animate-pulse border-y bg-muted/60" />
      ))}
    </div>
  );
}
function RelatedTopics({ topics }: { topics: SearchPage['topics'] }) {
  if (!topics.length) return null;
  return (
    <section className="border-t-2 border-foreground pt-4">
      <h2 className="font-bold">相关主题</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {topics.map((topic) => (
          <li key={topic.id}>
            <a
              href={`/topics/${topic.slug}`}
              className="hover:text-primary hover:underline"
            >
              {topic.name} · {topic.contentCount}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
function nextPage(params: Record<string, string>, cursor: string) {
  const next = new URLSearchParams(params);
  next.set('cursor', cursor);
  return `/search?${next}`;
}
function hrefFor(item: SearchPage['items'][number]) {
  if (item.type === 'analysis') return `/analysis/${item.slug}`;
  if (item.type === 'briefing')
    return `/briefing/${formatBriefingDate(item.publishedAt)}`;
  return `/news/${item.slug}`;
}
function formatBriefingDate(value: Date | string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}
function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    dateStyle: 'medium',
  }).format(new Date(value));
}
function typeLabel(type: string) {
  return type === 'analysis'
    ? '深度分析'
    : type === 'briefing'
      ? '日报'
      : '快讯';
}
