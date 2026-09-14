import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';

import { PageContainer } from '@/components/site/page-container';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { loadTopics } from '@/lib/public-content/page-data';

export const revalidate = 300;
export const metadata: Metadata = {
  title: '主题',
  description: '持续追踪重要 AI 主题及其公开内容。',
  alternates: { canonical: '/topics' },
};

export default async function TopicsPage() {
  const data = await loadTopics();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader current="topics" />
      <main id="main-content">
        <PageContainer className="py-10 sm:py-14">
          <header className="border-b-2 border-foreground pb-8">
            <p className="eyebrow">TOPIC INDEX</p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
              主题
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
              围绕模型、产品与行业变化建立长期上下文。篇数表示公开内容数量，不代表热度。
            </p>
          </header>
          {data.state === 'unavailable' ? (
            <State title="主题暂时无法读取" />
          ) : data.topics.length ? (
            <ol className="mt-8 grid gap-x-8 sm:grid-cols-2">
              {data.topics.map((topic, index) => (
                <li key={topic.id} className="border-t border-border py-6">
                  <a href={`/topics/${topic.slug}`} className="group block">
                    <span className="font-mono text-xs text-primary">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <h2 className="text-2xl font-bold group-hover:text-primary">
                        {topic.name}
                      </h2>
                      <ArrowRight className="size-5" />
                    </div>
                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
                      {topic.description || '编辑正在补充该主题的长期说明。'}
                    </p>
                    <p className="mt-4 font-mono text-xs text-muted-foreground">
                      {topic.contentCount} 篇公开内容
                    </p>
                  </a>
                </li>
              ))}
            </ol>
          ) : (
            <State title="主题目录正在建立" />
          )}
        </PageContainer>
      </main>
      <SiteFooter />
    </div>
  );
}

function State({ title }: { title: string }) {
  return (
    <section className="my-12 border-y border-border py-16 text-center">
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="mt-3 text-muted-foreground">
        编辑完成主题核验后将在这里公开。
      </p>
    </section>
  );
}
