'use client';

import {
  Activity,
  BookOpenText,
  DatabaseZap,
  FileText,
  History,
  LayoutDashboard,
  Mail,
  Network,
  Sparkles,
} from 'lucide-react';
import { usePathname } from 'next/navigation';

const navigation = [
  ['概览', '/admin', LayoutDashboard],
  ['候选事件', '/admin/candidates', Sparkles],
  ['内容', '/admin/content', FileText],
  ['来源', '/admin/sources', DatabaseZap],
  ['任务', '/admin/runs', Activity],
  ['实体', '/admin/entities', Network],
  ['Newsletter', '/admin/newsletters', Mail],
  ['审计', '/admin/audit', History],
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background px-4 lg:hidden">
        <a href="/admin" className="flex items-center gap-2 font-semibold">
          <BookOpenText className="size-4 text-primary" aria-hidden="true" />
          AI Newspaper · 编辑台
        </a>
        <span className="rounded-sm border px-2 py-1 text-xs">开发环境</span>
      </header>
      <div className="mx-auto grid min-h-screen max-w-[1440px] lg:grid-cols-[224px_minmax(0,1fr)]">
        <aside className="hidden border-r bg-card lg:flex lg:flex-col">
          <div className="flex h-16 items-center gap-2 border-b px-5 font-semibold">
            <BookOpenText className="size-4 text-primary" aria-hidden="true" />
            编辑工作台
          </div>
          <nav aria-label="后台导航" className="flex-1 p-3">
            <ul className="space-y-1">
              {navigation.map(([label, href, Icon]) => (
                <li key={href}>
                  <a
                    href={href}
                    aria-current={
                      isCurrent(pathname, href) ? 'page' : undefined
                    }
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-secondary aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="border-t p-4 text-xs leading-5 text-muted-foreground">
            <div className="mb-2 flex items-center justify-between">
              <span>数据延迟</span>
              <span className="font-medium text-foreground">实时检测</span>
            </div>
            <div className="flex items-center justify-between">
              <span>环境</span>
              <span className="rounded-sm border px-1.5 py-0.5">开发</span>
            </div>
          </div>
        </aside>
        <main id="main-content" className="min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}

function isCurrent(pathname: string, href: string) {
  return href === '/admin'
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}
