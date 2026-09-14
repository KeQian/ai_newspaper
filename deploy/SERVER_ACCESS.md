# 服务器运行实例

此部署使用独立 PostgreSQL 数据卷、Node.js 应用和只读访问网关，三者自动重启。
数据库无宿主机端口；站点绑定服务器 `127.0.0.1:3100`，通过 SSH 加密隧道访问。
它是已运行的服务器验收实例，尚非完成正式上线门禁的公共网站。

```sh
ssh -N -L 127.0.0.1:4180:127.0.0.1:3100 -i /Users/kyle/.ssh/id_rsa ubuntu@124.222.167.223
```

浏览器打开 http://127.0.0.1:4180 。关闭 SSH 后仅关闭本机访问通道，服务器服务持续运行。

临时域名 `ai-newspaper.124.222.167.223.sslip.io` 已解析到服务器，但腾讯云将公网请求重定向至域名拦截页，因此目前使用上面的 SSH 入口。`public-entry.conf` 为独立 Nginx 虚拟主机，已复制到 `interview-admin-1:/etc/nginx/conf.d/ai-newspaper.conf`；该容器重建后需要重新复制并执行 `nginx -t`、`nginx -s reload`。现有默认站点未更改。

应用已改用标准 PostgreSQL 连接池，支持实际业务需要的交互事务；不再要求 Neon HTTP。`.env.server` 由 `prepare-server.mjs` 在服务器生成，数据库凭据不会写入 Git。

在服务器 `/opt/ai-newspaper` 使用：

```sh
sudo docker compose --env-file deploy/.env.server -f deploy/compose.server.yml ps
sudo docker compose --env-file deploy/.env.server -f deploy/compose.server.yml logs --tail=100 app
sudo docker compose --env-file deploy/.env.server -f deploy/compose.server.yml up -d
```

管理员邮箱仅作为后台 allowlist 配置，不公开为联系邮箱。后台、内部接口、邮件路由及所有非读取请求在入口关闭。
首次迁移后只有角色参考数据，没有任何自动发布的新闻或开发演示数据。
后续域名、OIDC 和邮件接入仍需完成独立上线验收，保留原 `deploy.sh` 正式发布流程。
