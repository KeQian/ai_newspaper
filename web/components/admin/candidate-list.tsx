'use client';

import {
  AlertCircle,
  ChevronRight,
  Filter,
  Inbox,
  RefreshCw,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';

export type CandidateSummary = {
  id: string;
  title: string;
  factSummary: string;
  occurredAt: string | null;
  status: string;
  verification: string;
  importance: number;
  confidence: number;
  riskFlags: string[];
  sourceCount: number;
  primarySource: string | null;
  deferredUntil: string | null;
  createdAt: string;
  version: number;
};

type Page = {
  items: CandidateSummary[];
  hasMore: boolean;
  nextCursor: string | null;
};

const statusLabels: Record<string, string> = {
  new: '新候选',
  processing: '处理中',
  review: '待审核',
  merged: '已合并',
  rejected: '已拒绝',
  published: '已发布',
};

export function CandidateList() {
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState<{
    status: number;
    message: string;
  } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/admin/candidates${window.location.search}`, {
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            message?: string;
          } | null;
          throw {
            status: response.status,
            message: body?.message ?? '候选数据加载失败',
          };
        }
        return response.json() as Promise<Page>;
      })
      .then(setPage)
      .catch((reason: { status?: number; message?: string; name?: string }) => {
        if (reason.name !== 'AbortError') {
          setError({
            status: reason.status ?? 503,
            message: reason.message ?? '候选数据加载失败',
          });
        }
      });
    return () => controller.abort();
  }, [reload]);

  const hasFilters =
    typeof window !== 'undefined' && Boolean(window.location.search);

  return (
    <div>
      <form
        method="get"
        className="grid gap-3 border-y bg-card p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6"
      >
        <label htmlFor="candidate-q" className="sm:col-span-2">
          <span className="sr-only">搜索标题或事实摘要</span>
          <Input
            id="candidate-q"
            name="q"
            defaultValue={searchValue('q')}
            placeholder="搜索标题或事实摘要"
          />
        </label>
        <FilterSelect
          name="status"
          label="全部状态"
          options={[
            ['review', '待审核'],
            ['new', '新候选'],
            ['merged', '已合并'],
            ['rejected', '已拒绝'],
          ]}
        />
        <FilterSelect
          name="verification"
          label="全部可信状态"
          options={[
            ['confirmed', '已确认'],
            ['developing', '进展中'],
            ['unverified', '未核验'],
          ]}
        />
        <FilterSelect
          name="importance"
          label="全部重要度"
          options={[
            ['5', '重要度 5'],
            ['4', '重要度 4'],
            ['3', '重要度 3'],
            ['2', '重要度 2'],
            ['1', '重要度 1'],
          ]}
        />
        <label htmlFor="candidate-source">
          <span className="sr-only">来源</span>
          <Input
            id="candidate-source"
            name="source"
            defaultValue={searchValue('source')}
            placeholder="来源"
          />
        </label>
        <label htmlFor="candidate-entity">
          <span className="sr-only">实体</span>
          <Input
            id="candidate-entity"
            name="entity"
            defaultValue={searchValue('entity')}
            placeholder="实体"
          />
        </label>
        <label htmlFor="candidate-topic">
          <span className="sr-only">主题</span>
          <Input
            id="candidate-topic"
            name="topic"
            defaultValue={searchValue('topic')}
            placeholder="主题"
          />
        </label>
        <label htmlFor="candidate-risk">
          <span className="sr-only">风险标记</span>
          <Input
            id="candidate-risk"
            name="risk"
            defaultValue={searchValue('risk')}
            placeholder="风险标记"
          />
        </label>
        <label
          htmlFor="candidate-from"
          className="grid grid-cols-[auto_1fr] items-center gap-2 text-xs text-muted-foreground"
        >
          从
          <Input
            id="candidate-from"
            type="date"
            name="from"
            defaultValue={searchValue('from')}
          />
        </label>
        <label
          htmlFor="candidate-to"
          className="grid grid-cols-[auto_1fr] items-center gap-2 text-xs text-muted-foreground"
        >
          至
          <Input
            id="candidate-to"
            type="date"
            name="to"
            defaultValue={searchValue('to')}
          />
        </label>
        <input type="hidden" name="sort" value="created_desc" />
        <label
          htmlFor="candidate-deferred"
          className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm"
        >
          <input
            id="candidate-deferred"
            type="checkbox"
            name="includeDeferred"
            value="true"
            defaultChecked={searchValue('includeDeferred') === 'true'}
            className="size-4 accent-primary"
          />
          包含延后
        </label>
        <Button type="submit" variant="outline">
          <Filter aria-hidden="true" />
          筛选
        </Button>
      </form>

      <div className="p-4 sm:p-6 lg:p-8">
        {error ? (
          <Alert
            variant={
              error.status === 401 || error.status === 403
                ? 'default'
                : 'destructive'
            }
          >
            <AlertCircle aria-hidden="true" />
            <AlertTitle>
              {error.status === 401
                ? '需要管理员登录'
                : error.status === 403
                  ? '没有查看权限'
                  : '候选池暂时不可用'}
            </AlertTitle>
            <AlertDescription>
              {error.message}。请求编号会保留在服务端日志中。
            </AlertDescription>
            <Button
              className="mt-3 w-fit"
              size="sm"
              variant="outline"
              onClick={() => setReload((value) => value + 1)}
            >
              <RefreshCw aria-hidden="true" />
              重试
            </Button>
          </Alert>
        ) : !page ? (
          <LoadingTable />
        ) : page.items.length === 0 ? (
          <Empty className="min-h-80 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Inbox aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>
                {hasFilters ? '筛选无结果' : '暂无新候选'}
              </EmptyTitle>
              <EmptyDescription>
                {hasFilters
                  ? '调整筛选条件或清除筛选后重试。'
                  : '采集任务生成的新候选会出现在这里。'}
              </EmptyDescription>
            </EmptyHeader>
            {hasFilters ? (
              <a
                href="/admin/candidates"
                className={cn(buttonVariants({ variant: 'outline' }))}
              >
                清除筛选
              </a>
            ) : null}
          </Empty>
        ) : (
          <CandidateTable items={page.items} />
        )}
      </div>
    </div>
  );
}

function CandidateTable({ items }: { items: CandidateSummary[] }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-32">事件时间</TableHead>
            <TableHead>候选事实</TableHead>
            <TableHead>主要来源</TableHead>
            <TableHead>评分</TableHead>
            <TableHead>风险</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>
              <span className="sr-only">打开</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="align-top text-xs text-muted-foreground">
                {formatDate(item.occurredAt ?? item.createdAt)}
              </TableCell>
              <TableCell className="max-w-[420px] whitespace-normal align-top">
                <a
                  href={`/admin/candidates/${item.id}`}
                  className="font-semibold leading-5 hover:text-primary hover:underline"
                >
                  {item.title}
                </a>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {item.factSummary}
                </p>
              </TableCell>
              <TableCell className="align-top">
                <span className="block max-w-36 truncate">
                  {item.primarySource ?? '来源缺失'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {item.sourceCount} 个来源
                </span>
              </TableCell>
              <TableCell className="align-top font-mono text-xs">
                I{item.importance} · {Math.round(item.confidence * 100)}%
              </TableCell>
              <TableCell className="align-top">
                {item.riskFlags.length ? (
                  <Badge variant="destructive">
                    {item.riskFlags.length} 项
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">无</span>
                )}
              </TableCell>
              <TableCell className="align-top">
                <Badge variant="outline">
                  {item.deferredUntil
                    ? '已延后'
                    : (statusLabels[item.status] ?? item.status)}
                </Badge>
              </TableCell>
              <TableCell className="align-top">
                <a
                  href={`/admin/candidates/${item.id}`}
                  aria-label={`审核：${item.title}`}
                  className="inline-flex rounded-md p-2 hover:bg-muted"
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                </a>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function FilterSelect({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: string[][];
}) {
  const id = `candidate-${name}`;
  return (
    <label htmlFor={id}>
      <span className="sr-only">{label}</span>
      <select
        id={id}
        name={name}
        defaultValue={searchValue(name)}
        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <option value="">{label}</option>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function searchValue(name: string) {
  return typeof window === 'undefined'
    ? ''
    : (new URLSearchParams(window.location.search).get(name) ?? '');
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

function LoadingTable() {
  return (
    <div
      aria-label="正在加载候选"
      className="space-y-3 rounded-lg border bg-card p-4"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  );
}
