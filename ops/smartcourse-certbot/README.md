# 已合并到系统 Certbot 定时器

现在统一使用 [ops/certbot](../certbot/README.md)，覆盖本机所有 Starryspark HTTPS 站点。
smartcourse-certbot.timer 在安装统一配置时停用。旧 install.sh 入口兼容转发到新的安装脚本。
历史独立 unit 文件保留作为迁移参考，不再安装或启用。
