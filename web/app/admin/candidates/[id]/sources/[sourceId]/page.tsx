import { SourcePreview } from '@/components/admin/source-preview';

export default async function CandidateSourcePage({
  params,
}: {
  params: Promise<{ id: string; sourceId: string }>;
}) {
  const { id, sourceId } = await params;
  return <SourcePreview candidateId={id} sourceId={sourceId} />;
}
