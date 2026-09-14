# AI Newspaper

面向中文 AI 从业者的高质量热点动态聚合与编辑发布平台。

当前仓库已完成 T01～T15 的工程实现：工程与数据库基础、后台认证/RBAC、来源与运行记录、多来源采集、候选生成与审核、内容编辑与发布、全部 P0 内容浏览页与搜索、Newsletter 双重确认/幂等发送、定时任务租约/补跑，以及审计、运行状态、告警、恢复校验和发布门禁均已落地。生产发布仍须关闭 [`docs/15_LAUNCH_CHECKLIST.md`](docs/15_LAUNCH_CHECKLIST.md) 中的真实预发、外部供应商和人工审批阻断项。

## 从这里开始

1. 阅读 [`docs/INDEX.md`](docs/INDEX.md)；
2. 确认 [`docs/00_DECISIONS.md`](docs/00_DECISIONS.md) 中尚未关闭的发布前决策；
3. T01～T15 工程实现已落地在 `web/`；进入预发布前按 [`docs/15_LAUNCH_CHECKLIST.md`](docs/15_LAUNCH_CHECKLIST.md) 收集真实环境证据；
4. 所有 AI coding 工具必须遵守根目录 [`AGENTS.md`](AGENTS.md)。

## P0 一句话范围

公开浏览、搜索、主题/实体聚合、Newsletter 订阅，加上管理员审核发布、来源管理和采集任务运维；不含公开账户、收藏关注、会员和支付。

## 目标架构

- Sites Vinext、React 19 与 TypeScript 模块化单体；
- PostgreSQL 作为事实数据源；
- 对象存储保存允许留存的原始响应与归档；
- 后台 Worker 执行采集、解析、去重与 AI 草稿生成；
- Codex 定时任务负责调度受控的采集命令和健康检查；
- AI 不拥有发布和邮件发送权限。

## 文档变更规则

产品或技术决策变化时，先更新 `docs/00_DECISIONS.md`，再同步范围、契约、数据模型、测试和实施任务。代码与 OpenAPI 不一致时视为发布阻断。

## 本地运行

需要 Node.js 22.22.3 与 pnpm 10.33.0：

```bash
pnpm --dir web install --frozen-lockfile
pnpm dev
```

提交前执行：

```bash
pnpm check
```

## 数据库

复制 `web/.env.example` 并提供仅服务端可见的 `DATABASE_URL`。托管 Web 必须使用支持 HTTP/WebSocket 的 PostgreSQL 服务；不要在 Cloudflare Worker 中使用原始 TCP 驱动。

```bash
pnpm db:check
pnpm db:migrate
pnpm db:seed
pnpm source:import
pnpm source:run -- <run-id> github-openai-python-releases
pnpm source:run-batch -- <run-id>
pnpm candidate:prepare -- <run-id> <absolute-input-file>
pnpm candidate:process -- <run-id> <absolute-response-bundle>
pnpm automation:run -- developer-ecosystem-radar
pnpm --dir web ops:launch-check
pnpm --dir web ops:restore-verify
```

迁移位于 `web/drizzle/`，Schema 与访问层位于 `web/db/`。迁移文件一旦应用便不可修改，只能追加新迁移。

## 服务器部署

生产镜像、Compose 和故障即停的部署脚本位于 `deploy/`。应用默认只绑定服务器的 `127.0.0.1:3100`，必须由正式 HTTPS 域名的反向代理转发。首次部署、配置、迁移、健康检查和回滚步骤见 [`docs/16_SERVER_DEPLOYMENT.md`](docs/16_SERVER_DEPLOYMENT.md)。部署脚本不会绕过 [`docs/15_LAUNCH_CHECKLIST.md`](docs/15_LAUNCH_CHECKLIST.md) 的生产准入门禁。

后台认证还需在上线前选定 OIDC 身份提供方并实现对应 Adapter。应用侧已经具备身份绑定、邮箱 allowlist、MFA 时间、服务端会话、退出撤销、账号禁用和三角色权限控制；开发身份 Adapter 在生产环境中不可启用。

来源注册表位于 `docs/07_SOURCE_REGISTRY.yaml`。`pnpm source:import` 会严格校验并幂等导入；条款待审来源即使在 YAML 中误设为启用也会被强制禁用。内部采集入口还需要仅服务端可见的 `INGESTION_TOKEN`。

运行来源连接器前必须把注册表中的占位联系邮箱替换为真实运营邮箱，并按来源配置 `GITHUB_TOKEN`、`HUGGINGFACE_TOKEN`、`DATABASE_URL` 与绝对路径 `RAW_ARCHIVE_DIR`。候选响应包还必须位于绝对路径 `CANDIDATE_RESPONSE_DIR`。连接器拒绝带占位邮箱的真实请求；托管任务应注入实现 `RawArchiveStore` 的 R2 Adapter。Hugging Face 与 arXiv 在条款复核完成前仍保持禁用。
