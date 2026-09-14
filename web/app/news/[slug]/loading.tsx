import { PageContainer } from '@/components/site/page-container';
import { SiteHeader } from '@/components/site/site-header';

export default function NewsLoading() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main id="main-content" aria-busy="true" aria-label="正在加载文章内容">
        <PageContainer className="py-12">
          <div
            className="mx-auto max-w-[52rem] animate-pulse"
            aria-hidden="true"
          >
            <div className="h-4 w-32 rounded-sm bg-muted" />
            <div className="mt-10 h-12 rounded-sm bg-muted" />
            <div className="mt-3 h-12 w-4/5 rounded-sm bg-muted" />
            <div className="mt-7 h-6 w-3/5 rounded-sm bg-muted" />
            <div className="mt-12 h-28 rounded-sm bg-muted" />
            <div className="mt-8 h-80 rounded-sm bg-muted" />
          </div>
          <p className="sr-only">正在加载文章内容</p>
        </PageContainer>
      </main>
    </div>
  );
}
