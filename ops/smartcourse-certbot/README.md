# smartCourse HTTPS 自动续期

仅管理 smart.starryspark.com.cn。原系统 certbot.timer 保留，继续服务其他域名。
原全局任务也可能检查本证书；Certbot 自带锁且仅在需要时更新，不会每次检查都签发证书。

- 独立 systemd timer 每天服务器时间 03:00、15:00 检查，随机延迟最多 30 分钟。
- Certbot 判断临近到期后才签发新证书，HTTP-01 使用现有 webroot，不停止网站。
- 失败 15 分钟后重试，6 小时内最多启动 3 次；下个定时周期继续检查。
- 续期成功才验证证书域名、执行 nginx -t 并平滑 reload。无需重启业务容器。
- 本任务跳过全局目录 hooks，避免调用其他站点的证书复制逻辑。
- 所有连接保留 TLS 校验，不固定 ACME IP，也不依赖个人电脑或临时代理。

按工作区 smart 发布计划同步 Git 后，在服务器执行：

```bash
cd /root/workspace/miniapp_pro_backend
bash ops/smartcourse-certbot/install.sh
certbot renew --cert-name smart.starryspark.com.cn --dry-run --run-deploy-hooks \
  --non-interactive --no-random-sleep-on-renew --no-directory-hooks \
  --deploy-hook "$PWD/ops/smartcourse-certbot/reload-nginx.sh"
systemctl start smartcourse-certbot.service
systemctl status smartcourse-certbot.timer --no-pager
journalctl -u smartcourse-certbot.service --no-pager -n 30
```

演练从 Let's Encrypt staging 获取测试证书，不替换线上证书；deploy hook 使用当前有效证书。
域名必须继续指向本服务器并允许公网访问 HTTP 80 的 /.well-known/acme-challenge/ 路径。
