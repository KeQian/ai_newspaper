import { ContentPreview } from '@/components/admin/content-preview';

export default async function ContentPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <ContentPreview id={(await params).id} />;
}
