import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import { PageContainer } from '@/components/site/page-container';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { contentHref, StoryCard } from '@/components/site/story-card';
import { loadTopic } from '@/lib/public-content/page-data';
import type { PublicContentListItem } from '@/lib/public-content/types';

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadTopic(slug);
  if (result.kind !== 'topic')
    return { title: '主题不存在', robots: { index: false, follow: false } };
  return {
    title: result.topic.name,
    description:
      result.topic.description ||
      `查看 ${result.topic.name} 的最新 AI 动态与分析。`,
    alternates: { canonical: `/topics/${result.topic.slug}` },
  };
}

export default async function TopicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await loadTopic(slug);
  if (result.kind === 'redirect') permanentRedirect(result.location);
  if (result.kind === 'missing') notFound();
  if (result.kind === 'unavailable') return <Unavailable />;
  const { topic, content } = result;
  const news = content.items.filter((item) => item.type === 'news');
  const analyses = content.items.filter((item) => item.type === 'analysis');
  const judgement = content.items[0]?.summary;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader current="topics" />
      <main id="main-content">
        <PageContainer className="py-9 sm:py-14">
          <header className="border-b-2 border-foreground pb-8">
            <p className="eyebrow">TOPIC</p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-6xl">
              {topic.name}
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">
              {topic.description || '编辑正在补充这一主题的长期定义与边界。'}
            </p>
            <div className="mt-6 flex flex-wrap gap-4 font-mono text-xs text-muted-foreground">
              <span>{topic.contentCount} 篇公开内容</span>
              <time dateTime={topic.updatedAt.toISOString()}>
                主题更新 {formatDate(topic.updatedAt)}
              </time>
            </div>
          </header>
          <section
            className="mt-8 border-l-4 border-primary bg-card p-6"
            aria-labelledby="current-view"
          >
            <p className="eyebrow">CURRENT VIEW</p>
            <h2 id="current-view" className="mt-2 text-2xl font-bold">
              当前判断
            </h2>
            <p className="mt-3 text-base leading-7">
              {judgement || '目前没有足够的已发布证据形成公开判断。'}
            </p>
            {judgement ? (
              <p className="mt-3 text-xs text-muted-foreground">
                依据该主题最新一篇公开内容，非实时趋势预测。
              </p>
            ) : null}
          </section>
          {content.items.length ? (
            <>
              <section className="mt-14" aria-labelledby="timeline">
                <h2
                  id="timeline"
                  className="border-b-2 border-foreground pb-3 text-2xl font-bold"
                >
                  关键事件时间线
                </h2>
                <ol className="mt-5 space-y-5">
                  {content.items.slice(0, 6).map((item) => (
                    <TimelineItem key={item.id} item={item} />
                  ))}
                </ol>
              </section>
              <section className="mt-14 grid gap-10 lg:grid-cols-2">
                <div>
                  <h2 className="border-b-2 border-foreground pb-3 text-2xl font-bold">
                    最新动态
                  </h2>
                  <div>
                    {news.slice(0, 5).map((item, index) => (
                      <StoryCard key={item.id} item={item} index={index + 1} />
                    ))}
                  </div>
                  {news.length === 0 ? (
                    <p className="mt-5 text-sm text-muted-foreground">
                      暂无快讯。
                    </p>
                  ) : null}
                </div>
                <div>
                  <h2 className="border-b-2 border-foreground pb-3 text-2xl font-bold">
                    深度分析
                  </h2>
                  <div>
                    {analyses.slice(0, 3).map((item, index) => (
                      <StoryCard key={item.id} item={item} index={index + 1} />
                    ))}
                  </div>
                  {analyses.length === 0 ? (
                    <p className="mt-5 text-sm text-muted-foreground">
                      暂无深度分析。
                    </p>
                  ) : null}
                </div>
              </section>
              {content.nextCursor ? (
                <a
                  href={`/latest?topic=${encodeURIComponent(topic.slug)}&cursor=${encodeURIComponent(content.nextCursor)}`}
                  className="mt-10 inline-block font-semibold text-primary hover:underline"
                >
                  查看该主题更多内容
                </a>
              ) : null}
            </>
          ) : (
            <section className="mt-12 border-y border-border py-14 text-center">
              <h2 className="text-2xl font-bold">该主题暂无公开内容</h2>
              <p className="mt-3 text-muted-foreground">
                候选内容完成核验后才会显示在这里。
              </p>
            </section>
          )}
        </PageContainer>
      </main>
      <SiteFooter />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJson(
            collectionJsonLd(topic.name, topic.description, slug),
          ),
        }}
      />
    </div>
  );
}

function TimelineItem({ item }: { item: PublicContentListItem }) {
  return (
    <li className="grid gap-2 sm:grid-cols-[110px_minmax(0,1fr)]">
      <time
        className="font-mono text-xs text-muted-foreground"
        dateTime={item.publishedAt.toISOString()}
      >
        {formatDate(item.publishedAt)}
      </time>
      <div className="border-l border-border pl-4">
        <a
          href={contentHref(item)}
          className="font-bold hover:text-primary hover:underline"
        >
          {item.title}
        </a>
        <p className="mt-1 text-sm text-muted-foreground">{item.summary}</p>
      </div>
    </li>
  );
}
function Unavailable() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main id="main-content">
        <PageContainer className="py-20 text-center">
          <h1 className="text-3xl font-bold">主题暂时无法读取</h1>
          <p className="mt-3 text-muted-foreground">
            服务正在恢复，请稍后重试。
          </p>
        </PageContainer>
      </main>
      <SiteFooter />
    </div>
  );
}
function formatDate(value: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(value);
}
function collectionJsonLd(name: string, description: string, slug: string) {
  const origin = process.env.PUBLIC_SITE_URL?.replace(/\/$/, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    description,
    inLanguage: 'zh-CN',
    ...(origin ? { url: `${origin}/topics/${slug}` } : {}),
  };
}
function safeJson(value: unknown) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}
