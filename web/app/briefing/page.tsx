import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { PageContainer } from '@/components/site/page-container';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { loadBriefingArchive } from '@/lib/public-content/page-data';

export const metadata: Metadata = {
  title: '今日简报',
  description: 'AI Signal 每日编辑简报归档。',
  robots: { index: false, follow: true },
};

export default async function BriefingIndexPage() {
  const data = await loadBriefingArchive();
  if (data.kind === 'latest' && data.latest.kind === 'content')
    redirect(`/briefing/${shanghaiDate(data.latest.item.publishedAt)}`);
  return (
    <div className="min-h-screen">
      <SiteHeader current="briefing" />
      <main id="main-content">
        <PageContainer className="py-20 text-center">
          <h1 className="text-3xl font-bold">今日简报正在准备</h1>
          <p className="mt-3 text-muted-foreground">
            首期简报发布后，这里会自动前往最新一期。
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
