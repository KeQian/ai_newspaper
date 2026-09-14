import type { Metadata } from 'next';

import { InformationPage } from '@/components/site/information-page';
import {
  isPlaceholderContactEmail,
  publicContactEmail,
} from '@/lib/site-config';

export const metadata: Metadata = {
  title: '更正政策',
  description: 'AI Signal 接收、评估、标注和发布更正的规则。',
  alternates: { canonical: '/corrections' },
};

export default function CorrectionsPage() {
  const contactEmail = publicContactEmail();
  return (
    <InformationPage
      eyebrow="CORRECTIONS"
      title="更正政策"
      description="准确性比维持原有表述更重要。确认错误后，我们会尽快更正并留下清楚的变更记录。"
      updatedAt="2026 年 9 月 12 日"
    >
      <h2>如何提交</h2>
      <p>
        请通过网站公布的正式联系渠道提供文章链接、疑似错误、支持证据和方便回复的联系方式。我们不会要求你公开敏感个人信息。
      </p>
      <p>
        更正邮箱：
        <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
        {isPlaceholderContactEmail(contactEmail)
          ? '（产品代号阶段地址，正式域名确认后替换）'
          : null}
      </p>
      <h2>如何处理</h2>
      <ol>
        <li>编辑核对原始来源、发布记录和新增证据。</li>
        <li>事实性错误会直接更正，并在文章内记录更正时间和说明。</li>
        <li>不影响事实的拼写或格式修复通常不单独记录。</li>
        <li>无法通过局部修改恢复准确性的内容会被撤回，原链接保留撤回说明。</li>
      </ol>
      <h2>独立性</h2>
      <p>
        自动化和 AI
        可以提示潜在问题，但不能自行更正、撤回或重新发布内容。最终判断由具备权限的编辑完成并写入审计记录。
      </p>
    </InformationPage>
  );
}
