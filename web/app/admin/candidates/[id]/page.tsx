import { CandidateDetail } from '@/components/admin/candidate-detail';

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <CandidateDetail id={(await params).id} />;
}
