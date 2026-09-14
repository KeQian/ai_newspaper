# 决策基线

状态说明：`Accepted` 可直接实施；`Provisional` 按默认方案实施但保留替换边界；`Required before launch` 必须在上线前由负责人确认。

| ID | 决策 | 状态 | 理由与影响 |
|---|---|---|---|
| D-001 | P0 不提供公开用户账户、收藏、关注和提醒 | Accepted | 首版只验证阅读、来源点击和 Newsletter；后台仍需管理员认证。 |
| D-002 | 不实现会员、付费墙、订单和支付 | Accepted | 所有公开内容免费；代码与数据模型不得预留假付费逻辑。 |
| D-003 | Codex 只能写入原始记录、候选事件和草稿，不能直接发布或发送 Newsletter | Accepted | 保留编辑责任和审计链。 |
| D-004 | 内容业务时区为 `Asia/Shanghai`，数据库时间保存为 UTC | Accepted | “今天”、日报日期和排程统一按北京时间解释。 |
| D-005 | P0 是 TypeScript 模块化单体，公共站、后台和内部 API 在同一仓库 | Provisional | 降低首版运维复杂度，模块边界须清晰。 |
| D-006 | PostgreSQL 是事实数据源；对象存储保存媒体；搜索 P0 使用 PostgreSQL 全文/相似匹配 | Provisional | 避免首版引入独立搜索集群，保留搜索适配器。 |
| D-007 | 数据采集优先级：官方 API/Webhook > RSS/Atom > Sitemap/网页变化检测 > 人工录入 | Accepted | 稳定、合规、可追溯。 |
| D-008 | P0 只接入 20～30 个白名单来源；稳定运行 14 天后扩展至 30～50 个 | Accepted | 控制噪声和编辑负荷。 |
| D-009 | P0 目标更新延迟：核心官方源 60 分钟内，一般来源 6 小时内，日报每日 08:00 前可审核 | Accepted | Codex 本地调度不是硬实时系统。 |
| D-010 | Newsletter 使用双重确认，退订即时生效 | Accepted | 降低误订阅和投诉风险。 |
| D-011 | 邮件、对象存储、部署平台均使用 Adapter；开发环境必须有本地替代实现 | Accepted | 避免供应商阻塞开发。 |
| D-012 | 部署地区与数据驻留 | Required before launch | 默认按香港或新加坡部署评估；若部署中国大陆，须先完成备案与合规审查。 |
| D-013 | 正式品牌名、Logo 和域名 | Required before launch | 未确认前使用产品代号 `AI Signal`，不得制作不可替换的品牌资产。 |
| D-014 | P0 后台角色：Editor、ChiefEditor、Admin | Accepted | Editor 可编辑；ChiefEditor 可发布/撤回；Admin 管理来源与权限。 |
| D-015 | Web 基线采用 Node.js 22 LTS、pnpm、Sites Vinext（兼容 Next App Router）、React 19、TypeScript、Tailwind CSS（仅绑定设计 Token）、Vitest 和 Playwright；数据阶段使用 Drizzle 与 Zod | Accepted | T01 已按官方 Sites 脚手架落地并提交 lockfile；不使用浮动版本部署。 |
| D-016 | 生产后台采用 OIDC 身份提供方 + 邮箱 allowlist，并在 IdP 强制 MFA；应用保存服务端会话，不在 P0 保存管理员密码 | Provisional | 将密码与二次验证责任交给专用身份系统；开发/测试使用仅非生产可用的适配器。 |
| D-017 | P0 不引入 Redis 或独立消息队列；任务锁、outbox 与可重试工作使用 PostgreSQL 实现 | Accepted | 与模块化单体一致；达到明确容量阈值后再拆分。 |
| D-018 | 正文使用版本化的受限 JSON 文档模型，不保存可直接执行的 HTML | Accepted | 统一 Web、邮件与预览渲染；节点和 URL 均需 allowlist 校验。 |
| D-019 | 后台服务端会话默认 4 小时，发布、撤回、正式发送和权限管理要求 15 分钟内的 MFA；会话 Cookie 使用 Secure、HttpOnly、SameSite=Strict | Provisional | 时长可通过受限环境变量调整；具体 OIDC 提供方确定后需结合其会话与重新认证能力复核。 |
| D-020 | 来源健康状态由 `last_success_at`、连续失败次数与调度周期实时推导，不单独持久化；连续 1～2 次失败为 degraded，3 次及以上为 failing，超过两个调度周期未成功为 stale | Provisional | 避免状态副本与运行记录漂移；稳定运行 14 天后按真实来源基线复核阈值。 |
| D-021 | 首个生产连接器使用 GitHub Releases REST API；只请求注册表中的 `api.github.com` 精确端点，拒绝重定向，响应先归档再解析，开发归档使用受限本地目录、托管环境通过 R2 Adapter | Accepted | 覆盖增量、重试、归档、解析和幂等的完整 API 来源链路，同时保持存储供应商可替换。 |
| D-022 | T06 使用 Hugging Face Models API 的最近更新时间排序结果和 arXiv Atom API 的受限白名单查询；两者复用归档、重试、幂等和游标事务边界，并在条款复核前保持禁用 | Accepted | 完成多类型来源能力但不提前越过 `review_before_launch` 门禁；Hugging Face 下载数只作为元数据，arXiv 不下载或保存论文全文。 |
| D-023 | 候选生成先按内容哈希执行跨来源精确去重，再通过严格 `CandidateOutput 1.0` 生成审核候选；Schema 最多重试一次，失败进入异常队列，实体和相似事件只生成待人工确认的建议 | Accepted | 保证重复记录不重复消耗模型或创建事件，模型不能建立已确认实体关系、自动合并或发布；Codex 响应包只能从受限目录导入并仍需服务端校验。 |
| D-024 | 候选“延后”不新增业务状态，而是保留 `review` 并设置 `deferred_until=操作时间+24h`；默认队列隐藏未到期候选，显式筛选可查看 | Accepted | 避免 `deferred` 与候选状态机重复表达；到期自动回到默认队列，无需定时任务改状态，操作理由和时间写入审计。 |
| D-025 | `content_items.current_revision` 只表示不可变内容快照版本：显式保存与勘误递增，纯状态转换不递增；所有转换在行锁内检查当前状态与提交版本 | Accepted | 让版本历史只对应正文和元数据差异，同时用状态机、行锁与乐观锁阻止并发越权发布；发布/撤回通过同事务 outbox 驱动缓存、搜索、RSS 与站点地图的可重试刷新。 |
| D-026 | 首页头条按编辑重要度与发布时间确定性排序；主题筛选只改变“今日 AI 雷达”，持续观察只展示近期公开内容出现次数 | Accepted | 保持首页核心判断稳定，避免把篇数伪装成实时热度、趋势方向或市场信号。 |
| D-027 | 历史 slug 的公共 API 返回 301；页面层采用框架的永久重定向语义（HTTP 308） | Provisional | Next App Router 的 `permanentRedirect` 使用 308 并保留请求方法；浏览器 GET 行为与永久 301 等价，搜索引擎均按永久迁移处理。若上线 SEO 验证要求严格 301，再在边缘路由层替换。 |
| D-028 | 日报期数采用北京时间发布日期的 `YYYYMMDD`，正文扩展节点继续使用 D-018 的受限 JSON 白名单 | Accepted | 日期期数稳定、无需可漂移的独立计数器；表格、图表、提示框和脚注均经过边界校验并由受控组件渲染，不接受任意 HTML。 |
| D-029 | 搜索使用与发布事务同步的 PostgreSQL 投影，中文采用受控子串匹配、英文采用 `simple` 全文检索，实体正式名与别名一并投影；公开查询仍联结内容公开状态，限流计数存入 PostgreSQL | Accepted | 撤回即删除投影且查询侧二次隔离，避免陈旧投影泄漏；固定窗口原子计数适用于多实例部署；日志只记录请求 ID 和错误类别，不记录原始查询或客户端地址。1 万条基准语料的预热检索 p95 纳入自动化门禁。 |
| D-030 | Newsletter 采用 PostgreSQL outbox + 供应商无关 HTTP Email Adapter；确认 token 每次发送前轮换且仅存 SHA-256，退订 token 由订阅者 ID 与服务端 HMAC 密钥确定性生成、数据库仍只存哈希；回调使用 5 分钟时间窗内的原始请求体 HMAC 并按供应商事件 ID 去重 | Provisional | 保证队列可恢复、历史邮件退订链接持续有效且数据库不保存明文 token；正式邮件供应商尚未确定，因此生产只需替换 Adapter/事件映射，不改变订阅、抑制和发送事务。供应商选择、发件域认证及法律文案仍是 T15 发布门禁。 |
| D-031 | 普通定时任务通过受控 CLI 进入现有采集服务；调度窗口以 Asia/Shanghai 规则计算后存 UTC，最多自动补跑过去 24 小时；同一 job 使用 PostgreSQL 可过期租约和每来源心跳防并发 | Accepted | 离线恢复不会建立第二事实库，重复窗口仍由 run 幂等键拦截；超过 30 分钟未更新的来源工作标记为 `SOURCE_LEASE_EXPIRED` 且不推进游标，之后只恢复失败来源。Codex 调度身份仍不具备发布或发信权限。 |
| D-032 | 公开 `/health` 只表示进程存活；数据库、采集、来源、outbox 和邮件指标由独立 `OPERATIONS_TOKEN` 保护的内部端点输出，不包含邮箱或正文 | Accepted | 负载均衡存活探测不因下游抖动重启进程，而就绪/告警系统仍可检测事实库和队列故障。生产上线必须同时通过自动配置检查和地区/品牌/法务/OIDC/发件域/恢复演练/告警演练人工门禁。 |

## P0 最终范围

- 公共：首页、最新、日报、快讯、深度文章、搜索、Newsletter、关于/方法论/法律页。
- 后台：登录、候选池、内容编辑、发布、更正、来源、任务运行、Newsletter。
- 数据：来源注册、采集、原始归档、去重、候选事件、实体建议、审核、发布。
- 运维：日志、审计、备份、告警、任务补跑。

## P0 明确不做

- 公开用户账户、收藏、关注、提醒。
- 会员、支付、广告投放系统。
- 全网社交舆情、自动发布、原生 App。
- 独立微服务、Redis/消息队列集群、复杂推荐算法。

任何改变 Accepted 决策的实现必须先更新本文件，并在任务结果中说明影响。
