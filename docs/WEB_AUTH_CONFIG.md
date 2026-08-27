# 原色有感网页登录配置

在服务器 `/root/workspace/miniapp_pro_backend/.env` 中配置以下变量。不要提交该文件。

```dotenv
ALIYUN_SMS_ACCESS_KEY_ID=your_ram_access_key_id
ALIYUN_SMS_ACCESS_KEY_SECRET=your_ram_access_key_secret
ALIYUN_SMS_SIGN_NAME=已审核通过的短信签名
ALIYUN_SMS_TEMPLATE_CODE=SMS_123456789
ALIYUN_DM_ACCESS_KEY_ID=your_ram_access_key_id
ALIYUN_DM_ACCESS_KEY_SECRET=your_ram_access_key_secret
ALIYUN_DM_ACCOUNT_NAME=no-reply@your-verified-domain.com
ALIYUN_DM_REGION_ID=cn-hangzhou
ALIYUN_DM_FROM_ALIAS=原色有感
ALIYUN_DM_TAG_NAME=original-sense-auth
WECHAT_WEB_APP_ID=微信开放平台网站应用AppID
WECHAT_WEB_APP_SECRET=微信开放平台网站应用AppSecret
WECHAT_WEB_REDIRECT_URI=https://www.starryspark.com.cn/api/web-auth/wechat/callback
WEB_AUTH_RETURN_URL=https://www.starryspark.com.cn/art/
WEB_SESSION_TTL_SECONDS=2592000
```

网页登录使用服务端可撤销会话和 `HttpOnly`、`Secure`、`SameSite=Lax` Cookie。默认保持 30 天，退出登录或
服务端会话过期后立即失效；可通过 `WEB_SESSION_TTL_SECONDS` 调整时长。

微信开放平台的网站应用需将 `www.starryspark.com.cn` 配为授权回调域名。小程序和网站应用需绑定在同一开放平台账号下，微信才会返回可用于跨端关联的 UnionID。

阿里云短信需使用已审核通过的签名和验证码模板，模板变量名应为 `code`。

阿里云邮件推送需先验证发信域名并创建 `ALIYUN_DM_ACCOUNT_NAME` 对应的发信地址。为短信、邮件推送和验证码服务分别创建 RAM 子账号或最小权限策略，禁止使用主账号 AccessKey。

当前第一期不启用验证码 2.0。短信和邮件接口已包含按目标和来源 IP 的短时限流，且验证码、微信 state、网页登录票据均为一次性使用。后续启用验证码时，新增 `AUTH_CAPTCHA_ENABLED`、`ALIYUN_CAPTCHA_PREFIX`、`ALIYUN_CAPTCHA_SCENE_ID` 和验证码 RAM 凭据即可接入发送接口前置校验。

## 上线前数据检查

邮箱字段为稀疏唯一索引。手机号仍保持普通索引，避免现有重复数据导致服务启动时索引创建失败；在将手机号改为唯一索引前，先在生产数据库执行以下检查并人工处理重复账号：

```javascript
db.players.aggregate([
  { $match: { phone: { $type: 'string', $ne: '' } } },
  { $group: { _id: '$phone', count: { $sum: 1 }, userIds: { $push: '$userId' } } },
  { $match: { count: { $gt: 1 } } },
]);
```

配置后执行：

```bash
docker compose up -d mandis_app
cd /path/to/art_theroy
./deploy.sh mandis-web
```

Mandis 网页端与 Commander 管理后台使用独立构建目录和线上静态目录。发布网页端不会更新管理后台，
也不需要重启 Docker 或 reload Nginx。
