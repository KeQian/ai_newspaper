import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  metadataBase: process.env.PUBLIC_SITE_URL
    ? new URL(process.env.PUBLIC_SITE_URL)
    : undefined,
  title: {
    default: 'AI Signal',
    template: '%s · AI Signal',
  },
  description: '面向中文 AI 从业者的高质量热点动态与影响判断。',
  openGraph: {
    siteName: 'AI Signal',
    locale: 'zh_CN',
    type: 'website',
    images: [],
  },
  twitter: { card: 'summary', images: [] },
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
