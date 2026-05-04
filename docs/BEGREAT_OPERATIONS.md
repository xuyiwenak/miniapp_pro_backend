# Begreat 运维手册

服务器: `8.130.47.65`，项目路径: `/root/workspace/miniapp_pro_backend/`

---

## 1. 首次部署 / 数据初始化

新环境启动后必须手动导入职业题库，否则 `topCareers` 始终为空数组，报告页不显示职业推荐。

### 1.1 导入职业数据（occupationnorms）

```bash
# 1. 把 seed 文件拷进 mongo 容器
docker cp /root/workspace/miniapp_pro_backend/tpl/seed_occupation.json \
  miniapp-mongo:/tmp/seed_occupation.json

# 2. upsert 导入（按 code 字段去重，可重复执行）
docker exec miniapp-mongo mongoimport \
  --uri 'mongodb://root:password@127.0.0.1:27017/begreat_db?authSource=admin' \
  --collection occupationnorms \
  --file /tmp/seed_occupation.json \
  --jsonArray \
  --mode upsert \
  --upsertFields code

# 3. 验证（应为 37）
docker exec miniapp-mongo mongosh \
  'mongodb://root:password@127.0.0.1:27017/begreat_db?authSource=admin' \
  --quiet --eval "db.occupationnorms.countDocuments({isActive:true})"
```

> **为什么不用 admin 接口 `/admin/occupations/seed`？**
> 该接口用 `__dirname` 解析 tpl 路径，在 Docker 编译产物中路径层级与源码不同，会报 404。
> 已修复（改用 `process.cwd()`），下次重建镜像后接口可正常使用：
> ```bash
> curl -s -X POST http://127.0.0.1:41002/admin/occupations/seed \
>   -H 'Authorization: Bearer <internal_server_token>'
> ```

### 1.2 导入常模数据（norms）

如有 norm seed 文件，同理用 mongoimport 导入 `norms` 集合。

---

## 2. 运行时配置（无需重启）

配置文件: `src/apps/begreat/sysconfig/production/runtime_config.json`

```json
{
  "price_fen": 2900,
  "payment_enabled": true
}
```

| 字段 | 说明 |
|------|------|
| `price_fen` | 支付金额（分），2900 = ¥29 |
| `payment_enabled` | `false` 时所有用户直接视为已付费（测试 / 审核期使用） |

修改文件后调用热加载接口，**无需重启容器**：

```bash
curl -s -X POST http://127.0.0.1:41002/admin/reload-config \
  -H 'Authorization: Bearer <internal_server_token>'
```

---

## 3. 测试白名单（跳过每日次数限制）

在 `runtime_config.json` 中维护，**热加载生效，无需重建镜像**：

```json
{
  "dev_openids": ["oYr5x3ZIGgQQ2negDr9qUJK2pd64"]
}
```

修改后调用热加载接口即可：

```bash
curl -s -X POST http://127.0.0.1:41002/admin/reload-config \
  -H 'Authorization: Bearer <internal_server_token>'
```

新增测试账号：编辑服务器上的配置文件，把 openId 追加到数组，再热加载。

> openId 查询方式：`assessmentsessions` 集合按 `createdAt` 降序取最新一条。

---

## 4. 前端支付开关

文件: `begreat/utils/api.js`

```js
const PAYMENT_ENABLED = true; // false = 所有用户免费（上架审核 / 测试期用）
```

审核上架流程：
1. 改为 `false` → 提交审核版本
2. 审核通过后改回 `true` → 提交版本更新开启付费

---

## 5. 查日志

```bash
# 实时请求日志
tail -f /root/workspace/miniapp_pro_backend/logs/begreat/game.$(date +%Y-%m-%d).log

# 支付日志
tail -f /root/workspace/miniapp_pro_backend/logs/begreat/payment.$(date +%Y-%m-%d).log
```

---

## 6. 常见问题速查

| 症状 | 原因 | 解决 |
|------|------|------|
| 报告页职业推荐为空 | `occupationnorms` 集合无数据 | 执行第 1 节导入流程 |
| 用户看不到完整报告 | 后端 `payment_enabled: true` 且 session 未付费 | 改配置为 `false` 或手动将 session status 改为 `paid` |
| 答题次数超限 | 未在白名单且达到每日上限 | 将 openId 加入 `DEV_OPENIDS`，重建镜像 |
| admin seed 接口报 404 | 镜像未重建（旧路径 bug） | 使用 mongoimport 直接导入，或重建镜像后再调接口 |
