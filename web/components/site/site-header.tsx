import { Menu } from 'lucide-react';

import { PageContainer } from '@/components/site/page-container';
import { SearchCommand } from '@/components/site/search-command';
import { buttonVariants } from '@/components/ui/button';

const navigation = [
  { key: 'briefing', label: '今日简报', href: '/briefing/today' },
  { key: 'latest', label: '最新', href: '/latest' },
  { key: 'analysis', label: '深度', href: '/latest?type=analysis' },
  { key: 'topics', label: '主题', href: '/topics' },
] as const;

export function SiteHeader({ current }: { current?: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90">
      <a
        href="#main-content"
        className="sr-only rounded-md bg-background px-4 py-2 focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50"
      >
        跳到正文
      </a>
      <PageContainer className="flex h-14 items-center justify-between gap-4 lg:h-16">
        <a
          href="/"
          className="flex shrink-0 items-baseline gap-2 font-bold tracking-[-0.03em]"
          aria-label="AI Signal 首页"
        >
          <span className="text-xl">AI Signal</span>
          <span className="hidden font-mono text-[10px] font-medium tracking-wider text-muted-foreground sm:inline">
            BETA
          </span>
        </a>
        <nav aria-label="主导航" className="hidden items-center gap-7 md:flex">
          {navigation.map((item) => (
            <a
              key={item.key}
              href={item.href}
              aria-current={current === item.key ? 'page' : undefined}
              className="border-b-2 border-transparent py-5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:border-primary aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <SearchCommand />
          <a
            href="/newsletter"
            className={`${buttonVariants()} hidden sm:inline-flex`}
          >
            订阅
          </a>
          <details className="group relative md:hidden">
            <summary
              aria-label="打开菜单"
              className="flex size-9 cursor-pointer list-none items-center justify-center rounded-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
            >
              <Menu aria-hidden="true" />
            </summary>
            <div className="absolute right-0 top-11 w-[min(20rem,calc(100vw-2rem))] border border-border bg-background p-5 shadow-lg">
              <p className="font-bold">AI Signal</p>
              <p className="mt-1 text-xs text-muted-foreground">
                可验证的中文 AI 行业动态
              </p>
              <nav aria-label="移动端导航" className="mt-5">
                <ul className="border-t border-foreground">
                  {navigation.map((item) => (
                    <li key={item.key} className="border-b border-border">
                      <a
                        href={item.href}
                        aria-current={current === item.key ? 'page' : undefined}
                        className="block py-4 text-lg font-semibold aria-[current=page]:text-primary"
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
                <a href="/newsletter" className={`${buttonVariants()} mt-5`}>
                  订阅日报
                </a>
              </nav>
            </div>
          </details>
        </div>
      </PageContainer>
    </header>
  );
}
