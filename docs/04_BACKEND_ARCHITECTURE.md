# 后端架构与部署边界

## 1. 架构选择

P0 使用 Sites Vinext（兼容 Next App Router）+ React 19 + TypeScript 模块化单体：同一仓库包含公共 Web、管理后台、内部 API 和任务命令；Node.js 22 LTS 为开发运行时，pnpm 管理依赖。数据阶段由 Drizzle 管理 PostgreSQL Schema 与迁移，Zod 校验边界数据。对象存储保存媒体；邮件、身份、数据库传输、搜索、存储和模型调用均通过 Adapter 隔离供应商。

```text
Browser/CDN
  → Web application
      ├─ Public content module
      ├─ Admin/editorial module
      ├─ Newsletter module
      ├─ Search adapter
      └─ Internal ingestion API
            ↓
        PostgreSQL ← Ingestion CLI/Codex scheduled tasks
            ↓
        Object storage
```

## 2. 模块职责

- `content`：内容版本、发布、撤回、更正、页面查询。
- `editorial`：候选池、审核、合并/拆分、排程、审计。
- `ingestion`：来源、运行、原始记录、解析、去重和候选事件。
- `entities`：实体、别名、合并和重定向。
- `search`：索引投影和查询；不得成为事实数据源。
- `newsletter`：订阅、确认、退订、期刊、发送和事件回调。
- `identity`：仅 P0 后台管理员认证和 RBAC。
- `media`：上传、元数据、版权和派生尺寸。
- `observability`：结构化日志、指标、告警和 request/run ID。

模块只能通过公开 service 接口写入其他模块的数据，不跨模块直接散落查询。

生产管理员通过 OIDC 登录并在身份提供方强制 MFA；本地测试身份适配器必须在生产构建中硬禁用。后台会话保存在服务端、使用 Secure/HttpOnly/SameSite Cookie，并执行邮箱 allowlist 与本地角色映射。

P0 的异步工作使用 PostgreSQL outbox、行锁或 advisory lock；不依赖 Redis。Web 进程与 worker 可由同一镜像以不同启动命令运行，worker 不暴露公网端口。

## 3. 关键流程

### 发布

候选事件 → 编辑建稿 → ChiefEditor 审核 → 发布事务 → 写内容版本 → 写审计 → 刷新缓存/搜索/RSS。搜索或缓存刷新失败不回滚已发布内容，但进入可重试 outbox。

### 撤回/更正

撤回保留 URL 和说明；更正创建新版本并追加 correction note。两者都刷新搜索和缓存并记录操作者。

### 采集

任务创建 `ingestion_run` → 按来源读取 → 原始记录幂等写入 → 解析 → 去重/聚类 → 候选事件 → 结束运行并输出统计。单来源失败不终止其他来源。

GitHub Releases、Hugging Face Models 和 arXiv Atom 连接器共享 Connector、HTTP、Archive Store 和 Repository 四个边界。每个 Parser 只接受对应官方域名、路径和受限查询参数；外部响应通过 R2 Adapter 或受限本地文件 Adapter 先归档，数据库只保存对象键和允许公开的元数据/摘录。连接器核心不直接读取进程环境变量或文件系统。

批次执行器从运行记录读取来源状态，按来源独立执行并收集安全错误码。一个来源失败后继续处理其余来源；再次执行同一批次时跳过已成功来源，只恢复 `queued` 或 `failed` 来源。每次来源完成后数据库重新聚合批次状态，因此最终状态可为 `succeeded`、`partial` 或 `failed`。

## 4. 一致性和并发

- 发布、撤回、实体合并和订阅状态变化使用事务。
- 编辑保存携带版本号；版本不一致返回冲突，不静默覆盖。
- 所有任务写入使用幂等键；重试不得重复创建内容。
- 外部副作用通过 outbox 记录后异步执行。

## 5. 缓存

- 已发布列表和详情允许 CDN/服务端缓存；草稿、预览和后台禁止公共缓存。
- 内容发布/更新/撤回主动失效对应 URL、首页、最新页、主题页、RSS 和 sitemap。
- 缓存失效失败必须可重试并告警。

## 6. 部署

- P0：一个 Cloudflare Worker 兼容 Web 构建、独立任务 Worker、一个托管 PostgreSQL、一个对象存储。托管 Web 访问 PostgreSQL 必须使用平台支持的 HTTP/WebSocket 驱动或受控内部 API，不依赖 Worker 中的原始 TCP 连接。
- 开发、预发布、生产完全隔离数据库、存储桶和凭据。
- 数据库迁移先在预发布验证；生产迁移必须向后兼容并可回滚应用版本。
- 部署地区按 D-012 在上线前确认；应用、数据库和存储默认同区域。

## 7. 依赖降级

- AI 不可用：保留原始记录并标为待处理，不影响公开站。
- 搜索不可用：返回可解释错误并提供最新内容入口。
- 邮件不可用：保留发送批次和收件人状态，恢复后安全重试。
- 对象存储不可用：无图布局继续可用，后台上传暂停。
- Codex 未运行：公开站继续读取已发布内容，后台显示数据延迟。

## 8. 架构验收

- 公开站不能访问草稿或原始正文。
- Editor 不能发布，ChiefEditor 不能管理系统凭据。
- 任一任务重跑不会重复写入业务对象。
- 任一外部服务中断不导致已发布内容不可读。
- 所有写操作可通过 request ID、run ID 和审计记录追溯。
