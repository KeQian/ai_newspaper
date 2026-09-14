import type { Metadata } from 'next';
import { ArrowRight, Clock3, RotateCcw } from 'lucide-react';

import { PageContainer } from '@/components/site/page-container';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { StoryCard, contentHref } from '@/components/site/story-card';
import { buttonVariants } from '@/components/ui/button';
import { loadHomeData } from '@/lib/public-content/page-data';
import { cn } from '@/lib/utils';

export const revalidate = 300;

export const metadata: Metadata = {
  title: { absolute: 'AI Signal｜可验证的中文 AI 行业动态' },
  description:
    '为中文 AI 从业者提供来源可追溯、经过编辑核验的热点动态、影响判断与深度分析。',
  alternates: { canonical: '/' },
};

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ topic?: string }>;
}) {
  const topic = (await searchParams)?.topic;
  const data = await loadHomeData(topic);
  const primary = data.headlines[0];
  const date = formatToday();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader current="home" />
      <main id="main-content">
        <PageContainer className="py-6 sm:py-10">
          <section className="border-b-2 border-foreground pb-6">
            <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-end">
              <div>
                <p className="font-mono text-sm font-semibold tabular-nums">
                  {date.full}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {date.weekday} · 北京时间
                </p>
              </div>
              <div className="lg:border-l lg:border-border lg:pl-8">
                <p className="eyebrow">TODAY&apos;S SIGNAL</p>
                <p className="mt-2 max-w-3xl text-lg font-semibold leading-7">
                  {primary
                    ? judgement(primary.title)
                    : '编辑正在核验今天值得关注的变化。'}
                </p>
              </div>
            </div>
          </section>

          {data.state === 'unavailable' ? (
            <DataState
              title="内容暂时无法读取"
              description="公开内容服务正在恢复，请稍后重试。"
              retry
            />
          ) : data.state === 'empty' ? (
            <DataState
              title="今天的内容正在核验"
              description="首批内容发布后，这里将按重要度展示今日必读和最新动态。"
            />
          ) : (
            <>
              {isStale(data.lastUpdatedAt) ? <StaleNotice /> : null}
              <section className="mt-8" aria-labelledby="today-heading">
                <div className="mb-5 flex items-end justify-between gap-4">
                  <div>
                    <p className="eyebrow">EDITOR&apos;S PICK</p>
                    <h1
                      id="today-heading"
                      className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl"
                    >
                      今日必读
                    </h1>
                  </div>
                  {data.lastUpdatedAt ? (
                    <p className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
                      <Clock3 className="size-3.5" aria-hidden="true" />
                      更新于 {formatTime(data.lastUpdatedAt)}
                    </p>
                  ) : null}
                </div>
                <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
                  <StoryCard item={primary!} featured index={1} />
                  <div>
                    {data.headlines.slice(1).map((item, index) => (
                      <StoryCard key={item.id} item={item} index={index + 2} />
                    ))}
                  </div>
                </div>
              </section>

              <section className="mt-16" aria-labelledby="radar-heading">
                <div className="flex flex-col gap-4 border-b-2 border-foreground pb-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="eyebrow">LIVE DESK</p>
                    <h2
                      id="radar-heading"
                      className="mt-2 text-2xl font-bold sm:text-3xl"
                    >
                      今日 AI 雷达
                    </h2>
                  </div>
                  <nav
                    aria-label="雷达主题筛选"
                    className="flex flex-wrap gap-2"
                  >
                    <a
                      href="/"
                      aria-current={!topic ? 'page' : undefined}
                      className={filterClass(!topic)}
                    >
                      全部
                    </a>
                    {data.topics.slice(0, 4).map((item) => (
                      <a
                        key={item.id}
                        href={`/?topic=${encodeURIComponent(item.slug)}`}
                        aria-current={topic === item.slug ? 'page' : undefined}
                        className={filterClass(topic === item.slug)}
                      >
                        {item.name}
                      </a>
                    ))}
                  </nav>
                </div>
                {data.radar.length ? (
                  <ol className="divide-y divide-border">
                    {data.radar.map((item, index) => (
                      <li
                        key={item.id}
                        className="grid gap-3 py-5 sm:grid-cols-[70px_minmax(0,1fr)_180px] sm:items-start"
                      >
                        <time
                          className="font-mono text-sm tabular-nums text-muted-foreground"
                          dateTime={item.publishedAt.toISOString()}
                        >
                          {formatClock(item.publishedAt)}
                        </time>
                        <div>
                          <a
                            href={contentHref(item)}
                            className="text-base font-semibold leading-7 hover:text-primary hover:underline"
                          >
                            {item.title}
                          </a>
                          <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                            {item.dek || item.summary}
                          </p>
                        </div>
                        <div className="flex gap-3 text-xs text-muted-foreground sm:justify-end">
                          <span>重要度 {item.importance}</span>
                          <span>{item.sourceCount} 来源</span>
                          <span className="font-mono">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <DataState
                    title="该主题暂无今日动态"
                    description="可以切换到全部动态，或稍后回来查看。"
                  />
                )}
              </section>

              <section className="mt-16 grid gap-10 border-t border-border pt-8 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
                <div>
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="eyebrow">ANALYSIS</p>
                      <h2 className="mt-2 text-2xl font-bold">深度分析</h2>
                    </div>
                    <a
                      href="/latest?type=analysis"
                      className="inline-flex items-center gap-1 text-sm font-semibold hover:text-primary"
                    >
                      查看全部 <ArrowRight className="size-4" />
                    </a>
                  </div>
                  {data.analyses.length ? (
                    <div className="mt-5 grid gap-x-6 sm:grid-cols-2">
                      {data.analyses.map((item, index) => (
                        <StoryCard
                          key={item.id}
                          item={item}
                          index={index + 1}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-6 text-sm text-muted-foreground">
                      编辑正在准备首批深度分析。
                    </p>
                  )}
                </div>
                <aside>
                  <p className="eyebrow">WATCHLIST</p>
                  <h2 className="mt-2 text-2xl font-bold">持续观察</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    以下是近期公开内容涉及最多的主题，不代表实时热度或涨跌。
                  </p>
                  <ol className="mt-5 border-t border-foreground">
                    {data.topics.map((item, index) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between border-b border-border py-4"
                      >
                        <a
                          href={`/topics/${item.slug}`}
                          className="font-semibold hover:text-primary hover:underline"
                        >
                          {item.name}
                        </a>
                        <span className="font-mono text-xs text-muted-foreground">
                          {String(index + 1).padStart(2, '0')} · {item.count} 篇
                        </span>
                      </li>
                    ))}
                  </ol>
                </aside>
              </section>
            </>
          )}

          <section className="mt-16 grid gap-6 border-y-2 border-foreground py-8 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div>
              <p className="eyebrow">NEWSLETTER</p>
              <h2 className="mt-2 text-2xl font-bold">
                把重要变化留给编辑筛选
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                订阅免费日报。只发送经过来源核验的重点内容，不需要注册账户。
              </p>
            </div>
            <a
              href="/newsletter"
              className={cn(buttonVariants({ size: 'lg' }))}
            >
              订阅日报 <ArrowRight />
            </a>
          </section>
        </PageContainer>
      </main>
      <SiteFooter />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJson(homeJsonLd(data.headlines)),
        }}
      />
    </div>
  );
}

function DataState({
  title,
  description,
  retry = false,
}: {
  title: string;
  description: string;
  retry?: boolean;
}) {
  return (
    <section className="my-12 border-y border-border py-16 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{description}</p>
      {retry ? (
        <a
          href="/"
          className={cn(buttonVariants({ variant: 'outline' }), 'mt-6')}
        >
          <RotateCcw />
          重新加载
        </a>
      ) : null}
    </section>
  );
}

function filterClass(active: boolean) {
  return cn(
    'rounded-sm border px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    active
      ? 'border-foreground bg-foreground text-background'
      : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground',
  );
}

function StaleNotice() {
  return (
    <aside
      className="mt-6 border-l-4 border-[var(--warning)] bg-card px-4 py-3 text-sm"
      aria-label="数据更新提示"
    >
      当前展示的是最近一次成功更新的数据；编辑与采集服务正在恢复。
    </aside>
  );
}

function isStale(value: Date | null) {
  return value ? Date.now() - value.getTime() > 24 * 60 * 60 * 1000 : false;
}

function formatToday() {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    full: `${get('year')}.${get('month')}.${get('day')}`,
    weekday: get('weekday'),
  };
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
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

function judgement(title: string) {
  return `今日重点：${title}`.slice(0, 36);
}

function homeJsonLd(items: Array<{ title: string; slug: string }>) {
  const origin = process.env.PUBLIC_SITE_URL?.replace(/\/$/, '');
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: 'AI Signal',
        ...(origin ? { url: origin } : {}),
      },
      {
        '@type': 'WebSite',
        name: 'AI Signal',
        inLanguage: 'zh-CN',
        ...(origin ? { url: origin } : {}),
      },
      {
        '@type': 'ItemList',
        itemListElement: items.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.title,
          ...(origin ? { url: `${origin}/news/${item.slug}` } : {}),
        })),
      },
    ],
  };
}

function safeJson(value: unknown) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}
