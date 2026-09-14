import type { Metadata } from 'next';
import { ArrowLeft, ArrowRight, Clock3, ExternalLink } from 'lucide-react';
import { notFound } from 'next/navigation';

import { PageContainer } from '@/components/site/page-container';
import { RichText } from '@/components/site/rich-text';
import { ShareActions } from '@/components/site/share-actions';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { buttonVariants } from '@/components/ui/button';
import { briefingDateSchema } from '@/lib/public-content/model';
import { loadBriefingArchive } from '@/lib/public-content/page-data';
import { cn } from '@/lib/utils';

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  return {
    title: `${date} AI 日报`,
    description: `${date} 的 AI Signal 编辑简报。`,
    alternates: { canonical: `/briefing/${date}` },
  };
}

export default async function BriefingPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (
    !briefingDateSchema.safeParse(date).success ||
    date > shanghaiDate(new Date())
  )
    notFound();
  const data = await loadBriefingArchive(date);
  if (data.kind === 'unavailable') return <Unavailable />;
  if (data.kind !== 'archive') notFound();
  if (data.current.kind !== 'content')
    return <Missing date={date} nearest={data.nearest} />;
  const item = data.current.item;
  if (item.type !== 'briefing') notFound();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader current="briefing" />
      <main id="main-content">
        <PageContainer className="py-8 sm:py-14">
          <article className="mx-auto max-w-[48rem]">
            <header className="border-b-2 border-foreground pb-9">
              <p className="eyebrow">DAILY BRIEFING</p>
              <p className="mt-4 font-mono text-sm tabular-nums">
                {formatDisplayDate(date)} · 第 {date.replaceAll('-', '')} 期
              </p>
              <h1 className="mt-4 text-balance text-4xl font-bold tracking-[-0.035em] sm:text-5xl">
                {item.title}
              </h1>
              <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                <span>主编 {item.authorName}</span>
                <time dateTime={item.publishedAt.toISOString()}>
                  发布于 {formatDateTime(item.publishedAt)}
                </time>
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="size-3.5" />约{' '}
                  {Math.max(
                    1,
                    Math.ceil(JSON.stringify(item.body).length / 400),
                  )}{' '}
                  分钟
                </span>
              </div>
            </header>
            <section
              className="my-9 border-l-4 border-primary bg-card p-6"
              aria-labelledby="opening"
            >
              <p className="eyebrow">EDITOR&apos;S NOTE</p>
              <h2 id="opening" className="mt-2 text-xl font-bold">
                主编开场
              </h2>
              <p className="mt-3 text-lg leading-8">{item.summary}</p>
            </section>
            <RichText document={item.body} />
            <section
              className="mt-12 border-t-2 border-foreground pt-6"
              aria-labelledby="briefing-sources"
            >
              <h2 id="briefing-sources" className="text-xl font-bold">
                今日来源
              </h2>
              <ol className="mt-4 divide-y divide-border">
                {item.sources.map((source, index) => (
                  <li
                    key={source.id}
                    className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 py-3"
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold hover:text-primary hover:underline"
                    >
                      {source.title} · {source.publisher}
                      <ExternalLink className="ml-1 inline size-3" />
                      <span className="sr-only">（在新窗口打开）</span>
                    </a>
                  </li>
                ))}
              </ol>
            </section>
            <div className="mt-9">
              <ShareActions title={item.title} />
            </div>
            <nav
              aria-label="日报期数导航"
              className="mt-12 grid gap-3 border-y border-border py-5 sm:grid-cols-2"
            >
              {data.previous ? (
                <a
                  href={`/briefing/${data.previous}`}
                  className={buttonVariants({ variant: 'outline' })}
                >
                  <ArrowLeft />
                  上一期
                </a>
              ) : (
                <span />
              )}
              {data.next ? (
                <a
                  href={`/briefing/${data.next}`}
                  className={cn(
                    buttonVariants({ variant: 'outline' }),
                    'sm:justify-self-end',
                  )}
                >
                  下一期
                  <ArrowRight />
                </a>
              ) : null}
            </nav>
            <section className="mt-10 border-y-2 border-foreground py-7">
              <p className="eyebrow">NEWSLETTER</p>
              <h2 className="mt-2 text-2xl font-bold">每天在邮箱读完重点</h2>
              <a href="/newsletter" className={cn(buttonVariants(), 'mt-5')}>
                订阅免费日报
              </a>
            </section>
          </article>
        </PageContainer>
      </main>
      <SiteFooter />
    </div>
  );
}

function Missing({
  date,
  nearest,
}: {
  date: string;
  nearest: { title: string; publishedAt: Date } | null;
}) {
  return (
    <div className="min-h-screen">
      <SiteHeader current="briefing" />
      <main id="main-content">
        <PageContainer className="py-20 text-center">
          <p className="eyebrow">NO EDITION</p>
          <h1 className="mt-3 text-3xl font-bold">
            {formatDisplayDate(date)} 没有发布日报
          </h1>
          <p className="mt-3 text-muted-foreground">
            我们不会为没有发布内容的日期伪造一期日报。
          </p>
          {nearest ? (
            <a
              href={`/briefing/${shanghaiDate(nearest.publishedAt)}`}
              className={cn(buttonVariants({ variant: 'outline' }), 'mt-7')}
            >
              阅读相邻一期：{nearest.title}
            </a>
          ) : (
            <a
              href="/latest"
              className={cn(buttonVariants({ variant: 'outline' }), 'mt-7')}
            >
              查看最新动态
            </a>
          )}
        </PageContainer>
      </main>
      <SiteFooter />
    </div>
  );
}
function Unavailable() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main id="main-content">
        <PageContainer className="py-20 text-center">
          <h1 className="text-3xl font-bold">日报暂时无法读取</h1>
          <p className="mt-3 text-muted-foreground">
            服务正在恢复，请稍后重试。
          </p>
        </PageContainer>
      </main>
      <SiteFooter />
    </div>
  );
}
function shanghaiDate(value: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}
function formatDisplayDate(date: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'long',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(`${date}T00:00:00+08:00`));
}
function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}
