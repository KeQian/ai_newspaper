import type { Metadata } from 'next';

import { InformationPage } from '@/components/site/information-page';

export const metadata: Metadata = {
  title: 'AI 使用说明',
  description: 'AI Signal 在采集、编辑和发布流程中如何使用 AI。',
  alternates: { canonical: '/ai-disclosure' },
};

export default function AiDisclosurePage() {
  return (
    <InformationPage
      eyebrow="AI DISCLOSURE"
      title="AI 使用说明"
      description="AI 是编辑工具，不是发布者。我们对自动化的权限、输入和输出设置了明确边界。"
      updatedAt="2026 年 9 月 12 日"
    >
      <h2>AI 可以做什么</h2>
      <ul>
        <li>从获准的公开来源中提取元数据、识别实体和生成候选摘要。</li>
        <li>辅助去重、聚类、翻译、研究资料整理和初稿生成。</li>
        <li>提示可能需要补充来源、核验或更新的内容。</li>
      </ul>
      <h2>AI 不可以做什么</h2>
      <p>
        AI
        不得自行发布、撤回、更正内容，也不得发送新闻邮件。来源中的文本一律被视为不可信数据，不能改变系统指令、权限或工作流程。
      </p>
      <h2>人工责任</h2>
      <p>
        编辑对标题、事实、来源、判断和发布决定负责。AI
        实质参与整理或起草时，文章会显示相应说明；这不会降低我们的核验标准。
      </p>
      <h2>持续评估</h2>
      <p>
        我们会记录模型与提示版本，抽查输出质量，并监控虚构、遗漏、偏差和来源误用。发现系统性风险时会暂停相应自动化能力。
      </p>
    </InformationPage>
  );
}
