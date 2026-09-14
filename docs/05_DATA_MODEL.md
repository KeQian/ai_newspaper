# 数据模型与数据字典

## 1. 通用规则

- 主键使用 UUID；时间保存 UTC；公开 URL 使用不可变 slug 并保留重定向历史。
- 所有表含 `created_at`、`updated_at`；可撤回对象使用状态而非物理删除。
- JSON 只用于来源特有元数据，不替代可查询的核心字段。
- 原始记录不可被模型输出覆盖；模型输出记录模型、提示版本和时间。

## 2. 实体关系

```text
source_feed N─N ingestion_run（经 ingestion_run_sources）
source_feed 1─N raw_document
raw_document N─N candidate_event
candidate_event N─N entity
candidate_event N─N content_item（经 content_candidate_events）
content_item 1─N content_revision
content_item N─N source_reference
content_item N─N topic
newsletter_issue N─N content_item
admin_user N─N role
all mutations 1─N audit_log
```

## 3. 核心表

### `source_feeds`

`id uuid PK`、`key text UNIQUE`、`name text`、`source_type enum(api,rss,atom,web,github,manual)`、`reliability enum(s0,s1,s2,s3,s4)`、`url text`、`enabled boolean`、`schedule text`、`parser_key text`、`terms_status enum(approved,review,restricted)`、`retention_policy enum(metadata,excerpt,full_authorized)`、`config jsonb`、`cursor jsonb`、`last_success_at timestamptz?`、`failure_count int default 0`、`version int default 1`、`owner text`。`config` 只保存组织、分类、查询、凭据环境变量名称和抓取策略，不保存凭据值；`version` 用于后续管理端乐观锁。

来源健康状态不落库：由 `last_success_at`、`failure_count` 和受支持的调度周期按 D-020 推导。YAML 重复导入若配置未改变，不更新版本也不追加审计记录。

### `ingestion_runs`

`id uuid PK`、`job_key text`、`idempotency_key text UNIQUE`、`status enum(queued,running,partial,succeeded,failed,cancelled)`、`scheduled_at`、`started_at?`、`finished_at?`、`fetched_count int`、`new_count int`、`duplicate_count int`、`error_count int`、`error_summary text?`、`prompt_version text?`。

`ingestion_run_sources(run_id, source_feed_id, status, cursor_before jsonb?, cursor_after jsonb?, archive_object_key?, fetched_count, new_count, error_code?, error_detail?)`；组合主键 `(run_id, source_feed_id)`。只有该来源成功完成写入后才能提交 `cursor_after`；最终 HTTP 响应无论成功、304 或失败都通过 `archive_object_key` 关联归档（归档不可用时为空并保留错误状态）。

`ingestion_run_documents(run_id, raw_document_id, observed_content_hash, disposition)` 保存每次批次实际观察到的原始记录版本，`disposition` 为 `new|changed|duplicate`。候选处理必须使用该哈希快照；若原始记录已被后续批次更新，则旧批次不以新内容冒充旧观察结果。

`automation_job_leases(job_key PK, holder_id, expires_at, created_at, updated_at)` 保存普通定时任务的短期可过期租约。同一 `job_key` 同时只有一个 holder；执行器在每个来源开始前续租，正常结束时只能释放自己的租约。

### `raw_documents`

`id uuid PK`、`source_feed_id FK`、`external_id text?`、`canonical_url text`、`title text`、`author text?`、`published_at timestamptz?`、`fetched_at timestamptz`、`language text`、`content_hash text`、`allowed_excerpt text?`、`raw_object_key text?`、`http_etag text?`、`http_last_modified text?`、`parser_version text`、`status enum(active,changed,removed,parse_failed)`。

唯一约束：`(source_feed_id, external_id)`（external_id 非空）；否则 `(source_feed_id, canonical_url, content_hash)`。

### `candidate_events`

`id uuid PK`、`title text`、`fact_summary text`、`occurred_at timestamptz?`、`status enum(new,processing,review,merged,rejected,published)`、`verification enum(confirmed,developing,unverified)`、`importance smallint 1..5`、`actionability smallint 1..5`、`novelty smallint 1..5`、`confidence numeric 0..1`、`risk_flags text[]`、`cluster_key text? UNIQUE`、`merged_into_id FK?`、`deferred_until timestamptz?`、`model_info jsonb?`、`version int default 1`。延后候选保持 `review`，默认审核队列在到期前隐藏，具体语义见 D-024。

连接表：`candidate_event_documents(event_id, raw_document_id, raw_content_hash, relation enum(primary,corroborating,signal))`；组合主键防重复，哈希快照保证原始记录变更后仍可识别待处理版本。

`candidate_generation_failures(run_id, cluster_key, raw_document_ids[], error_code, validation_issues[], attempts, status, model_info)` 是人工异常队列；同一 run 和 cluster 幂等更新。Schema 错误与模型调用错误使用不同安全错误码。

### `entities`

`id uuid PK`、`entity_type enum(company,product,model,person,topic)`、`slug text UNIQUE`、`canonical_name text`、`name_zh text?`、`name_en text?`、`description text?`、`official_url text?`、`status enum(active,renamed,acquired,closed,deprecated)`、`verified_at timestamptz?`、`merged_into_id FK?`。

`entity_aliases(id, entity_id, alias, normalized_alias, language)`；唯一约束 `(entity_id, normalized_alias)`。`candidate_event_entities(event_id, entity_id, confidence, confirmed_by_editor)`。

`candidate_entity_suggestions(event_id, entity_type, name, normalized_name, confidence, matched_entity_id?, status)` 保存模型建议。只有对已有实体名称或别名精确匹配时可建立 `candidate_event_entities`，且 `confirmed_by_editor=false`；未知实体保持 pending，不自动创建正式实体。

`candidate_merge_suggestions(candidate_id, target_event_id, method, score, reasons[], status)` 保存标题、共享实体与 72 小时时间窗规则产生的建议。生成时不得把候选状态改为 merged，只有后续人工决策可接受。

### `content_items`

`id uuid PK`、`content_type enum(news,briefing,analysis)`、`slug text UNIQUE`、`status enum(draft,in_review,scheduled,published,updated,withdrawn)`、`verification enum(confirmed,developing,unverified)`、`title text`、`dek text`、`summary text`、`body jsonb`、`importance smallint`、`actionability smallint`、`published_at?`、`scheduled_at?`、`updated_at`、`withdrawal_reason?`、`current_revision int`、`author_id FK`、`ai_disclosure jsonb?`、`seo jsonb`。

`content_candidate_events(content_id, candidate_event_id)` 记录稿件事实来源，组合主键防止重复；人工原创分析允许为空，但必须通过 `content_sources` 提供事实来源。

### `content_revisions`

`id uuid PK`、`content_id FK`、`revision int`、`snapshot jsonb`、`change_summary text`、`created_by FK`、`created_at`。唯一约束 `(content_id, revision)`。

### 来源、主题和更正

- `content_sources(content_id, raw_document_id?, url, title, publisher, source_type, reliability, published_at?, accessed_at, relation)`。
- `content_topics(content_id, entity_id)`，entity 必须为 topic。
- `correction_notes(id, content_id, description, corrected_at, created_by)`。
- `slug_redirects(id, old_path UNIQUE, new_path, reason, created_at)`。

### Newsletter

- `newsletter_subscribers(id, email_normalized UNIQUE, email_display, status enum(pending,active,unsubscribed,bounced,complained), confirm_token_hash?, confirm_expires_at?, unsubscribe_token_hash, confirmed_at?, unsubscribed_at?)`。数据库备份与后台展示按个人数据处理；token 只存哈希。
- `newsletter_subscription_requests(key_hash PRIMARY KEY, email_hash, expires_at)` 保存 24 小时幂等窗口，只存请求键与邮箱的摘要。
- `newsletter_issues(id, issue_date date UNIQUE, subject, preheader, body jsonb, status enum(draft,scheduled,sending,sent,failed,cancelled), version, send_idempotency_key_hash? UNIQUE, scheduled_at?, sent_at?)`。
- `newsletter_deliveries(id, issue_id, subscriber_id, provider_message_id? UNIQUE, status enum(queued,sent,delivered,bounced,complained,failed), last_event_at, error_code?)`；唯一约束 `(issue_id, subscriber_id)`。
- `newsletter_email_events(id, provider, provider_event_id, provider_message_id, event_type, occurred_at)`；`(provider, provider_event_id)` 唯一，回调只保存归一化事件，不保存原始载荷。

### 管理与审计

- `admin_users(id, email UNIQUE, display_name, status, last_login_at?)`。
- `roles(id, key UNIQUE)`、`admin_user_roles(user_id, role_id)`。
- `admin_identities(id, admin_user_id, issuer, subject, email_at_link)`；`(issuer, subject)` 唯一，避免使用可变邮箱作为 OIDC 主身份键。
- `admin_sessions(id, admin_user_id, identity_id, token_hash UNIQUE, authenticated_at, mfa_verified_at, expires_at, last_seen_at, revoked_at?)`；只保存 256 位随机会话令牌的 SHA-256 哈希，账号禁用或退出后立即视为无效。
- `audit_logs(id, actor_id?, action, object_type, object_id, before jsonb?, after jsonb?, request_id, created_at)`；只追加，不允许普通后台删除。
- `outbox_events(id, event_type, payload, status, attempts, available_at, processed_at?)`。

## 4. 索引

- 发布时间、状态、类型、主题连接表和实体连接表建立组合索引。
- `raw_documents` 对 canonical URL、content hash 建索引。
- `candidate_events` 对状态、重要度、发生时间建索引。
- 搜索投影对标题、摘要、正文纯文本和实体名建立全文/相似匹配索引。

## 5. 状态转换

- Candidate：`new → processing → review → published/rejected/merged`；merged 必须指定目标。
- Content：`draft → in_review → scheduled/published → updated/withdrawn`；只有 ChiefEditor 可进入 published/withdrawn。
- Subscriber：`pending → active → unsubscribed`；任意活动状态可因回调进入 bounced/complained；重新订阅必须重新确认。
- Issue：`draft → scheduled → sending → sent/failed/cancelled`；sent 不可编辑，只能复制为新一期。

## 6. 数据保留

- 审计日志、内容版本：至少 2 年。
- 任务日志：180 天；聚合指标长期保留。
- 未获全文授权的原始内容：仅保存元数据、允许摘录和内容哈希。
- Newsletter 退订记录保留用于抑制再次发送，具体期限以上线地区法律审查为准。

## 7. 外键与删除规则

- 已发布内容、版本、来源快照、审计和邮件抑制记录禁止级联物理删除。
- 来源、实体和管理员停用使用状态字段；历史外键使用 `RESTRICT` 或保留快照。
- 管理员身份和会话禁止级联物理删除；账号禁用通过状态检查立即阻断已有会话。
- 仅无业务引用的临时关系可 `CASCADE`；每个 cascade 必须在迁移中显式声明并有测试。
- 原始记录过期清理先删除获授权的对象存储正文，再保留必要元数据、哈希和引用完整性。
