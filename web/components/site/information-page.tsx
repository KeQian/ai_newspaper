import type { ReactNode } from 'react';

import { PageContainer } from './page-container';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

export function InformationPage({
  eyebrow,
  title,
  description,
  updatedAt,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  updatedAt: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main id="main-content">
        <PageContainer className="py-10 sm:py-16">
          <article className="mx-auto max-w-[48rem]">
            <header className="border-b-2 border-foreground pb-8">
              <p className="eyebrow">{eyebrow}</p>
              <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
                {title}
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
                {description}
              </p>
              <p className="mt-5 font-mono text-xs text-muted-foreground">
                最近更新：{updatedAt}（北京时间）
              </p>
            </header>
            <div className="article-body mt-10">{children}</div>
          </article>
        </PageContainer>
      </main>
      <SiteFooter />
    </div>
  );
}
