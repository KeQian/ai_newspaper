'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 text-foreground">
      <div className="max-w-lg border-l-2 border-destructive pl-6">
        <p className="eyebrow">TEMPORARY ERROR</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">
          页面暂时无法显示
        </h1>
        <p className="mt-4 leading-7 text-muted-foreground">
          你填写或选择的内容不会因为重试而被主动清除。如果问题持续，请稍后再试。
        </p>
        <Button className="mt-7" onClick={reset}>
          重新加载
        </Button>
      </div>
    </main>
  );
}
