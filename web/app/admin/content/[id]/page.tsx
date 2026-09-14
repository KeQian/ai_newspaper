import { ContentEditor } from '@/components/admin/content-editor';

export default async function ContentEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <ContentEditor id={(await params).id} />;
}
