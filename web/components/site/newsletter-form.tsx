'use client';

import { CheckCircle2, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type State =
  | 'idle'
  | 'submitting'
  | 'accepted'
  | 'confirmed'
  | 'unsubscribed'
  | 'error';

export function NewsletterForm() {
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('confirm') ?? params.get('unsubscribe');
      const action = params.has('confirm')
        ? 'confirm'
        : params.has('unsubscribe')
          ? 'unsubscribe'
          : null;
      if (!token || !action) return;
      window.history.replaceState({}, '', '/newsletter');
      setState('submitting');
      void fetch(`/api/v1/newsletter/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error('链接无效或已过期，请重新订阅。');
          setState(action === 'confirm' ? 'confirmed' : 'unsubscribed');
          setMessage(
            action === 'confirm'
              ? '订阅已确认，下一期见。'
              : '已立即退订，不会再进入发送名单。',
          );
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return;
          setState('error');
          setMessage(
            reason instanceof Error ? reason.message : '操作失败，请稍后重试。',
          );
        });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);

  async function submit(event: {
    preventDefault(): void;
    currentTarget: HTMLFormElement;
  }) {
    event.preventDefault();
    setState('submitting');
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/v1/newsletter/subscriptions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          email: form.get('email'),
          consent: form.get('consent') === 'on',
          source: 'newsletter-page',
          website: form.get('website'),
        }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? '提交过于频繁，请稍后再试。'
            : '暂时无法订阅，请稍后重试。',
        );
      setState('accepted');
      setMessage('请检查收件箱，并在 24 小时内点击确认链接。');
      event.currentTarget.reset();
    } catch (reason) {
      setState('error');
      setMessage(reason instanceof Error ? reason.message : '暂时无法订阅。');
    }
  }

  return (
    <div className="border-2 border-foreground bg-card p-5 sm:p-7">
      <h2 className="text-xl font-bold">免费订阅每日 AI 信号</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        每个工作日一封，约 5
        分钟读完。只发编辑确认过的动态、影响判断与原始来源。
      </p>
      <form
        className="mt-5 space-y-4"
        onSubmit={submit}
        aria-describedby="newsletter-status"
      >
        <div className="space-y-2">
          <Label htmlFor="newsletter-email">工作邮箱</Label>
          <Input
            id="newsletter-email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            disabled={state === 'submitting'}
          />
        </div>
        <div className="absolute -left-[10000px]" aria-hidden="true">
          <Label htmlFor="newsletter-website">网站</Label>
          <Input
            id="newsletter-website"
            name="website"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>
        <label className="flex items-start gap-3 text-sm leading-5">
          <input
            name="consent"
            type="checkbox"
            required
            className="mt-1 size-4 accent-primary"
          />
          <span>我同意接收 AI Signal 邮件，并理解每封邮件都可一键退订。</span>
        </label>
        <Button
          type="submit"
          disabled={state === 'submitting'}
          className="w-full sm:w-auto"
        >
          {state === 'submitting' && (
            <Loader2 className="animate-spin" aria-hidden="true" />
          )}
          {state === 'submitting' ? '提交中' : '发送确认邮件'}
        </Button>
      </form>
      <output
        id="newsletter-status"
        aria-live="polite"
        className={`mt-4 block text-sm ${state === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}
      >
        {['accepted', 'confirmed', 'unsubscribed'].includes(state) && (
          <CheckCircle2
            className="mr-2 inline size-4 text-primary"
            aria-hidden="true"
          />
        )}
        {message}
      </output>
    </div>
  );
}
