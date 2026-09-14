# 设计系统与视觉基线

## 1. 设计目标

可信、克制、清晰、敏捷、有人格。产品应像“编辑精选的 AI 行业终端”，不得使用通用 SaaS 渐变 Hero、玻璃拟态、巨型圆角卡片、股票图库人物或无意义动效。

## 2. Token

| 语义 | Light | Dark |
|---|---|---|
| background | `#F7F7F3` | `#151614` |
| surface | `#FFFFFF` | `#1D1F1C` |
| surface-muted | `#EFEFE9` | `#262824` |
| text-primary | `#171717` | `#F3F2EC` |
| text-secondary | `#5E625F` | `#B6BAB3` |
| border | `#DDDCD5` | `#393C36` |
| brand | `#B83117` | `#FF7655` |
| brand-accent | `#E84A27` | `#FF9279` |
| brand-hover | `#8F2512` | `#FFAD9A` |
| on-brand | `#FFFFFF` | `#151614` |
| positive | `#16845B` | `#46C893` |
| warning | `#B26A00` | `#F0AD4E` |
| critical | `#C93636` | `#FF7272` |
| info | `#2563A9` | `#70A9EE` |
| focus | `#155EEF` | `#8AB4FF` |

颜色不可作为状态的唯一表达。正文、元信息、边框和交互态必须满足 WCAG 2.2 AA。

## 3. 排版

- 字体栈：`Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`。
- Display：52/1.12/700；H1：44/1.18/700；H2：32/1.25/700；H3：24/1.35/650。
- 正文：桌面 17/1.8，移动 16/1.75；Meta：13/1.5；Label：14/1.4/600。
- 长文宽度 720px；列表标题最多 2 行，移动主头条最多 3 行，超出省略且链接仍提供完整 accessible name。
- 数字启用 tabular numbers；中英文之间由浏览器排版，不写入多余空格。

## 4. 网格与间距

- 页面最大宽度 1200px；桌面 12 列、24px gutter；移动左右 16px。
- 间距：4、8、12、16、24、32、48、64、96。
- 圆角：输入/按钮 6px，卡片 8px，标签 4px，圆形头像除外。
- 普通卡片无阴影，依靠背景和 1px 边框；阴影只用于 Dialog、Popover、Drawer。

## 5. 响应式基准

| 视口 | 导航 | 内容 | 侧栏 |
|---|---|---|---|
| 320/375 | 56px 顶栏 + 全屏菜单 | 单列，16px 边距 | 移至正文后 |
| 768 | 56px 顶栏 | 单列或 8 列 | 默认折叠 |
| 1024 | 64px 桌面导航 | 12 列 | 可见 |
| 1440 | 64px 桌面导航 | 最大 1200px 居中 | 可见 |

## 6. 图片与图表

- 主头条 16:9；分析封面 3:2；Logo 1:1；列表缩略图 4:3。必须固定尺寸避免 CLS。
- 无图时使用纯色信息版式，不显示破图或随机占位插画。
- 图片必须记录来源、版权、alt 和焦点位置；未经授权不复制媒体原图。
- 图表使用语义色、直接标签和文字结论；移动端允许局部滚动并提供数据表替代。

## 7. 组件行为

- Button：primary、secondary、ghost、danger；每种有 hover、focus-visible、active、disabled、loading。Primary 使用 `brand/on-brand`，不得用 `brand-accent` 承载小号白字。
- Badge：状态使用图标/文字/颜色组合。
- StoryCard：整卡只有一个主链接；来源与主题链接不得嵌套。
- Dialog：锁定焦点，Esc 关闭，关闭后返回触发元素。
- Toast：只做补充反馈，错误必须在操作区域提供恢复入口。
- Skeleton：尺寸贴近真实内容；超过 8 秒切换为可行动错误状态。

## 8. 页面视觉基准

- 首页首屏必须看到“日期/今日判断 + 今日必读”，不使用全屏营销 Hero。
- 最新页以时间和标题为视觉轴，重要度只使用左侧细线与标签。
- 文章页正文保持安静窄栏，来源与更正不可弱化。
- 后台以数据表、分栏审核和固定操作栏为主，不复用营销卡片。

首轮实现应依据本规范和页面需求生成 375px 与 1440px 首页截图，作为视觉回归基线。Figma 或品牌高保真稿不是 T01 的前置阻塞项；没有设计稿时不得偏离本文件的 Token、网格与页面视觉基准。
