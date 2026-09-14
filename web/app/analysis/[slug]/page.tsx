import type { Metadata } from 'next';
import { Clock3, ExternalLink } from 'lucide-react';
import { notFound, permanentRedirect } from 'next/navigation';

import { PageContainer } from '@/components/site/page-container';
import { RichText } from '@/components/site/rich-text';
import { ShareActions } from '@/components/site/share-actions';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { StoryCard, VerificationBadge } from '@/components/site/story-card';
import { loadAnalysis } from '@/lib/public-content/page-data';
import type { PublicContentItem } from '@/lib/public-content/types';

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { result } = await loadAnalysis(slug);
  if (result.kind !== 'content')
    return { title: '深度内容不存在', robots: { index: false, follow: false } };
  return {
    title: result.item.title,
    description: result.item.summary,
    alternates: { canonical: `/analysis/${result.item.slug}` },
    robots:
      result.item.status === 'withdrawn'
        ? { index: false, follow: true }
        : undefined,
    openGraph: {
      type: 'article',
      title: result.item.title,
      description: result.item.summary,
      url: `/analysis/${result.item.slug}`,
      publishedTime: result.item.publishedAt.toISOString(),
      modifiedTime: result.item.updatedAt.toISOString(),
      images: [],
    },
    twitter: {
      card: 'summary',
      title: result.item.title,
      description: result.item.summary,
      images: [],
    },
  };
}

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { result, related } = await loadAnalysis(slug);
  if (result.kind === 'redirect') permanentRedirect(result.location);
  if (result.kind === 'missing') notFound();
  if (result.kind === 'unavailable') return <Unavailable />;
  const item = result.item;
  if (item.type !== 'analysis') notFound();
  if (item.status === 'withdrawn') return <Withdrawn item={item} />;
  const conclusions = extractConclusions(item.body);
  const headings = extractHeadings(item.body);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="reading-progress" aria-hidden="true" />
      <SiteHeader current="analysis" />
      <main id="main-content">
        <PageContainer className="py-8 sm:py-14">
          <article>
            <header className="mx-auto max-w-[52rem] border-b-2 border-foreground pb-9">
              <nav
                aria-label="面包屑"
                className="text-sm text-muted-foreground"
              >
                <a href="/">首页</a>
                <span aria-hidden="true"> / </span>
                <a href="/latest?type=analysis">深度分析</a>
              </nav>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <span className="eyebrow">ANALYSIS</span>
                <VerificationBadge status={item.verification} />
              </div>
              <h1 className="mt-5 text-balance text-4xl font-bold leading-[1.12] tracking-[-0.04em] sm:text-6xl">
                {item.title}
              </h1>
              {item.dek ? (
                <p className="mt-6 text-xl leading-8 text-muted-foreground">
                  {item.dek}
                </p>
              ) : null}
              <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                <span>{item.authorName}</span>
                <time dateTime={item.publishedAt.toISOString()}>
                  {formatDate(item.publishedAt)}
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

            <div className="mx-auto mt-10 grid max-w-[65rem] gap-10 lg:grid-cols-[minmax(0,45rem)_240px]">
              <div>
                <section
                  className="border-y-2 border-foreground py-7"
                  aria-labelledby="conclusions"
                >
                  <p className="eyebrow">BOTTOM LINE</p>
                  <h2 id="conclusions" className="mt-2 text-2xl font-bold">
                    结论先行
                  </h2>
                  {conclusions.length ? (
                    <ul className="mt-5 space-y-3">
                      {conclusions.map((text, index) => (
                        <li
                          key={index}
                          className="grid grid-cols-[28px_minmax(0,1fr)] gap-3"
                        >
                          <span className="font-mono text-sm text-primary">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <span className="font-semibold leading-7">
                            {text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-4 text-base leading-7">{item.summary}</p>
                  )}
                </section>
                <div className="mt-10">
                  <RichText document={item.body} />
                </div>
                <Sources item={item} />
                <div className="mt-10">
                  <ShareActions title={item.title} />
                </div>
              </div>
              <aside className="space-y-7 lg:sticky lg:top-24 lg:self-start">
                {headings.length > 4 ? (
                  <nav
                    aria-label="文章目录"
                    className="border-t-2 border-foreground pt-4"
                  >
                    <h2 className="font-bold">目录</h2>
                    <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
                      {headings.map((heading) => (
                        <li key={heading.id}>
                          <a
                            href={`#${heading.id}`}
                            className="hover:text-primary"
                          >
                            {heading.text}
                          </a>
                        </li>
                      ))}
                    </ol>
                  </nav>
                ) : null}
                <div className="border-t border-border pt-5">
                  <h2 className="font-bold">相关主题</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.topics.map((topic) => (
                      <a
                        key={topic.id}
                        href={`/topics/${topic.slug}`}
                        className="rounded-sm border px-2 py-1 text-xs hover:border-foreground"
                      >
                        {topic.name}
                      </a>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
            {related.length ? (
              <section className="mx-auto mt-16 max-w-[65rem] border-t-2 border-foreground pt-7">
                <h2 className="text-2xl font-bold">相关阅读</h2>
                <div className="mt-4 grid gap-6 md:grid-cols-3">
                  {related.map((story, index) => (
                    <StoryCard key={story.id} item={story} index={index + 1} />
                  ))}
                </div>
              </section>
            ) : null}
          </article>
        </PageContainer>
      </main>
      <SiteFooter />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJson(articleJsonLd(item)) }}
      />
    </div>
  );
}

function Sources({ item }: { item: PublicContentItem }) {
  return (
    <section className="mt-12" aria-labelledby="analysis-sources">
      <h2 id="analysis-sources" className="text-xl font-bold">
        方法与来源
      </h2>
      <ol className="mt-4 divide-y divide-border border-y border-border">
        {item.sources.map((source, index) => (
          <li
            key={source.id}
            className="grid gap-2 py-4 sm:grid-cols-[28px_minmax(0,1fr)]"
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
                {source.publisher} · {source.reliability.toUpperCase()}
              </p>
            </div>
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
        <PageContainer className="py-20">
          <div className="mx-auto max-w-2xl border-y-2 border-foreground py-12">
            <p className="eyebrow">ANALYSIS WITHDRAWN</p>
            <h1 className="mt-3 text-3xl font-bold">该分析已撤回</h1>
            <p className="mt-4 text-muted-foreground">{item.summary}</p>
            <a
              href="/latest?type=analysis"
              className="mt-7 inline-block font-semibold text-primary hover:underline"
            >
              返回深度分析
            </a>
          </div>
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
          <h1 className="text-3xl font-bold">分析暂时无法读取</h1>
          <p className="mt-3 text-muted-foreground">
            服务正在恢复，请稍后重试。
          </p>
        </PageContainer>
      </main>
      <SiteFooter />
    </div>
  );
}
function extractConclusions(body: Record<string, unknown>) {
  const blocks = Array.isArray(body.content) ? body.content : [];
  const list = blocks.find(
    (block) => isRecord(block) && block.type === 'bulletList',
  );
  if (!isRecord(list) || !Array.isArray(list.items)) return [];
  return list.items.slice(0, 5).map(textFrom).filter(Boolean).slice(0, 5);
}
function extractHeadings(body: Record<string, unknown>) {
  const blocks = Array.isArray(body.content) ? body.content : [];
  return blocks
    .flatMap((block, index) =>
      isRecord(block) && block.type === 'heading' && block.level === 2
        ? [{ id: `section-${index + 1}`, text: textFrom(block.content) }]
        : [],
    )
    .filter((item) => item.text);
}
function textFrom(value: unknown): string {
  if (Array.isArray(value)) return value.map(textFrom).join('');
  if (!isRecord(value)) return '';
  return typeof value.text === 'string' ? value.text : textFrom(value.content);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function formatDate(value: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(value);
}
function articleJsonLd(item: PublicContentItem) {
  const origin = process.env.PUBLIC_SITE_URL?.replace(/\/$/, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: item.title,
    description: item.summary,
    datePublished: item.publishedAt.toISOString(),
    dateModified: item.updatedAt.toISOString(),
    inLanguage: 'zh-CN',
    author: { '@type': 'Person', name: item.authorName },
    publisher: { '@type': 'Organization', name: 'AI Signal' },
    ...(origin ? { mainEntityOfPage: `${origin}/analysis/${item.slug}` } : {}),
    citation: item.sources.map((source) => source.url),
  };
}
function safeJson(value: unknown) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}
