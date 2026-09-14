import { ShieldCheck } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function AdminLoginPage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg items-center p-6">
      <div className="w-full rounded-lg border bg-card p-6 sm:p-8">
        <p className="eyebrow">SECURE ACCESS</p>
        <h1 className="mt-2 text-2xl font-bold">管理员登录</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          生产环境通过已配置的 OIDC 身份提供方和 MFA
          登录，不在本站保存管理员密码。
        </p>
        <Alert className="mt-6">
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>身份提供方入口待部署配置</AlertTitle>
          <AlertDescription>
            当前工程已启用会话、邮箱白名单、角色权限和同源保护；部署前需绑定组织身份提供方。
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}
