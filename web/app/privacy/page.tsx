import type { Metadata } from 'next';

import { InformationPage } from '@/components/site/information-page';
import {
  isPlaceholderContactEmail,
  publicContactEmail,
} from '@/lib/site-config';

export const metadata: Metadata = {
  title: '隐私政策',
  description: 'AI Signal 如何收集、使用和保护访问者信息。',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  const contactEmail = publicContactEmail();
  return (
    <InformationPage
      eyebrow="PRIVACY"
      title="隐私政策"
      description="我们只收集提供服务、安全防护和改进产品所必需的信息，并尽量缩短保存时间。"
      updatedAt="2026 年 9 月 12 日"
    >
      <h2>适用范围</h2>
      <p>
        本政策适用于 AI Signal
        的公开网站和邮件服务，不适用于我们链接到的第三方网站。
      </p>
      <h2>我们处理的信息</h2>
      <ul>
        <li>访问日志：请求时间、页面、设备和网络安全所需的技术信息。</li>
        <li>订阅信息：你主动提交的邮箱、订阅状态和发送记录。</li>
        <li>联系信息：你主动提供的邮件内容及必要的回复记录。</li>
      </ul>
      <p>
        我们不出售个人信息，也不建立跨站广告画像。公开网站的内容排序不使用个人画像。
      </p>
      <h2>使用目的与保存</h2>
      <p>
        信息仅用于提供服务、处理退订、防止滥用、排查故障和统计匿名化的产品表现。保存期限依据用途、法律义务和安全需要设定，到期后删除或匿名化。
      </p>
      <h2>你的选择</h2>
      <p>
        每封订阅邮件都会提供退订入口。你也可以通过网站公布的正式联系渠道申请访问、更正或删除与自己相关的信息；我们会在验证请求后处理。
      </p>
      <p>
        联系邮箱：
        <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
        {isPlaceholderContactEmail(contactEmail)
          ? '（产品代号阶段地址，正式域名确认后替换）'
          : null}
      </p>
    </InformationPage>
  );
}
