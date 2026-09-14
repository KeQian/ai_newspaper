import { ArrowUpRight, CheckCircle2, CircleAlert, Radio } from 'lucide-react';

import type { PublicContentListItem } from '@/lib/public-content/types';

export function StoryCard({
  item,
  featured = false,
  index,
}: {
  item: PublicContentListItem;
  featured?: boolean;
  index?: number;
}) {
  return (
    <article
      className={
        featured
          ? 'group grid min-h-80 content-between border-t-2 border-foreground py-6'
          : 'group border-t border-border py-5'
      }
    >
      <div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {typeof index === 'number' ? (
            <span className="font-mono text-primary">
              {String(index).padStart(2, '0')}
            </span>
          ) : null}
          <span>{typeLabel(item.type)}</span>
          <span aria-hidden="true">·</span>
          <VerificationBadge status={item.verification} />
        </div>
        <h3
          className={
            featured
              ? 'mt-4 max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl'
              : 'mt-3 line-clamp-2 text-lg font-semibold leading-7'
          }
        >
          <a
            href={contentHref(item)}
            className="focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {item.title}
            <ArrowUpRight
              className="ml-2 inline size-4 opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden="true"
            />
          </a>
        </h3>
        <p
          className={
            featured
              ? 'mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg'
              : 'mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground'
          }
        >
          {item.summary}
        </p>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <time dateTime={item.publishedAt.toISOString()}>
          {formatTime(item.publishedAt)}
        </time>
        <span>{item.sourceCount} 个来源</span>
        <span>重要度 {item.importance}/5</span>
      </div>
    </article>
  );
}

export function VerificationBadge({ status }: { status: string }) {
  if (status === 'confirmed')
    return (
      <span className="inline-flex items-center gap-1 font-medium text-foreground">
        <CheckCircle2 className="size-3.5 text-[var(--positive)]" />
        已确认
      </span>
    );
  if (status === 'developing')
    return (
      <span className="inline-flex items-center gap-1 font-medium text-foreground">
        <Radio className="size-3.5 text-[var(--warning)]" />
        持续跟进
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 font-medium text-foreground">
      <CircleAlert className="size-3.5 text-destructive" />
      未确认
    </span>
  );
}

export function contentHref(
  item: Pick<PublicContentListItem, 'type' | 'slug' | 'publishedAt'>,
) {
  if (item.type === 'analysis') return `/analysis/${item.slug}`;
  if (item.type === 'briefing')
    return `/briefing/${new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(item.publishedAt)}`;
  return `/news/${item.slug}`;
}

function typeLabel(type: string) {
  return type === 'analysis'
    ? '深度分析'
    : type === 'briefing'
      ? '今日简报'
      : 'AI 快讯';
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value);
}
