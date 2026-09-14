import type { Metadata } from 'next';

import { InformationPage } from '@/components/site/information-page';

export const metadata: Metadata = {
  title: '关于我们',
  description: '了解 AI Signal 的使命、服务对象和编辑承诺。',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <InformationPage
      eyebrow="ABOUT AI SIGNAL"
      title="把噪声变成可以行动的判断"
      description="AI Signal 是面向中文 AI 从业者的独立信息产品，关注真正会改变产品、技术与商业决策的行业动态。"
      updatedAt="2026 年 9 月 12 日"
    >
      <h2>我们解决什么问题</h2>
      <p>
        AI
        行业信息密度高、传播速度快，但首发消息、二手转述和未经证实的推断经常混在一起。我们通过来源追溯、事实核验和编辑判断，帮助读者快速理解发生了什么、为什么重要，以及下一步应关注什么。
      </p>
      <h2>服务谁</h2>
      <p>
        我们主要服务产品经理、工程师、研究人员、创业者、投资人与企业决策者。公开网站不要求注册，也不根据个人画像改变新闻排序。
      </p>
      <h2>我们的承诺</h2>
      <ul>
        <li>区分事实、推断与观点，并为关键事实提供可访问的来源。</li>
        <li>不以未经核验的热度数字制造紧迫感。</li>
        <li>发现重大错误时保留更正记录；必要时撤回内容并说明原因。</li>
        <li>AI 只辅助整理和起草，发布决定始终由编辑作出。</li>
      </ul>
    </InformationPage>
  );
}
