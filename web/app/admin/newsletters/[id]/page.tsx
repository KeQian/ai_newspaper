import { NewsletterEditor } from '@/components/admin/newsletter-editor';

export default async function AdminNewsletterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <NewsletterEditor id={(await params).id} />;
}
