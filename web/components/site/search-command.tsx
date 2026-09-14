'use client';

import { Search, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { buttonVariants } from '@/components/ui/button';
import type { SearchPage } from '@/lib/search/types';

const recentKey = 'ai-signal:recent-searches';

export function SearchCommand() {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchPage['items']>([]);
  const [topics, setTopics] = useState<SearchPage['topics']>([]);
  const [recent, setRecent] = useState<string[]>([]);

  const open = useCallback(() => {
    setRecent(readRecent());
    dialog.current?.showModal();
    window.setTimeout(() => input.current?.focus(), 0);
  }, []);

  useEffect(() => {
    trigger.current?.setAttribute('data-ready', 'true');
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editable =
        target?.matches('input, textarea, select, [contenteditable="true"]') ??
        false;
      if (
        (event.key === '/' && !editable) ||
        ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')
      ) {
        event.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/v1/search?q=${encodeURIComponent(query)}&limit=5`, {
        signal: controller.signal,
      })
        .then((response) =>
          response.ok ? (response.json() as Promise<SearchPage>) : null,
        )
        .then((data) => {
          if (data) {
            setSuggestions(data.items);
            setTopics(data.topics);
          }
        })
        .catch((error: Error) => {
          if (error.name !== 'AbortError') setSuggestions([]);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function remember() {
    const value = query.trim();
    if (!value) return;
    localStorage.setItem(
      recentKey,
      JSON.stringify(
        [value, ...readRecent().filter((item) => item !== value)].slice(0, 5),
      ),
    );
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={open}
        className={buttonVariants({ variant: 'ghost', size: 'icon' })}
        aria-label="搜索（快捷键 / 或 Command K）"
      >
        <Search aria-hidden="true" />
      </button>
      <dialog
        ref={dialog}
        className="m-auto w-[min(42rem,calc(100%-2rem))] border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/45"
        aria-labelledby="search-command-title"
      >
        <div className="border-b p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 id="search-command-title" className="text-lg font-bold">
              搜索 AI Signal
            </h2>
            <button
              type="button"
              className={buttonVariants({ variant: 'ghost', size: 'icon' })}
              aria-label="关闭搜索"
              onClick={() => dialog.current?.close()}
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <form
            action="/search"
            method="get"
            className="mt-4 flex gap-2"
            onSubmit={remember}
          >
            <label className="relative flex-1">
              <span className="sr-only">搜索关键词</span>
              <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
              <input
                ref={input}
                name="q"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                maxLength={120}
                autoComplete="off"
                placeholder="搜索事件、公司、产品、模型或主题"
                className="h-10 w-full border bg-card pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <button
              className={buttonVariants()}
              type="submit"
              disabled={!query.trim()}
            >
              搜索
            </button>
          </form>
        </div>
        <div className="max-h-[min(60vh,28rem)] overflow-y-auto p-4 sm:p-5">
          {query.trim().length >= 2 ? (
            <SuggestionList query={query} items={suggestions} topics={topics} />
          ) : recent.length ? (
            <section>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">最近搜索</h3>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  onClick={() => {
                    localStorage.removeItem(recentKey);
                    setRecent([]);
                  }}
                >
                  清除
                </button>
              </div>
              <ul className="mt-3 flex flex-wrap gap-2">
                {recent.map((item) => (
                  <li key={item}>
                    <a
                      className="inline-block border px-3 py-2 text-sm"
                      href={`/search?q=${encodeURIComponent(item)}`}
                    >
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">
              输入至少 2 个字符查看即时建议。最近搜索只保存在当前设备。
            </p>
          )}
        </div>
      </dialog>
    </>
  );
}

function SuggestionList({
  query,
  items,
  topics,
}: {
  query: string;
  items: SearchPage['items'];
  topics: SearchPage['topics'];
}) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="font-semibold">内容建议</h3>
        {items.length ? (
          <ul className="mt-2 divide-y">
            {items.map((item) => (
              <li key={item.id}>
                <a
                  href={hrefFor(item)}
                  className="block py-3 hover:text-primary"
                >
                  <span className="text-xs text-muted-foreground">
                    {typeLabel(item.type)}
                  </span>
                  <span className="mt-1 block font-semibold">
                    {highlight(item.title, query)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            暂无即时匹配，按回车查看完整搜索。
          </p>
        )}
      </section>
      {topics.length ? (
        <section>
          <h3 className="font-semibold">相关主题</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {topics.map((topic) => (
              <a
                key={topic.id}
                href={`/topics/${topic.slug}`}
                className="border px-3 py-2 text-sm hover:border-foreground"
              >
                {topic.name}
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function highlight(value: string, query: string) {
  const index = value
    .toLocaleLowerCase()
    .indexOf(query.trim().toLocaleLowerCase());
  if (index < 0 || !query.trim()) return value;
  return (
    <>
      {value.slice(0, index)}
      <mark className="bg-[color-mix(in_srgb,var(--accent)_24%,transparent)] text-inherit">
        {value.slice(index, index + query.trim().length)}
      </mark>
      {value.slice(index + query.trim().length)}
    </>
  );
}

function readRecent(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(recentKey) ?? '[]');
    return Array.isArray(value)
      ? value.filter((item) => typeof item === 'string').slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

function hrefFor(item: SearchPage['items'][number]) {
  if (item.type === 'analysis') return `/analysis/${item.slug}`;
  if (item.type === 'briefing')
    return `/briefing/${formatBriefingDate(item.publishedAt)}`;
  return `/news/${item.slug}`;
}

function formatBriefingDate(value: Date | string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function typeLabel(type: string) {
  return type === 'analysis'
    ? '深度分析'
    : type === 'briefing'
      ? '日报'
      : '快讯';
}
