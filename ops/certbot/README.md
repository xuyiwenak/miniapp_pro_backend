# 统一证书续期与 Starryspark 站点检查

复用系统 certbot.timer / certbot.service，保留系统原有每天两次的检查时间和随机延迟。
Certbot 继续处理所有已启用的自动续期配置，包括其他产品域名；不新增重复 timer。
smartcourse-certbot.timer 在迁移时停用，其原安装入口转发到此目录。

## 行为

- `certbot-service.conf` 为服务加上失败后 15 分钟重试，6 小时最多启动 3 次；单次上限 45 分钟。
- 原厂 ExecStart 保持不变，使用标准 Certbot，所有 TLS 校验保持开启。
- 成功续期会执行 deploy hook；每轮成功检查后也会核对证书拷贝，修复遗漏同步。
- `settings.json` 保留原 hook 的共享证书拷贝映射。证书和私钥先验证匹配，再分阶段写入。
- 比较所有 Nginx 配置所用证书的指纹，仅变化时先 nginx -t 再平滑 reload。
- 服务结束时，无论续期成功或失败，都会从 nginx -T 自动发现本机所有 Starryspark HTTPS 域名。
- 验证公网真实 TLS、域名、有效期、磁盘/公网指纹一致，以及是否有对应 Certbot 续期配置。
- 距到期不足 21 天或检查失败会使服务报告失败并保留重试；检测失败时清除本工具的加载快照，
  让下次成功检查重新同步和加载证书。
- 状态为 `/var/lib/certbot/starryspark-audit.json`；日志在 `journalctl -u certbot.service`。

`commander` 和 `www` 改为读取已有的有效 Let's Encrypt live 证书。
`begreat` 和 `mandis` 保留共用的 starryspark 拷贝目录，由 www 的 SAN 证书自动同步。
不会删除旧的商业证书和私钥，也不更改站点业务路由。

## 安装与检查

按工作区要求先运行 smart 计划，再发布 Git 中的配置；本次不需要构建后端镜像。
在服务器源码同步后执行：

```bash
cd /root/workspace/miniapp_pro_backend
bash ops/certbot/install.sh
python3 ops/certbot/manage.py audit
systemctl start --no-block certbot.service
systemctl status certbot.timer --no-pager
journalctl -u certbot.service --no-pager -n 40
```

安装前备份旧 hook 和本工具的旧 drop-in 到 `/var/lib/certbot/managed-backups/<时间>/`。
不具备 auth hook 的 manual 续期配置，如果证书未被任何当前 Nginx HTTPS 配置使用，
会归档到同一备份目录，避免永久失败的旧测试配置阻塞全局任务状态。证书及私钥保留在原处。
正在使用的手动证书会保留并明确打印需要处理，不会自动移除。

检查范围来自服务器实际 Nginx 配置，`*.starryspark.com.cn` 表示所有已配置的子域名，
不是新申请一张 DNS-01 泛域名证书。新增站点需先配置 HTTPS 和自动签发，随后会自动进入检查范围。
目前根域 starryspark.com.cn 没有 A/AAAA 解析，未配置为本机 HTTPS 站点。

## 验证限制

ACME 外网连接曾间歇性超时，不能用 timer 已开启代替续期验证。可逐个 lineage 运行：

```bash
certbot renew --cert-name smart.starryspark.com.cn --dry-run --run-deploy-hooks \
  --non-interactive --no-random-sleep-on-renew
```

演练不替换生产证书；成功时 hook 读取现有生产证书。保留 staging / 网络失败日志，
如未完成所有演练，不得把“公网证书有效”描述为“所有续期演练已通过”。
