import type { Metadata } from 'next';
import { ArrowLeft, Clock3, ExternalLink, RotateCcw } from 'lucide-react';
import { notFound, permanentRedirect } from 'next/navigation';

import { PageContainer } from '@/components/site/page-container';
import { RichText } from '@/components/site/rich-text';
import { ShareActions } from '@/components/site/share-actions';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { VerificationBadge } from '@/components/site/story-card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { loadPublicContent } from '@/lib/public-content/page-data';
import type { PublicContentItem } from '@/lib/public-content/types';
import { cn } from '@/lib/utils';

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadPublicContent(slug);
  if (result.kind !== 'content')
    return { title: '内容不存在', robots: { index: false, follow: false } };
  const item = result.item;
  const seo = item.seo as { title?: unknown; description?: unknown };
  const title = typeof seo.title === 'string' ? seo.title : item.title;
  const description =
    typeof seo.description === 'string' ? seo.description : item.summary;
  return {
    title,
    description,
    alternates: { canonical: `/news/${item.slug}` },
    robots:
      item.status === 'withdrawn' ? { index: false, follow: true } : undefined,
    openGraph: {
      type: 'article',
      title,
      description,
      url: `/news/${item.slug}`,
      publishedTime: item.publishedAt.toISOString(),
      modifiedTime: item.updatedAt.toISOString(),
      authors: [item.authorName],
      images: [],
    },
    twitter: { card: 'summary', title, description, images: [] },
  };
}

export default async function NewsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await loadPublicContent(slug);
  if (result.kind === 'redirect') permanentRedirect(result.location);
  if (result.kind === 'missing') notFound();
  if (result.kind === 'unavailable') return <Unavailable slug={slug} />;
  const item = result.item;
  if (item.type !== 'news') notFound();
  if (item.status === 'withdrawn') return <Withdrawn item={item} />;
  const readingMinutes = Math.max(1, Math.ceil(textLength(item.body) / 400));
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader current="latest" />
      <main id="main-content">
        <PageContainer className="py-8 sm:py-12">
          <article>
            <header className="mx-auto max-w-[52rem] border-b-2 border-foreground pb-8">
              <nav
                aria-label="面包屑"
                className="text-sm text-muted-foreground"
              >
                <a href="/" className="hover:text-foreground">
                  首页
                </a>
                <span aria-hidden="true"> / </span>
                <a href="/latest" className="hover:text-foreground">
                  最新动态
                </a>
              </nav>
              <div className="mt-8 flex flex-wrap items-center gap-2">
                {item.topics.map((topic) => (
                  <a key={topic.id} href={`/topics/${topic.slug}`}>
                    <Badge variant="outline">{topic.name}</Badge>
                  </a>
                ))}
                <VerificationBadge status={item.verification} />
              </div>
              <h1 className="mt-5 text-balance text-4xl font-bold leading-[1.16] tracking-[-0.035em] sm:text-5xl">
                {item.title}
              </h1>
              {item.dek ? (
                <p className="mt-5 text-xl leading-8 text-muted-foreground">
                  {item.dek}
                </p>
              ) : null}
              <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                <span>{item.authorName}</span>
                <time dateTime={item.publishedAt.toISOString()}>
                  发布于 {formatDate(item.publishedAt)}
                </time>
                {item.updatedAt.getTime() !== item.publishedAt.getTime() ? (
                  <time dateTime={item.updatedAt.toISOString()}>
                    更新于 {formatDate(item.updatedAt)}
                  </time>
                ) : null}
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="size-3.5" />约 {readingMinutes} 分钟
                </span>
              </div>
            </header>
            <div className="mx-auto mt-8 grid max-w-[65rem] gap-10 lg:grid-cols-[minmax(0,45rem)_240px]">
              <div>
                {isStale(item.updatedAt) ? (
                  <aside
                    className="mb-6 border-l-4 border-[var(--warning)] bg-card px-4 py-3 text-sm"
                    aria-label="内容更新提示"
                  >
                    本文超过 24 小时未更新，请结合来源时间判断信息时效。
                  </aside>
                ) : null}
                <section
                  className="border-l-4 border-primary bg-card p-5"
                  aria-labelledby="quick-summary"
                >
                  <p className="eyebrow">30 SECOND BRIEF</p>
                  <h2 id="quick-summary" className="mt-2 text-xl font-bold">
                    30 秒看懂
                  </h2>
                  <p className="mt-3 text-base leading-7">{item.summary}</p>
                </section>
                <section className="mt-10" aria-labelledby="what-happened">
                  <h2 id="what-happened" className="text-2xl font-bold">
                    发生了什么
                  </h2>
                  <div className="mt-5">
                    <RichText document={item.body} />
                  </div>
                </section>
                <section className="mt-10 grid gap-5 border-y border-border py-7 sm:grid-cols-2">
                  <div>
                    <h2 className="text-lg font-bold">为什么重要</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {item.summary}
                    </p>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">影响与后续</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      影响主题：
                      {item.topics.map((topic) => topic.name).join('、') ||
                        '行业整体'}
                      。继续关注官方更新与独立来源验证。
                    </p>
                  </div>
                </section>
                <Sources item={item} />
                {item.corrections.length ? (
                  <section className="mt-10" aria-labelledby="corrections">
                    <h2 id="corrections" className="text-xl font-bold">
                      更正记录
                    </h2>
                    <ol className="mt-4 space-y-3">
                      {item.corrections.map((correction, index) => (
                        <li
                          key={`${correction.correctedAt.toISOString()}-${index}`}
                          className="border-l-2 border-[var(--warning)] pl-4 text-sm"
                        >
                          <p>{correction.description}</p>
                          <time
                            className="mt-1 block text-xs text-muted-foreground"
                            dateTime={correction.correctedAt.toISOString()}
                          >
                            {formatDate(correction.correctedAt)}
                          </time>
                        </li>
                      ))}
                    </ol>
                  </section>
                ) : null}
                {item.aiDisclosure?.assisted === true ? (
                  <section className="mt-10 border-t border-border pt-6">
                    <h2 className="text-sm font-semibold">AI 辅助说明</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {typeof item.aiDisclosure.note === 'string' &&
                      item.aiDisclosure.note
                        ? item.aiDisclosure.note
                        : 'AI 参与资料整理或初稿辅助，最终内容由编辑核验。'}
                    </p>
                  </section>
                ) : null}
                <div className="mt-10">
                  <ShareActions title={item.title} />
                </div>
              </div>
              <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
                <div className="border-t-2 border-foreground pt-4">
                  <p className="text-sm font-semibold">文章信息</p>
                  <dl className="mt-3 space-y-3 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">重要度</dt>
                      <dd>{item.importance}/5</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">来源</dt>
                      <dd>{item.sources.length} 个</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">状态</dt>
                      <dd>{item.status === 'updated' ? '已更新' : '已发布'}</dd>
                    </div>
                  </dl>
                </div>
                <div className="border-t border-border pt-5">
                  <h2 className="font-semibold">每日重点</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    免费日报，只保留经过核验的重要变化。
                  </p>
                  <a
                    href="/newsletter"
                    className={cn(buttonVariants(), 'mt-4 w-full')}
                  >
                    订阅日报
                  </a>
                </div>
              </aside>
            </div>
          </article>
        </PageContainer>
      </main>
      <SiteFooter />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJson(newsJsonLd(item)) }}
      />
    </div>
  );
}

function Sources({ item }: { item: PublicContentItem }) {
  return (
    <section className="mt-10" aria-labelledby="sources">
      <h2 id="sources" className="text-xl font-bold">
        来源与证据
      </h2>
      <ol className="mt-4 divide-y divide-border border-y border-border">
        {item.sources.map((source, index) => (
          <li
            key={source.id}
            className="grid gap-2 py-4 sm:grid-cols-[28px_minmax(0,1fr)_auto]"
          >
            <span className="font-mono text-xs text-muted-foreground">
              {String(index + 1).padStart(2, '0')}
            </span>
            <div>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold hover:text-primary hover:underline"
              >
                {source.title}
                <ExternalLink className="ml-1 inline size-3.5" />
                <span className="sr-only">（在新窗口打开）</span>
              </a>
              <p className="mt-1 text-xs text-muted-foreground">
                {source.publisher} ·{' '}
                {source.relation === 'primary' ? '主要来源' : '佐证来源'} ·{' '}
                {source.reliability.toUpperCase()}
              </p>
            </div>
            {source.publishedAt ? (
              <time
                className="text-xs text-muted-foreground"
                dateTime={source.publishedAt.toISOString()}
              >
                {formatShortDate(source.publishedAt)}
              </time>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
function Withdrawn({ item }: { item: PublicContentItem }) {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main id="main-content">
        <PageContainer className="py-16">
          <div className="mx-auto max-w-2xl border-y-2 border-foreground py-12">
            <p className="eyebrow">CONTENT WITHDRAWN</p>
            <h1 className="mt-3 text-3xl font-bold">该内容已撤回</h1>
            <p className="mt-5 text-base leading-7 text-muted-foreground">
              {item.summary}
            </p>
            {item.corrections.length ? (
              <div className="mt-6">
                <h2 className="font-semibold">相关更正记录</h2>
                <ul className="mt-2 list-disc space-y-2 pl-5 text-sm">
                  {item.corrections.map((note, index) => (
                    <li key={index}>{note.description}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <a
              href="/latest"
              className={cn(buttonVariants({ variant: 'outline' }), 'mt-8')}
            >
              <ArrowLeft />
              返回最新动态
            </a>
          </div>
        </PageContainer>
      </main>
      <SiteFooter />
    </div>
  );
}
function Unavailable({ slug }: { slug: string }) {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main id="main-content">
        <PageContainer className="py-20 text-center">
          <h1 className="text-3xl font-bold">内容暂时无法读取</h1>
          <p className="mt-3 text-muted-foreground">
            服务正在恢复，请稍后重试。
          </p>
          <a
            href={`/news/${encodeURIComponent(slug)}`}
            className={cn(buttonVariants({ variant: 'outline' }), 'mt-6')}
          >
            <RotateCcw />
            重新加载
          </a>
        </PageContainer>
      </main>
      <SiteFooter />
    </div>
  );
}
function textLength(body: Record<string, unknown>) {
  return JSON.stringify(body).length;
}
function formatDate(value: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}
function formatShortDate(value: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(value);
}
function newsJsonLd(item: PublicContentItem) {
  const origin = process.env.PUBLIC_SITE_URL?.replace(/\/$/, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: item.title,
    description: item.summary,
    datePublished: item.publishedAt.toISOString(),
    dateModified: item.updatedAt.toISOString(),
    inLanguage: 'zh-CN',
    author: { '@type': 'Person', name: item.authorName },
    publisher: { '@type': 'Organization', name: 'AI Signal' },
    ...(origin ? { mainEntityOfPage: `${origin}/news/${item.slug}` } : {}),
    citation: item.sources.map((source) => source.url),
  };
}
function safeJson(value: unknown) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}
function isStale(value: Date) {
  return Date.now() - value.getTime() > 24 * 60 * 60 * 1000;
}
