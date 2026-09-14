import type { Metadata } from 'next';
import { ArrowRight, Filter, RotateCcw } from 'lucide-react';

import { PageContainer } from '@/components/site/page-container';
import { SiteFooter } from '@/components/site/site-footer';
import { VerificationBadge, contentHref } from '@/components/site/story-card';
import { SiteHeader } from '@/components/site/site-header';
import { buttonVariants } from '@/components/ui/button';
import { loadPublicList } from '@/lib/public-content/page-data';
import type { PublicContentListItem } from '@/lib/public-content/types';
import { cn } from '@/lib/utils';

export const revalidate = 300;

export const metadata: Metadata = {
  title: '最新动态',
  description: '按时间、主题、重要度和核验状态浏览最新 AI 行业动态。',
  alternates: { canonical: '/latest' },
};

type Search = {
  type?: string;
  topic?: string;
  verification?: string;
  importanceMin?: string;
  source?: string;
  from?: string;
  to?: string;
  cursor?: string;
};

export default async function LatestPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const search = await searchParams;
  const data = await loadPublicList(toQuery(search));
  const groups = groupItems(data.items);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader current="latest" />
      <main id="main-content">
        <PageContainer className="py-8 sm:py-12">
          <header className="border-b-2 border-foreground pb-7">
            <p className="eyebrow">LATEST SIGNALS</p>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                  最新动态
                </h1>
                <p className="mt-3 text-muted-foreground">
                  按发布时间倒序展示，不使用个性化推荐。
                </p>
              </div>
              {data.items[0] ? (
                <time
                  className="font-mono text-xs text-muted-foreground"
                  dateTime={data.items[0].updatedAt.toISOString()}
                >
                  最近更新 {formatDateTime(data.items[0].updatedAt)}
                </time>
              ) : null}
            </div>
          </header>

          <FilterForm search={search} topics={data.topics} />

          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div>
              {data.state === 'unavailable' ? (
                <State
                  title="动态暂时无法读取"
                  description="公开内容服务正在恢复，请稍后重试。"
                  retry
                />
              ) : data.state === 'invalid' ? (
                <State
                  title="筛选条件无效"
                  description="请清除筛选后重新选择日期或条件。"
                  clear
                />
              ) : data.state === 'empty' ? (
                <State
                  title="没有符合条件的动态"
                  description={activeFilterSummary(search)}
                  clear
                />
              ) : (
                <>
                  {groups.map((group) => (
                    <section key={group.label} className="mb-12">
                      <h2 className="border-b border-foreground pb-3 text-xl font-bold">
                        {group.label}
                      </h2>
                      <ol className="divide-y divide-border">
                        {group.items.map((item) => (
                          <LatestItem key={item.id} item={item} />
                        ))}
                      </ol>
                    </section>
                  ))}
                  {data.nextCursor ? (
                    <a
                      href={withCursor(search, data.nextCursor)}
                      className={cn(
                        buttonVariants({ variant: 'outline', size: 'lg' }),
                        'w-full',
                      )}
                    >
                      加载更多 <ArrowRight />
                    </a>
                  ) : (
                    <p className="border-t border-border pt-5 text-center text-sm text-muted-foreground">
                      已显示当前范围内的全部内容
                    </p>
                  )}
                </>
              )}
            </div>
            <aside className="space-y-8 lg:sticky lg:top-24 lg:self-start">
              <div className="border-t-2 border-foreground pt-4">
                <p className="eyebrow">QUICK FILTERS</p>
                <h2 className="mt-2 text-lg font-bold">快速查看</h2>
                <div className="mt-4 flex flex-col items-start gap-2">
                  <a
                    href="/latest?importanceMin=4"
                    className="text-sm font-semibold hover:text-primary"
                  >
                    只看重要动态
                  </a>
                  <a
                    href="/latest?verification=confirmed"
                    className="text-sm font-semibold hover:text-primary"
                  >
                    只看已确认
                  </a>
                </div>
              </div>
              <div className="border-t border-border pt-5">
                <h2 className="font-bold">今日主题</h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {data.topics.slice(0, 6).map((topic) => (
                    <li key={topic.id} className="flex justify-between gap-3">
                      <a
                        href={`/topics/${topic.slug}`}
                        className="hover:text-primary hover:underline"
                      >
                        {topic.name}
                      </a>
                      <span className="font-mono text-muted-foreground">
                        {topic.contentCount}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border-t border-border pt-5">
                <h2 className="font-bold">免费日报</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  每天只发送编辑核验后的重点变化。
                </p>
                <a href="/newsletter" className={cn(buttonVariants(), 'mt-4')}>
                  订阅日报
                </a>
              </div>
            </aside>
          </div>
        </PageContainer>
      </main>
      <SiteFooter />
    </div>
  );
}

function FilterForm({
  search,
  topics,
}: {
  search: Search;
  topics: Array<{ id: string; slug: string; name: string }>;
}) {
  return (
    <form
      action="/latest"
      className="mt-6 grid gap-4 border-b border-border pb-6 sm:grid-cols-2 lg:grid-cols-6"
    >
      <Select
        name="type"
        label="内容类型"
        value={search.type}
        options={[
          ['', '全部类型'],
          ['news', '快讯'],
          ['analysis', '深度'],
          ['briefing', '日报'],
        ]}
      />
      <Select
        name="topic"
        label="主题"
        value={search.topic}
        options={[
          ['', '全部主题'],
          ...topics.map(
            (topic) => [topic.slug, topic.name] as [string, string],
          ),
        ]}
      />
      <Select
        name="verification"
        label="核验状态"
        value={search.verification}
        options={[
          ['', '全部状态'],
          ['confirmed', '已核验'],
          ['developing', '持续核验'],
          ['unverified', '待核验'],
        ]}
      />
      <Select
        name="importanceMin"
        label="最低重要度"
        value={search.importanceMin}
        options={[
          ['', '不限'],
          ['4', '4–5'],
          ['5', '仅 5'],
        ]}
      />
      <label className="text-xs font-semibold">
        起始日期
        <input
          name="from"
          type="date"
          defaultValue={search.from}
          className="mt-2 h-10 w-full rounded-sm border bg-background px-3 text-sm"
        />
      </label>
      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1 text-xs font-semibold">
          结束日期
          <input
            name="to"
            type="date"
            defaultValue={search.to}
            className="mt-2 h-10 w-full rounded-sm border bg-background px-3 text-sm"
          />
        </label>
        <button
          className={buttonVariants({ size: 'icon' })}
          aria-label="应用筛选"
        >
          <Filter />
        </button>
      </div>
      <label className="text-xs font-semibold sm:col-span-2">
        来源发布方
        <input
          name="source"
          defaultValue={search.source}
          placeholder="例如 OpenAI"
          className="mt-2 h-10 w-full rounded-sm border bg-background px-3 text-sm"
        />
      </label>
    </form>
  );
}

function Select({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value?: string;
  options: Array<[string, string]>;
}) {
  return (
    <label className="text-xs font-semibold">
      {label}
      <select
        name={name}
        defaultValue={value ?? ''}
        className="mt-2 h-10 w-full rounded-sm border bg-background px-3 text-sm"
      >
        {options.map(([optionValue, text]) => (
          <option key={optionValue} value={optionValue}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function LatestItem({ item }: { item: PublicContentListItem }) {
  return (
    <li
      className={cn(
        'py-6 pl-4',
        item.importance >= 4 && 'border-l-4 border-l-primary',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <time
          className="font-mono text-xs text-muted-foreground"
          dateTime={item.publishedAt.toISOString()}
        >
          {formatClock(item.publishedAt)}
        </time>
        <VerificationBadge status={item.verification} />
        <span className="text-xs text-muted-foreground">
          重要度 {item.importance}
        </span>
      </div>
      <a
        href={contentHref(item)}
        className="mt-3 block text-xl font-bold leading-8 hover:text-primary hover:underline"
      >
        {item.title}
      </a>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
        {(item.dek || item.summary).slice(0, 120)}
      </p>
      <p className="mt-3 text-sm">
        <span className="font-semibold">为什么重要：</span>
        {item.summary}
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>{item.sourceCount} 个来源</span>
        {item.topics.map((topic) => (
          <a
            key={topic.id}
            href={`/topics/${topic.slug}`}
            className="hover:text-primary hover:underline"
          >
            #{topic.name}
          </a>
        ))}
      </div>
    </li>
  );
}

function State({
  title,
  description,
  retry,
  clear,
}: {
  title: string;
  description: string;
  retry?: boolean;
  clear?: boolean;
}) {
  return (
    <section className="border-y border-border py-14 text-center">
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="mt-3 text-sm text-muted-foreground">{description}</p>
      {retry || clear ? (
        <a
          href="/latest"
          className={cn(buttonVariants({ variant: 'outline' }), 'mt-6')}
        >
          <RotateCcw />
          {retry ? '重新加载' : '清除筛选'}
        </a>
      ) : null}
    </section>
  );
}

function toQuery(search: Search) {
  return {
    type: search.type,
    topic: search.topic,
    verification: search.verification,
    importanceMin: search.importanceMin,
    source: search.source,
    from: dayBoundary(search.from, false),
    to: dayBoundary(search.to, true),
    cursor: search.cursor,
    limit: 20,
  };
}
function dayBoundary(value: string | undefined, end: boolean) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${end ? '23:59:59.999' : '00:00:00.000'}+08:00`
    : value;
}
function withCursor(search: Search, cursor: string) {
  const params = new URLSearchParams(
    Object.entries({ ...search, cursor }).filter(
      (entry): entry is [string, string] => Boolean(entry[1]),
    ),
  );
  return `/latest?${params}`;
}
function activeFilterSummary(search: Search) {
  const count = Object.values(search).filter(Boolean).length;
  return count
    ? `当前 ${count} 项筛选没有匹配内容，请清除筛选后重试。`
    : '编辑正在准备首批公开内容。';
}
function groupItems(items: PublicContentListItem[]) {
  const today = shanghaiDate(new Date());
  const yesterday = shanghaiDate(new Date(Date.now() - 86400000));
  const groups = new Map<string, PublicContentListItem[]>();
  for (const item of items) {
    const date = shanghaiDate(item.publishedAt);
    const label =
      date === today ? '今天' : date === yesterday ? '昨天' : '更早';
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return [...groups].map(([label, grouped]) => ({ label, items: grouped }));
}
function shanghaiDate(value: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}
function formatClock(value: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value);
}
function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}
