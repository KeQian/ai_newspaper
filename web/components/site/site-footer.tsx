import { PageContainer } from '@/components/site/page-container';

const navigation = [
  ['最新', '/latest'],
  ['深度', '/latest?type=analysis'],
  ['方法论', '/methodology'],
  ['关于', '/about'],
  ['隐私', '/privacy'],
  ['条款', '/terms'],
  ['更正', '/corrections'],
  ['AI 说明', '/ai-disclosure'],
  ['Newsletter', '/newsletter'],
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t-2 border-foreground bg-card py-8">
      <PageContainer>
        <div className="grid gap-8 sm:grid-cols-[minmax(220px,1fr)_2fr]">
          <div>
            <p className="text-lg font-bold">AI Signal</p>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              面向中文 AI 从业者的热点动态与影响判断。
            </p>
          </div>
          <nav aria-label="页脚导航">
            <ul className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
              {navigation.map(([label, href]) => (
                <li key={href}>
                  <a href={href} className="hover:text-primary hover:underline">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="mt-8 flex flex-col gap-2 border-t border-border pt-5 text-xs text-muted-foreground sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} AI Signal</p>
          <p>所有时间按 Asia/Shanghai 显示</p>
        </div>
      </PageContainer>
    </footer>
  );
}
