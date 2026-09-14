# Docker 服务器部署

本方案面向单机 Docker 29 + Compose 环境。应用容器只绑定服务器回环地址，必须由已有反向代理按正式域名转发；不得抢占其他项目的 `80/443` 端口，也不得以裸 IP 绕过 HTTPS、OIDC 或发布准入。

## 1. 前置条件

- 已确认正式域名、部署地区和法律文本；
- PostgreSQL 服务支持 Neon HTTP/WebSocket 协议，并已启用托管备份与 PITR；
- OIDC 身份提供方强制 MFA；
- 邮件域已配置 SPF、DKIM、DMARC；
- `docs/15_LAUNCH_CHECKLIST.md` 中需要人工证据的项目均有负责人；
- 反向代理能够把正式 HTTPS 域名转发到 `127.0.0.1:3100`。

## 2. 首次部署

```bash
sudo mkdir -p /opt/ai-newspaper
sudo chown ubuntu:ubuntu /opt/ai-newspaper
git clone git@github.com:KeQian/ai_newspaper.git /opt/ai-newspaper
cd /opt/ai-newspaper/deploy
cp .env.production.example .env.production
chmod 600 .env.production
```

编辑 `.env.production`，替换所有占位值。四类服务端密钥必须分别随机生成，不得复用。完成真实恢复和告警演练后再填写相应时间；不得为了通过检查而伪造批准值。

```bash
./deploy.sh
```

脚本依次验证 Compose、构建不可变镜像、执行发布准入检查、应用迁移、启动服务并轮询健康检查。任一步失败都会停止，不会切换现有应用。

## 3. 反向代理

应用只监听 `127.0.0.1:3100`。在服务器已有的 Nginx/Caddy/Traefik 中，为正式域名新增独立虚拟主机并代理到该地址，同时保留真实客户端 IP 和 `X-Forwarded-Proto: https`。证书签发前不要把应用暴露到公网。

## 4. 更新与回滚

```bash
cd /opt/ai-newspaper
git fetch --all --prune
git checkout <approved-commit>
cd deploy
IMAGE_TAG=<approved-commit> ./deploy.sh
```

回滚时检出上一批准提交并使用新的 `IMAGE_TAG` 重跑。只回滚应用镜像，不回滚数据库中的内容、审计、订阅抑制或邮件事件。涉及不向后兼容的迁移时，必须先执行独立迁移方案，禁止直接删除生产数据。

## 5. 验证与排障

```bash
sudo docker compose --env-file .env.production -f compose.production.yml ps
sudo docker compose --env-file .env.production -f compose.production.yml logs --tail=200 app
curl --fail http://127.0.0.1:3100/api/v1/health
```

详细的恢复、告警和事故流程见 `docs/12_OPERATIONS_RUNBOOK.md`。生产发布的最终 Go/No-Go 记录必须写入 `docs/15_LAUNCH_CHECKLIST.md`。
