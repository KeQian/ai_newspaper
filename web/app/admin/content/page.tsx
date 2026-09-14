import { ContentList } from '@/components/admin/content-list';

export default function AdminContentPage() {
  return (
    <div>
      <header className="px-4 py-6 sm:px-6 lg:px-8">
        <p className="eyebrow">EDITORIAL CONTENT</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">内容管理</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          编辑、审核、排程并管理已经发布的内容。
        </p>
      </header>
      <ContentList />
    </div>
  );
}
