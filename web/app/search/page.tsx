import type { Metadata } from 'next';

import { PageContainer } from '@/components/site/page-container';
import { SearchFilters, SearchResults } from '@/components/site/search-results';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { loadTopics } from '@/lib/public-content/page-data';

export const metadata: Metadata = {
  title: '搜索',
  description: '搜索 AI Signal 已发布内容与主题。',
  robots: { index: false, follow: true },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = Object.fromEntries(
    Object.entries(raw).flatMap(([key, value]) =>
      typeof value === 'string' ? [[key, value]] : [],
    ),
  );
  const topicData = await loadTopics();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader current="search" />
      <main id="main-content">
        <PageContainer className="py-9 sm:py-14">
          <header className="border-b-2 border-foreground pb-7">
            <p className="eyebrow">SEARCH ARCHIVE</p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
              搜索
            </h1>
            <p className="mt-3 text-muted-foreground">
              只检索已发布内容；草稿和撤回内容不会出现。
            </p>
          </header>
          <SearchFilters params={params} topics={topicData.topics} />
          <SearchResults params={params} />
        </PageContainer>
      </main>
      <SiteFooter />
    </div>
  );
}
