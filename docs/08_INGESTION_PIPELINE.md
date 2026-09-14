# 数据采集与处理管线

## 1. 状态机

`scheduled → fetching → persisted → parsed → deduplicated → enriched → candidate_created → completed`。任何步骤可进入 `partial` 或 `failed`，不得跳过原始归档直接生成候选。

## 2. 标准阶段

1. 加载启用且条款已批准的来源配置。
2. 创建带幂等键的运行记录：`jobKey:scheduledWindow:sourceSetHash`。
3. 使用 ETag、Last-Modified 或来源游标增量获取。
4. 在模型处理前保存允许范围内的原始记录与响应元数据。
5. 解析标题、URL、作者、发布时间、允许摘录和外部 ID。
6. 精确去重：外部 ID、规范 URL、内容哈希。
7. 规则聚类：实体、标题、时间窗口。
8. AI 只对去重后的记录执行翻译、事实提取、实体建议和评分。
9. 输出满足 `CandidateOutput` 的结构化结果；Schema 不通过则重试一次，之后进入人工异常队列。
10. 候选事件写入审核池，不自动发布。
11. 更新来源游标、运行统计和健康状态。

实现约定：`scheduledWindow` 使用输入调度时间的 UTC ISO-8601 表示；`sourceSetHash` 是对排序后唯一来源 key 以换行连接所得字符串的 SHA-256 十六进制值。调用方和服务端必须独立计算并校验该键。相同键返回已有 run，不重复创建来源运行记录。

## 3. CandidateOutput

```json
{
  "schemaVersion": "1.0",
  "title": "string",
  "factSummary": "string",
  "occurredAt": "ISO-8601|null",
  "language": "zh-CN",
  "verification": "confirmed|developing|unverified",
  "scores": {"importance": 1, "actionability": 1, "novelty": 1, "confidence": 0.0},
  "entities": [{"type": "company|product|model|person|topic", "name": "string", "confidence": 0.0}],
  "sourceRelations": [{"rawDocumentId": "uuid", "relation": "primary|corroborating|signal"}],
  "riskFlags": ["legal|financial|rumor|conflict|prompt_injection_suspected"],
  "editorNotes": ["string"]
}
```

## 4. 时间与去重

- 调度窗口按 Asia/Shanghai 计算，实际时间保存 UTC。
- URL 规范化不得移除可能改变内容语义的参数；规则按域名配置。
- 语义相似度只能建议合并。模型版本、融资轮次、价格调整和弃用公告默认不可自动合并。
- 被拒绝事件再次出现时可新增来源，但保持原拒绝状态并提示编辑复核。

### 候选生成实现约定

- 连接器在每个 run 中写入 `ingestion_run_documents`，记录文档 ID、观察时内容哈希和 `new|changed|duplicate`。候选任务只处理当前内容仍与该观察哈希一致、且该版本尚未关联候选的记录。
- 相同内容哈希先聚合为一个组；若该哈希已有候选，只追加来源关系，不调用模型、不改变候选的 review/rejected/published 状态。
- 模型输入把标题、允许摘录和 URL 明确标记为 `untrusted_external_data`，不提供浏览、工具、发布或消息权限。服务端强制补充提示注入风险标记，模型不能移除。
- `CandidateOutput 1.0` 使用严格 Schema；来源关系必须且只能覆盖本组全部 raw document。首次不合格时把脱敏校验问题传给第二次尝试，第二次仍失败则幂等写入人工异常队列。
- 已有实体只允许规范名或别名精确匹配，所有关系默认 `confirmed_by_editor=false`；未知名称作为 pending 建议保存。
- 标题相似、共享实体且发生时间相距不超过 72 小时的事件只写入 merge suggestion；不得自动设置 merged，也不得创建公开内容。

## 5. 错误处理

- 429：读取 Retry-After；无该字段时指数退避。
- 401/403：立即暂停来源并告警，不自动更换身份。
- 404/410：标记来源或文档移除，触发已发布引用复核。
- 5xx/网络错误：最多三次退避；单来源失败不终止批次。
- 解析结果为空或数量异常：不推进游标，保存诊断样本。
- 数据库不可用：任务失败，不在本地生成第二事实库。

### GitHub Releases 连接器约定

- 请求只允许注册表中 `api.github.com/repos/{owner}/{repo}/releases` 的 HTTPS 端点；禁止凭据 URL、非默认端口和自动重定向。
- 使用 `If-None-Match`、`If-Modified-Since` 增量请求；304 归档响应元数据并作为成功无变化完成。
- 429 优先遵守有上限的 `Retry-After`，5xx 和网络错误指数退避；401/403 不重试并自动暂停来源、追加系统审计。
- 最终响应必须在 JSON 解码和 Schema 校验前写入归档。归档或解析失败不得提交来源游标。
- Release URL 必须属于配置仓库；draft 忽略，prerelease 作为可审核原始记录保留；正文仅保存限制长度的纯文本摘录和内容哈希。

### Hugging Face Models 连接器约定

- 只允许 `https://huggingface.co/api/models`，由连接器追加固定的 `sort=lastModified`、降序和最多 100 条参数；禁止来源配置注入额外查询参数。
- 只保留模型 ID、作者、最近更新时间、任务、有限标签、下载量、点赞量、门禁状态和提交哈希；不抓取或镜像模型权重及完整 Model Card。
- `latestUpdatedAt` 作为高水位游标；等于或早于已提交游标的结果不重复生成文档。下载量是热度信号，不是质量或可信度结论。

### arXiv Atom 连接器约定

- 只允许 `https://export.arxiv.org/api/query`，由连接器追加注册表白名单查询、`start=0`、最多 100 条及最近更新时间倒序参数。
- 解析 Atom 标题、作者、摘要、分类、发布时间和更新时间；外部 ID 归一到不含版本号的论文 ID，更新版本通过内容哈希形成 `changed` 原始记录。
- 禁止 DTD 和实体声明，不解析外部实体；仅保存元数据和最多 2,000 字符摘要，不下载 PDF 或保存论文全文。
- `latestUpdatedAt` 作为高水位游标；产品上线前必须完成 API 条款复核和 arXiv 数据使用致谢。
- arXiv 请求保持单连接顺序执行，重试间隔不少于 3 秒；不得通过多任务或多机器绕过官方总频率限制。

### 批次执行与恢复

- 批次只执行运行记录中 `queued` 或 `failed` 的来源，`succeeded`、`skipped` 和仍在执行的来源不重复请求。
- 每个来源独立归档、持久化、提交游标或记录失败；一个来源失败不得中断后续来源。
- 批次返回每个来源的安全错误码和成功/失败/跳过统计；不得在日志中包含令牌、响应正文或异常堆栈。
- 同一 run 重放时跳过已成功来源并恢复失败来源；卡在 `running` 的租约回收与超时判定由 T14 运维任务处理。

## 6. 重放与补跑

- 允许按 run、source 或 raw_document 重放处理步骤。
- 重放默认不重新请求来源；显式 `refetch` 才请求外部站点。
- 离线恢复从每个来源最后成功游标开始；回看窗口至少 24 小时。
- 相同幂等键返回已有运行状态，不启动第二并发运行。
- run 创建时只接受数据库中已启用且 `terms_status=approved` 的来源；未知、停用或条款待审来源在任何外部请求发生前整体拒绝。

## 7. 验收指标

- 14 天内核心来源成功率 ≥ 98%。
- 已知测试样本解析成功率 ≥ 99%。
- 精确重复不得创建第二条 raw_document。
- 候选事件均可追溯到至少一条 raw_document。
- 任何 AI 输出 Schema 不合格时不得写入正式候选字段。
