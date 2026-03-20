# TLS 证书（`fullchain.pem` + `privkey.pem`）

Nginx 容器内路径：`/etc/nginx/ssl/fullchain.pem`、`/etc/nginx/ssl/privkey.pem`（对应本仓库 `nginx/ssl/`）。

**若还没有任何 PEM**，可先在本机项目根执行 `./scripts/nginx-gen-selfsigned.sh` 让 Nginx 能启动（微信真机仍会提示证书不受信任，仅作调试）；生产务必换 Let’s Encrypt 或云证书。

## 方式一：Let’s Encrypt（推荐，免费）

在 **ECS 上**（项目根目录与 `docker compose` 一致），先保证 **80 已放行** 且 Nginx 已带 `/.well-known/acme-challenge/` 配置并已启动。

```bash
# 安装 certbot（以 Debian/Ubuntu 为例）
sudo apt-get update && sudo apt-get install -y certbot

# 申请（webroot 与 compose 里 ./nginx/certbot/www 一致）
sudo certbot certonly --webroot \
  -w "$(pwd)/nginx/certbot/www" \
  -d autorecordarchery.xyz \
  --email 你的邮箱@example.com \
  --agree-tos --non-interactive

# 链到 nginx/ssl（任选：复制或软链）
sudo ln -sf /etc/letsencrypt/live/autorecordarchery.xyz/fullchain.pem "$(pwd)/nginx/ssl/fullchain.pem"
sudo ln -sf /etc/letsencrypt/live/autorecordarchery.xyz/privkey.pem "$(pwd)/nginx/ssl/privkey.pem"

docker compose up -d nginx
```

续期后若证书路径不变，执行 `docker compose exec nginx nginx -s reload` 即可。

## 方式二：阿里云 / 其它平台下载的 PEM

将平台提供的**完整证书链**保存为 `nginx/ssl/fullchain.pem`，私钥保存为 `nginx/ssl/privkey.pem`，权限建议：

```bash
chmod 600 nginx/ssl/privkey.pem
```

然后 `docker compose up -d nginx`。

## 自检

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' https://autorecordarchery.xyz/home/cards
ss -tlnp | grep ':443'
```
