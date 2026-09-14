'use client';

import { ArrowLeft, Monitor, Save, Send, Smartphone } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { ContentBody } from '@/components/admin/content-body';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

type Issue = {
  id: string;
  issueDate: string;
  subject: string;
  preheader: string;
  body: Record<string, unknown>;
  contentIds: string[];
  status: string;
  version: number;
};

export function NewsletterEditor({ id }: { id: string }) {
  const [issue, setIssue] = useState<Issue | null>(null);
  const [subject, setSubject] = useState('');
  const [preheader, setPreheader] = useState('');
  const [body, setBody] = useState('');
  const [contentIds, setContentIds] = useState('');
  const [preview, setPreview] = useState<'desktop' | 'mobile'>('desktop');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const response = await fetch(`/api/v1/admin/newsletters/${id}`, {
        credentials: 'same-origin',
      });
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? '需要管理员登录。'
            : response.status === 403
              ? '当前角色没有查看权限。'
              : '期刊加载失败。',
        );
      const value = (await response.json()) as Issue;
      setIssue(value);
      setSubject(value.subject);
      setPreheader(value.preheader);
      setBody(JSON.stringify(value.body, null, 2));
      setContentIds(value.contentIds.join('\n'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '期刊加载失败。');
    }
  }, [id]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function save() {
    if (!issue) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/v1/admin/newsletters/${id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subject,
          preheader,
          body: JSON.parse(body),
          contentIds: lines(contentIds),
          version: issue.version,
        }),
      });
      const result = (await response.json()) as Issue & { message?: string };
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? '版本冲突或期刊已进入发送流程，请刷新核对。'
            : (result.message ?? '保存失败。'),
        );
      setIssue(result);
      setMessage('草稿已保存为新版本。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败。');
    } finally {
      setBusy(false);
    }
  }

  async function action(kind: 'send-test' | 'send') {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (
        kind === 'send' &&
        !window.confirm(
          '正式发送不可撤销。确认只向当前活动且未被抑制的订阅者排队发送？',
        )
      )
        return;
      const response = await fetch(`/api/v1/admin/newsletters/${id}/${kind}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers:
          kind === 'send'
            ? { 'idempotency-key': crypto.randomUUID() }
            : undefined,
      });
      const result = (await response.json()) as {
        message?: string;
        recipientCount?: number;
      };
      if (!response.ok)
        throw new Error(
          response.status === 403
            ? '当前角色无权正式发送，或需要重新完成 MFA。'
            : (result.message ?? '操作失败。'),
        );
      setMessage(
        kind === 'send'
          ? `已为 ${result.recipientCount ?? 0} 位有效订阅者建立不可重复的发送批次。`
          : '测试邮件已进入队列，仅发送到当前管理员邮箱。',
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败。');
    } finally {
      setBusy(false);
    }
  }

  if (!issue && !error)
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  if (!issue)
    return (
      <Alert variant="destructive" className="m-6">
        <AlertTitle>无法打开期刊</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  let parsedBody: Record<string, unknown> | null = null;
  try {
    parsedBody = JSON.parse(body) as Record<string, unknown>;
  } catch {
    /* editor shows validation on save */
  }
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <a
        href="/admin/newsletters"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        返回期刊列表
      </a>
      <header className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">{issue.issueDate}</p>
          <h1 className="mt-1 text-3xl font-bold">期刊编辑</h1>
        </div>
        <Badge variant="outline">
          {issue.status} · v{issue.version}
        </Badge>
      </header>
      {error && (
        <Alert variant="destructive" className="mt-5">
          <AlertTitle>操作未完成</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {message && (
        <Alert className="mt-5">
          <AlertTitle>已完成</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
        <section className="space-y-4">
          <div>
            <Label htmlFor="newsletter-subject">邮件主题</Label>
            <Input
              id="newsletter-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              disabled={issue.status !== 'draft'}
            />
          </div>
          <div>
            <Label htmlFor="newsletter-preheader">预览文案</Label>
            <Input
              id="newsletter-preheader"
              value={preheader}
              onChange={(event) => setPreheader(event.target.value)}
              disabled={issue.status !== 'draft'}
            />
          </div>
          <div>
            <Label htmlFor="newsletter-body">受限 JSON 正文</Label>
            <Textarea
              id="newsletter-body"
              className="min-h-64 font-mono text-xs"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              disabled={issue.status !== 'draft'}
            />
          </div>
          <div>
            <Label htmlFor="newsletter-content">
              已发布内容 UUID（每行一个）
            </Label>
            <Textarea
              id="newsletter-content"
              value={contentIds}
              onChange={(event) => setContentIds(event.target.value)}
              disabled={issue.status !== 'draft'}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void save()}
              disabled={busy || issue.status !== 'draft'}
            >
              <Save aria-hidden="true" />
              保存
            </Button>
            <Button
              variant="outline"
              onClick={() => void action('send-test')}
              disabled={busy}
            >
              <Send aria-hidden="true" />
              测试发送
            </Button>
            <Button
              variant="destructive"
              onClick={() => void action('send')}
              disabled={busy || issue.status !== 'draft'}
            >
              正式发送
            </Button>
          </div>
        </section>
        <aside>
          <div className="mb-3 flex gap-2" aria-label="预览尺寸">
            <Button
              size="sm"
              variant={preview === 'desktop' ? 'default' : 'outline'}
              onClick={() => setPreview('desktop')}
            >
              <Monitor aria-hidden="true" />
              桌面
            </Button>
            <Button
              size="sm"
              variant={preview === 'mobile' ? 'default' : 'outline'}
              onClick={() => setPreview('mobile')}
            >
              <Smartphone aria-hidden="true" />
              移动
            </Button>
          </div>
          <div
            className={`mx-auto border bg-background p-5 shadow-sm ${preview === 'mobile' ? 'max-w-[375px]' : 'max-w-[680px]'}`}
          >
            <p className="text-xs text-muted-foreground">
              AI SIGNAL · {issue.issueDate}
            </p>
            <h2 className="mt-3 text-2xl font-bold">{subject || '邮件主题'}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{preheader}</p>
            <div className="mt-6 border-t pt-5">
              {parsedBody ? (
                <ContentBody document={parsedBody} />
              ) : (
                <p className="text-sm text-destructive">JSON 格式无效</p>
              )}
            </div>
            <p className="mt-8 border-t pt-4 text-xs text-muted-foreground">
              正式邮件会自动加入独立退订链接。
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function lines(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}
