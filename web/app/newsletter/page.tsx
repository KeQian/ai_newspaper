import type { Metadata } from 'next';

import { NewsletterForm } from '@/components/site/newsletter-form';
import { PageContainer } from '@/components/site/page-container';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { createPublicContentServiceFromEnvironment } from '@/lib/public-content/runtime';

export const metadata: Metadata = {
  title: '订阅每日 AI 信号',
  description:
    '每个工作日 5 分钟，获取经过编辑审核的 AI 动态、影响判断和一手来源。',
  alternates: { canonical: '/newsletter' },
};

export default async function NewsletterPage() {
  const briefings = await loadRecentBriefings();
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main id="main-content">
        <PageContainer className="py-10 sm:py-16">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(340px,440px)]">
            <section>
              <p className="eyebrow">AI SIGNAL DAILY</p>
              <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
                少刷信息流，把重要变化读明白
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
                适合需要跟进模型、产品、研究和政策变化的产品、研发与投资从业者；不适合寻找未经核实传闻或海量链接的人。
              </p>
              <dl className="mt-8 grid gap-4 border-y border-foreground py-5 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">频率</dt>
                  <dd className="mt-1 font-bold">工作日发送</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">阅读时间</dt>
                  <dd className="mt-1 font-bold">约 5 分钟</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">承诺</dt>
                  <dd className="mt-1 font-bold">双重确认 · 随时退订</dd>
                </div>
              </dl>
              <section className="mt-10" aria-labelledby="recent-issues">
                <h2 id="recent-issues" className="text-2xl font-bold">
                  最近 3 期
                </h2>
                {briefings.length ? (
                  <ul className="mt-4 divide-y border-y border-border">
                    {briefings.map((item) => (
                      <li key={item.id}>
                        <a
                          href={`/briefing/${shanghaiDate(item.publishedAt)}`}
                          className="block py-4 hover:text-primary"
                        >
                          <span className="font-semibold">{item.title}</span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {shanghaiDate(item.publishedAt)}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 border border-dashed p-4 text-sm text-muted-foreground">
                    公开日报发布后会在这里展示最近三期；订阅功能不受影响。
                  </p>
                )}
              </section>
            </section>
            <aside>
              <NewsletterForm />
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                我们只收集发送邮件所需的地址和必要运营记录，不出售邮箱。详见{' '}
                <a href="/privacy" className="underline">
                  隐私政策
                </a>
                。
              </p>
            </aside>
          </div>
        </PageContainer>
      </main>
      <SiteFooter />
    </div>
  );
}

async function loadRecentBriefings() {
  try {
    return (
      await createPublicContentServiceFromEnvironment().list({
        type: 'briefing',
        limit: 3,
      })
    ).items;
  } catch {
    return [];
  }
}

function shanghaiDate(value: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}
