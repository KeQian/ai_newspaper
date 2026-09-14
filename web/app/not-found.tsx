import { PageContainer } from '@/components/site/page-container';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { buttonVariants } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main id="main-content" className="flex flex-1 items-center py-20">
        <PageContainer>
          <p className="eyebrow">404</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight">
            没有找到这个页面
          </h1>
          <p className="mt-4 max-w-xl leading-7 text-muted-foreground">
            链接可能已经更新，或内容尚未发布。你可以返回首页查看当前内容。
          </p>
          <a className={buttonVariants({ className: 'mt-7' })} href="/">
            返回首页
          </a>
        </PageContainer>
      </main>
      <SiteFooter />
    </div>
  );
}
