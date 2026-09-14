'use client';

import { Check, Copy, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

export function ShareActions({ title }: { title: string }) {
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice('链接已复制');
    } catch {
      setNotice('复制失败，请从地址栏复制');
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title, url: window.location.href });
      } catch {
        return;
      }
    } else setNotice('可复制链接后发送到微信');
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="分享文章">
      <Button variant="outline" size="sm" onClick={() => void copyLink()}>
        {notice === '链接已复制' ? <Check /> : <Copy />}复制链接
      </Button>
      <Button variant="outline" size="sm" onClick={() => void share()}>
        <Share2 />
        分享
      </Button>
      <output className="text-sm text-muted-foreground" aria-live="polite">
        {notice}
      </output>
    </div>
  );
}
