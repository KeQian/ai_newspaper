import { PageContainer } from '@/components/site/page-container';
import { SiteHeader } from '@/components/site/site-header';

export default function Loading() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main id="main-content" aria-busy="true" aria-label="正在加载首页内容">
        <PageContainer className="py-10">
          <div className="animate-pulse" aria-hidden="true">
            <div className="h-16 border-b-2 border-foreground" />
            <div className="mt-8 h-10 w-44 rounded-sm bg-muted" />
            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              <div className="h-72 rounded-sm bg-muted lg:col-span-2" />
              <div className="h-72 rounded-sm bg-muted" />
            </div>
            <div className="mt-14 h-56 rounded-sm bg-muted" />
          </div>
          <p className="sr-only">正在加载首页内容</p>
        </PageContainer>
      </main>
    </div>
  );
}
