import type { Metadata } from 'next';

import { InformationPage } from '@/components/site/information-page';

export const metadata: Metadata = {
  title: '编辑方法',
  description: 'AI Signal 的选题、核验、标注与发布方法。',
  alternates: { canonical: '/methodology' },
};

export default function MethodologyPage() {
  return (
    <InformationPage
      eyebrow="EDITORIAL METHOD"
      title="从候选线索到可验证内容"
      description="自动化负责发现与整理，编辑负责核验、判断和发布。每一条公开内容都经过明确的人工作业边界。"
      updatedAt="2026 年 9 月 12 日"
    >
      <h2>一、发现</h2>
      <p>
        定时任务从已登记的数据源获取公开信息，只遵循公开接口、robots.txt、访问频率限制和来源条款。系统保存链接、发布时间、访问时间和必要的最小摘录，不镜像完整文章。
      </p>
      <h2>二、归并</h2>
      <p>
        相同事件的候选线索会按规范化链接、标题相似度和实体关系去重。机器判断只产生候选分组，编辑可以拆分、合并或拒绝。
      </p>
      <h2>三、核验</h2>
      <p>
        关键事实优先核对官方原始材料，并使用独立来源交叉验证。内容会标记为“已核验”“部分核验”或“待核验”，读者不应把后两者视为已经确认的事实。
      </p>
      <h2>四、判断与排序</h2>
      <p>
        编辑依据影响范围、确定性、时效性和可行动性评估重要度。首页“持续观察”的篇数仅表示近期公开内容出现次数，不代表实时热度、市场涨跌或舆情方向。
      </p>
      <h2>五、发布</h2>
      <p>
        自动化和 AI
        不得发布、撤回、更正内容或发送新闻邮件。具有相应权限的编辑完成预览和发布前检查后，才能执行这些动作；所有特权操作都会写入审计记录。
      </p>
    </InformationPage>
  );
}
