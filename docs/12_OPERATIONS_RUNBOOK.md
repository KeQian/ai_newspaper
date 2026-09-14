# 生产运维与故障处理

## 1. 服务目标

- 公共阅读月度可用性目标 99.9%。
- 内容 API p95 ≤ 800ms；后台关键写操作 p95 ≤ 1500ms，不含外部 AI 调用。
- 核心来源发现延迟目标 60 分钟，一般来源 6 小时。
- PostgreSQL RPO ≤ 1 小时、RTO ≤ 4 小时；对象存储 RPO ≤ 24 小时。发布内容、审计记录和订阅抑制名单优先恢复。

## 2. 环境

开发、预发布、生产使用独立数据库、对象存储、域名、邮件配置和凭据。生产数据不得复制到开发；需要样本时脱敏并最小化。

## 3. 备份

- PostgreSQL 每日全量 + 支持时间点恢复；每月演练一次恢复。
- 对象存储开启版本或等效保护。
- 来源配置、迁移和提示版本进入版本控制。
- 审计和退订抑制数据纳入备份校验。

## 4. 监控

- Web：可用性、5xx、延迟、缓存命中、Core Web Vitals。
- 数据库：连接、慢查询、存储、复制/备份状态。
- 采集：来源成功率、发现延迟、解析异常、重复率、游标停滞。
- 邮件：排队、发送、退信、投诉、退订。
- 安全：管理员失败登录、越权、SSRF 拒绝、提示注入标记。

### 可执行探针与仪表

- `GET /api/v1/health` 是无下游依赖的 liveness，只返回 `status` 和 `requestId`；不用于判断数据库就绪。
- `GET /api/v1/internal/operations/status` 必须使用独立 `OPERATIONS_TOKEN` Bearer 凭据。它输出采集状态、连续失败/超时核心来源数、outbox 积压/失败、邮件失败/投诉数和已评估告警；不返回邮箱、搜索词、正文、token 或原始响应。
- 仪表至少展示 `databaseReady`、`ingestion.running/failedLast24h/partialLast24h`、`sources.failing/staleCore`、`outbox.pending/failed/oldestAvailableAt`、`newsletter.failedDeliveriesLast24h/complainedLast24h`。
- 监控端每 60 秒抓取一次；401 视为监控凭据故障，503 视为就绪故障。`requestId` 必须传入日志聚合器。

## 5. 告警等级

- SEV1：公开站不可用、数据泄露、越权发布、错误群发。立即响应并停止相关写入。
- SEV2：发布失败、核心来源超过 2 小时、Newsletter 批次失败。工作时间 30 分钟内处理。
- SEV3：单来源失败、解析质量下降、非核心页面异常。一个工作日内处理。

上线前为每类告警填写实际负责人和联系渠道。

### 默认告警规则

| 代码 | 级别 | 触发 | 恢复验证 |
|---|---|---|---|
| `DATABASE_UNAVAILABLE` | SEV1 | 内部状态端点 503 | 数据库连接和公开读取 smoke 通过 |
| `CORE_SOURCE_STALE` | SEV2 | 任一启用 s0 来源超过 2 小时未成功 | 来源成功且游标可追溯 |
| `NEWSLETTER_DELIVERY_FAILED` | SEV2 | 24 小时投递失败 > 0 | 只重试未完成 delivery |
| `OUTBOX_FAILED` / `OUTBOX_BACKLOG` | SEV2 | 失败 > 0 或最旧 pending 超过 15 分钟 | worker 恢复且不重复副作用 |
| `SOURCE_CONSECUTIVE_FAILURES` | SEV3 | 启用来源连续失败 ≥ 3 | 成功一次或管理员审计后暂停 |
| `INGESTION_DEGRADED` | SEV3 | 24 小时内 run failed/partial > 0 | 失败来源补跑完成 |
| `NEWSLETTER_COMPLAINT` | SEV3 | 24 小时投诉 > 0 | 抑制已生效并完成投递内容复核 |

## 6. 常见故障

### Codex/本地机器离线

公开站不受影响；恢复后运行 `pnpm automation:run -- <job-key>`，系统从最后调度窗口自动补跑最多 24 小时，每个来源仍从已提交游标恢复。若离线超过 24 小时，不盲目全量自动请求；由编辑扩大回看并检查数据量。

### 来源结构变化

暂停该来源推进游标，保存诊断 fixture，修复解析器并在预发布重放后恢复。不得直接删除失败记录。

### 搜索索引异常

公共内容详情继续可读；临时关闭搜索或返回降级说明。从 PostgreSQL 已发布内容重建索引并核对数量。

### Newsletter 错误

立即暂停批次，保留已发送/未发送状态；禁止整体重发。排除已发送和抑制地址后恢复。

邮件队列由 `pnpm newsletter:process` 以有界批次消费；命令只处理 PostgreSQL outbox 中的确认、测试和正式发送事件。正式环境必须配置 `NEWSLETTER_PUBLIC_URL`、独立的 token/webhook 密钥、发件地址和 Email Adapter 凭据。命令返回非零失败数时停止扩大批次并检查供应商状态；恢复后重跑只会领取未完成事件和投递，不会重发已经完成的收件人。

### 错误发布

ChiefEditor 撤回并写原因，保留 URL；若只是事实修正，发布新版本与 correction note。同步刷新缓存、搜索、RSS 和社交预览。

## 7. 发布与回滚

- 发布前执行迁移检查、质量门、备份状态检查和 smoke test。
- 数据库变更采用 expand/migrate/contract，不能与旧应用立即不兼容。
- 应用回滚不回滚已经写入的内容和审计记录。
- 发布后检查首页、详情、后台登录、订阅和一次测试采集。

## 8. 备份恢复演练

1. 从托管 PostgreSQL 的每日全量备份创建一个完全隔离、禁止公网业务流量的恢复库，再选择过去 1 小时内的恢复点验证 PITR。
2. 只对恢复库设置 `RESTORE_DATABASE_URL`，且必须与 `DATABASE_URL` 不同；执行 `pnpm ops:restore-verify`。命令只输出审计、公开内容、抑制订阅者和启用来源的计数，不输出邮箱或内容。
3. 抽查撤回内容、审计 append-only 触发器、退订/退信/投诉抑制状态和对象存储版本；不对恢复库发送邮件或执行发布。
4. 记录备份时间、目标恢复点、实际 RPO/RTO、验证计数、演练人和异常；验练库按供应商的可恢复流程销毁。
5. 每月执行一次；上线检查拒绝 31 天以前的恢复演练。

## 9. 预发与上线门禁

1. 预发执行 `pnpm check`，并检查 OpenAPI、配置模板、迁移和高危生产依赖审计。
2. 使用预发凭据运行首页、最新、搜索、详情、Newsletter 通用 202/确认/退订、后台 OIDC+MFA、发布/撤回、测试邮件和 fixture 采集 smoke。
3. 注入测试告警，确认 SEV1/2/3 路由到实际负责人；记录 `LAUNCH_ALERTS_TESTED_AT`，7 天后失效。
4. 完成地区/数据驻留、品牌/域名、法务、OIDC+MFA、发件域 SPF/DKIM/DMARC 和回调签名确认，再把对应 `LAUNCH_*` 门禁设为 `true`。
5. 使用实际生产环境执行 `pnpm ops:launch-check`；任一 blocker 均停止发布，输出只包含代码不包含配置值。
6. 发布后 30 分钟观察 liveness、内部状态、5xx、p95、Core Web Vitals、来源延迟、outbox 和邮件回调；达到 SEV1 立即停止写入并回滚应用版本。
