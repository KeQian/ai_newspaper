'use client';

import {
  AlertCircle,
  ChevronRight,
  FileText,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export type ContentSummaryData = {
  id: string;
  type: string;
  title: string;
  status: string;
  authorName: string;
  updatedAt: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  sourceHealth: 'healthy' | 'warning' | 'missing';
  version: number;
};

type Page = {
  items: ContentSummaryData[];
  hasMore: boolean;
  nextCursor: string | null;
};
const statuses = [
  ['', '全部'],
  ['draft', '草稿'],
  ['in_review', '审核中'],
  ['scheduled', '已排程'],
  ['published', '已发布'],
  ['updated', '已更新'],
  ['withdrawn', '已撤回'],
];
const statusLabels: Record<string, string> = {
  draft: '草稿',
  in_review: '审核中',
  scheduled: '已排程',
  published: '已发布',
  updated: '已更新',
  withdrawn: '已撤回',
};

export function ContentList() {
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const locationSearch = useSyncExternalStore(
    subscribeToLocation,
    () => window.location.search,
    () => '',
  );
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/admin/content${locationSearch}`, {
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 401 ? '需要管理员登录。' : '内容数据加载失败。',
          );
        return response.json() as Promise<Page>;
      })
      .then(setPage)
      .catch((reason: Error) => {
        if (reason.name !== 'AbortError') setError(reason.message);
      });
    return () => controller.abort();
  }, [locationSearch, reload]);
  const searchParams = new URLSearchParams(locationSearch);
  const activeStatus = searchParams.get('status') ?? '';
  return (
    <div>
      <nav
        aria-label="内容状态"
        className="overflow-x-auto border-y bg-card px-4"
      >
        <ul className="flex min-w-max gap-1">
          {statuses.map(([value, label]) => (
            <li key={value}>
              <a
                href={
                  value ? `/admin/content?status=${value}` : '/admin/content'
                }
                aria-current={activeStatus === value ? 'page' : undefined}
                className="block border-b-2 border-transparent px-3 py-3 text-sm text-muted-foreground hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <form
        method="get"
        className="flex flex-col gap-3 border-b bg-card p-4 sm:flex-row"
      >
        <input type="hidden" name="status" value={activeStatus} />
        <label htmlFor="content-search" className="relative max-w-lg flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="sr-only">搜索内容标题</span>
          <Input
            id="content-search"
            name="q"
            defaultValue={searchParams.get('q') ?? ''}
            className="pl-9"
            placeholder="搜索内容标题"
          />
        </label>
        <select
          name="type"
          defaultValue={searchParams.get('type') ?? ''}
          aria-label="内容类型"
          className="h-9 rounded-md border bg-transparent px-3 text-sm"
        >
          <option value="">全部类型</option>
          <option value="news">快讯</option>
          <option value="briefing">日报</option>
          <option value="analysis">分析</option>
        </select>
        <Button type="submit" variant="outline">
          筛选
        </Button>
      </form>
      <div className="p-4 sm:p-6 lg:p-8">
        {error ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>内容列表暂时不可用</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              onClick={() => {
                setError(null);
                setReload((value) => value + 1);
              }}
            >
              <RefreshCw aria-hidden="true" />
              重试
            </Button>
          </Alert>
        ) : !page ? (
          <div className="space-y-3 rounded-lg border bg-card p-4">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton className="h-14" key={index} />
            ))}
          </div>
        ) : page.items.length === 0 ? (
          <Empty className="min-h-80 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText />
              </EmptyMedia>
              <EmptyTitle>
                {window.location.search ? '筛选无结果' : '暂无内容'}
              </EmptyTitle>
              <EmptyDescription>
                从候选事件创建的草稿会出现在这里。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ContentTable items={page.items} />
        )}
      </div>
    </div>
  );
}

function ContentTable({ items }: { items: ContentSummaryData[] }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>标题</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>作者</TableHead>
            <TableHead>更新时间</TableHead>
            <TableHead>发布安排</TableHead>
            <TableHead>来源</TableHead>
            <TableHead>
              <span className="sr-only">打开</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="max-w-[360px] whitespace-normal">
                <a
                  href={`/admin/content/${item.id}`}
                  className="font-semibold hover:text-primary hover:underline"
                >
                  {item.title}
                </a>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  版本 {item.version}
                </p>
              </TableCell>
              <TableCell>{item.type}</TableCell>
              <TableCell>
                <Badge variant="outline">
                  {statusLabels[item.status] ?? item.status}
                </Badge>
              </TableCell>
              <TableCell>{item.authorName}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatDate(item.updatedAt)}
              </TableCell>
              <TableCell className="text-xs">
                {item.scheduledAt
                  ? formatDate(item.scheduledAt)
                  : item.publishedAt
                    ? formatDate(item.publishedAt)
                    : '—'}
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    item.sourceHealth === 'missing' ? 'destructive' : 'outline'
                  }
                >
                  {item.sourceHealth === 'healthy'
                    ? '正常'
                    : item.sourceHealth === 'warning'
                      ? '需复核'
                      : '缺失'}
                </Badge>
              </TableCell>
              <TableCell>
                <a
                  href={`/admin/content/${item.id}`}
                  aria-label={`编辑：${item.title}`}
                  className="inline-flex rounded-md p-2 hover:bg-muted"
                >
                  <ChevronRight className="size-4" />
                </a>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
function subscribeToLocation(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
