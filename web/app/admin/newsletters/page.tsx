import { NewsletterList } from '@/components/admin/newsletter-list';

export default function AdminNewslettersPage() {
  return (
    <div>
      <header className="px-4 py-6 sm:px-6 lg:px-8">
        <p className="eyebrow">DELIVERY DESK</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Newsletter</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          编辑、预览和测试期刊；只有 ChiefEditor 或 Admin 可正式发送。
        </p>
      </header>
      <NewsletterList />
    </div>
  );
}
