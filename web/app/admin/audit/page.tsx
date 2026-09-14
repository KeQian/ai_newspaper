import { AuditList } from '@/components/admin/audit-list';

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const value = (key: string) =>
    typeof query[key] === 'string' ? query[key] : '';
  return (
    <div>
      <header className="px-4 py-6 sm:px-6 lg:px-8">
        <p className="eyebrow">CONTROL PLANE</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">审计日志</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          只追加的高权限操作记录。页面展示前会再次脱敏邮箱、令牌、原文与密钥字段。
        </p>
      </header>
      <AuditList
        initialFilters={{
          action: value('action'),
          objectType: value('objectType'),
          requestId: value('requestId'),
        }}
      />
    </div>
  );
}
