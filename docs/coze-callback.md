# Coze 异步工作流回调

## 配置（`server_auth_config.*.json` → `coze`）

| 字段 | 说明 |
|------|------|
| `callbackPublicUrl` | 公网 HTTPS 根，无尾斜杠，如 `https://your-domain.com` |
| `callbackPath` | 可选，默认 `/healing/coze/callback` |
| `extCallbackUrlKey` | 写入 `POST /v1/workflow/run` 的 `ext` 时使用的键，默认 `hook_url`（若与开放平台文档不一致请改） |
| `webhookSecret` | 可选；若设置，完整回调 URL 会带 `?token=...`，回调请求须携带相同 query |
| `fallbackPollAfterMs` | 可选；`>0` 时在若干毫秒后对仍 `pending` 的任务调用一次 `run_histories` 补偿 |

## 服务端路由

- `POST /healing/coze/callback`：无用户 JWT；解析体中的 `run_id` / `execute_id`、`execute_status`、`output`（兼容嵌套 `data` 数组或对象）。
- 写库成功后通过 **WebSocket** `wss://<域名>/chat?token=<access_token>` 向作者推送 `{ type: "healing_update", data: { workId, status } }`，作品详情页收到后立即请求 `GET /healing/status` 刷新 UI（仍以 HTTP 轮询为兜底）。
- Nginx：`location /` 已带 `Upgrade`/`Connection`，`/chat` 与 API 同端口反代；无需单独 `location`。小程序需在公众平台配置 **socket 合法域名**（与 request 域名一致即可）。

## 开放平台

`ext` 键名与回调 POST 的字段以 [扣子工作流运行文档](https://www.coze.cn/docs/developer_guides/workflow_run) 为准；若实际推送格式与当前解析不一致，请调整 `healing.ts` 中的 `parseCozeWebhookPayload`。
