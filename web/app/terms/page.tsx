import type { Metadata } from 'next';

import { InformationPage } from '@/components/site/information-page';

export const metadata: Metadata = {
  title: '使用条款',
  description: '使用 AI Signal 网站和内容时适用的基本条款。',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <InformationPage
      eyebrow="TERMS"
      title="使用条款"
      description="访问或使用 AI Signal 即表示你同意以下条款；如不同意，请停止使用本服务。"
      updatedAt="2026 年 9 月 12 日"
    >
      <h2>内容用途</h2>
      <p>
        本站提供一般性行业信息，不构成法律、投资、医疗或其他专业建议。你应根据自己的情况核实信息并独立决策。
      </p>
      <h2>知识产权与引用</h2>
      <p>
        AI Signal
        的原创文字、版式和标识受适用法律保护。可以合理引用少量内容并清晰标注出处及原文链接；未经许可，不得批量复制、重新发布或建立镜像服务。第三方材料的权利属于相应权利人。
      </p>
      <h2>允许与禁止的使用</h2>
      <p>
        不得绕过访问控制、干扰服务、投放恶意代码、冒充他人，或以违反法律和第三方权利的方式使用本站。自动访问必须遵守
        robots.txt、频率限制和已公布的接口规则。
      </p>
      <h2>服务变更</h2>
      <p>
        我们可能为安全、合规或产品改进调整服务。对重大条款变更，我们会更新本页日期并以合理方式提示。
      </p>
    </InformationPage>
  );
}
