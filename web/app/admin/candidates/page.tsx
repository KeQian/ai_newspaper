import { CandidateList } from '@/components/admin/candidate-list';

export default function CandidatesPage() {
  return (
    <div>
      <header className="flex flex-col gap-4 px-4 py-6 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8">
        <div>
          <p className="eyebrow">EDITORIAL QUEUE</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">候选事件</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            核验来源与事实，人工决定是否进入内容生产。
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className="size-2 rounded-full bg-emerald-600"
            aria-hidden="true"
          />
          数据按北京时间展示
        </div>
      </header>
      <CandidateList />
    </div>
  );
}
