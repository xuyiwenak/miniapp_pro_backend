# Design: Commander 统一管理后台

## Context

当前有两个独立的管理后台前端（art_web 和 begreat_frontend），分别服务于 mandis 和 begreat 后端。两个项目选择了不同的技术栈，但功能定位完全重叠——都是管理员查看数据 + 执行运营操作。

统一为一个 Commander 项目的核心挑战：
- **双后端鉴权**：mandis 用 `POST /login/postPasswordLogin`（无 `/auth/me` 验证），begreat 用 `POST /begreat-admin/auth/login` + `GET /begreat-admin/auth/me`
- **不同 API base**：mandis API 在 `/api/*`，begreat API 在 `/begreat-admin/*`
- **品牌视觉**：art_web 有完整品牌设计规范（navy/pink/teal），统一后需保留
- **art_web 页面迁移**：Tailwind → Ant Design 重写 3 个页面

## Goals / Non-Goals

**Goals:**
- 单一前端项目 `commander/`，构建产物部署到两个域名
- 公共部分（BI Dashboard、系统监控、Layout、Auth）只实现一次
- 差异化部分（mandis 专区 / begreat 专区）通过 Nav 菜单分组隔离
- 零破坏——现有后端 API 不变，现有 Nginx 配置渐进升级

**Non-Goals:**
- 不合并 mandis 和 begreat 的后端进程
- 不统一两个后端的鉴权体系（token format / secret 保持独立）
- 不迁移小程序端（art_app / mandis / begreat）
- 不实现单点登录（SSO）——每个 app 独立登录

## Decisions

### D1：项目初始化方式——基于 begreat_frontend 骨架扩展

**选择：** 复制 `begreat_frontend/` 作为 `commander/` 的起点，在其基础上添加 mandis 专区和 app 切换机制。

**原因：**
- begreat_frontend 已有完整 Ant Design 生态、Zustand auth、axios 封装——这些直接复用
- art_web 的 3 个页面需要 Ant Design 重写，但业务逻辑层（API 调用、状态管理）可以直接迁移
- 继承而非重建，避免从 `npm create vite` 开始配置 TypeScript/Vite/Ant Design

**放弃方案：** 从零建项目——配置成本高，且 begreat_frontend 的 14 个已有页面可直接迁移。

---

### D2：App 上下文切换——Runtime 选择，非 Build-time

**选择：** Commander SPA 在运行时通过顶部 Tab（`<Segmented>`）切换当前 app context，而非构建时通过环境变量固化。

```
┌──────────────────────────────────────────────┐
│  [mandis]  [begreat]          admin ▼ 退出   │  ← App 切换 Tab
├──────────────────────────────────────────────┤
│  📊 BI 仪表盘                                │  ← 公共 Nav
│  🖥  系统监控                                 │
│  ────────────────────────────                │
│  👥 用户管理                                 │  ← mandis 专属
│  🖼  作品管理                                 │
│  💬 反馈管理                                 │
│  ────────────────────────────                │
│  📋 测评记录                                 │  ← begreat 专属
│  💰 支付管理                                 │
│  ...                                         │
└──────────────────────────────────────────────┘
```

**实现：** Zustand `appStore` 存储 `currentApp: 'mandis' | 'begreat'`。切换时：
1. 侧边栏 Nav 项动态替换
2. axios interceptor 切换到对应 `baseURL`
3. 页面组件根据 `currentApp` 加载对应的数据 API

**原因：**
- 一份构建产物同时服务于两个域名，无需构建时区分
- 管理员可能同时拥有两个系统的权限，在同一次登录会话中切换更方便
- 公共页面（BI Dashboard）可以按 app 筛选数据

**权衡：** 如果两个 app 的权限体系差异大（如用户 A 只能访问 mandis），可以在登录后自动锁定 app context，隐藏切换 Tab。

---

### D3：双 Token 鉴权

**选择：** Zustand `authStore` 扩展为存储两个 token：

```typescript
interface AuthState {
  mandisToken:  string | null;
  begreatToken: string | null;
  currentApp:   'mandis' | 'begreat';

  // 登录时写入对应 token
  loginMandis:  (account: string, password: string) => Promise<void>;
  loginBegreat: (username: string, password: string) => Promise<void>;

  // 获取当前 active token
  activeToken:  () => string | null;
}
```

axios interceptor：
```typescript
http.interceptors.request.use((config) => {
  const token = useAuthStore.getState().activeToken();
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});
```

**原因：**
- 两个后端的 JWT secret 不同，token 不可互换
- 管理员可能同时登录两个系统（在同一个 Commander 会话内切换）
- 退出时清除当前 app 的 token，不影响另一个

**放弃方案：** 统一后端鉴权——需要改造 mandis 后端，增加 `/auth/me` 端点并统一 token format。工作量大且风险高。

---

### D4：API 响应归一化

**选择：** 在 axios response interceptor 中根据当前 app 做格式归一。

```typescript
// mandis 格式：{ success: true, data: { totalUsers: 100 } }
// begreat 格式：{ data: { data: { todayNewUsers: 10 } } }
http.interceptors.response.use((res) => {
  const app = useAppStore.getState().currentApp;
  if (app === 'mandis') {
    if (!res.data.success) throw new ApiError(res.data.code, res.data.message);
    return { ...res, data: res.data.data };
  }
  if (app === 'begreat') {
    return { ...res, data: res.data.data.data };
  }
  return res;
});
```

**原因：**
- Commander 页面组件不需要感知后端响应格式差异
- 归一化后的 `res.data` 对上层组件透明

---

### D5：品牌主题——Ant Design theme token 映射

**选择：** Ant Design `ConfigProvider` theme token 映射 art_web 品牌色：

```typescript
const themeTokens = {
  mandis: {
    colorPrimary:   '#4DBFB4',      // teal CTA
    colorBgLayout:  '#F9F4EF',      // cream background
    colorTextBase:  '#1B3A6B',      // navy text
    borderRadius:   8,
  },
  begreat: {
    colorPrimary:   '#1677ff',      // Ant Design 默认蓝
    colorBgLayout:  '#f5f5f5',
    colorTextBase:  '#000000',
    borderRadius:   6,
  },
};
```

切换 app context 时，`ConfigProvider` 动态切换 theme。公共页面（BI Dashboard）使用当前 active app 的主题。

**原因：**
- 保留 art_web 的品牌视觉（运营团队已熟悉 navy/teal 配色）
- begreat 保持现有 Ant Design 默认风格（无额外适配成本）
- Theme token 切换是 Ant Design 原生支持的运行时能力

---

### D6：部署策略——专属域名 commander.autorecordarchery.xyz

**选择：** Commander 使用独立域名 `commander.autorecordarchery.xyz`，SPA 从根路径 `/` 访问。新建 `commander.conf`，一份 `dist/` 部署到 `/usr/share/nginx/html/commander/`。

```
commander.autorecordarchery.xyz (NEW: nginx/conf.d/commander.conf)
├── location / → /usr/share/nginx/html/commander/         ← SPA 静态文件
├── location /api/ → proxy_pass mandis_app:42002          ← mandis API + BI 查询
└── location /begreat-admin/ → proxy_pass begreat_app:41002  ← begreat API

mandis.autorecordarchery.xyz (mandis.conf — 不变)
└── location / → proxy_pass mandis_app:42002

begreat.autorecordarchery.xyz (begreat.conf — 移除 /admin/ 静态 serve)
└── location / → proxy_pass begreat_app:41002
```

Commander SPA 的 `basename` 设为 `/`（根路径）。API base 根据 `appStore.currentApp` 选择：

```typescript
const APP_BASE = {
  mandis:  '/api',            // Nginx → mandis_app:42002
  begreat: '/begreat-admin',  // Nginx → begreat_app:41002
};
```

**优势：**
- 干净 URL：`https://commander.autorecordarchery.xyz/` 直接访问
- 无需 `/admin/` 路径前缀，无路径冲突
- 两个后端 API 通过不同 URL 前缀区分，Nginx 层清晰代理
- mandis.conf 和 begreat.conf 无需修改（或仅简化 begreat.conf 移除旧 `/admin/` 静态块）
- SSL 证书独立管理

**部署命令：**
```bash
cd commander && npm run build
rsync -avz dist/ bn:/path/to/art_theroy/commander/dist/
ssh bn "docker exec art-nginx nginx -s reload"
```

---

### D7：代码分支策略

**选择：** 在 `art_theroy` monorepo 的 `feature/commander` 分支上开发，完成验证后合并到 main。

**生命周期：**
```
feature/commander (开发 4d)
  → PR → 合并 main
  → 部署 commander/dist/ 到服务器
  → Nginx 切换 /admin/ 指向 commander
  → 观察 1 周
  → 删除 art_web/ 和 begreat_frontend/
```

**原因：**
- 开发期间不影响 main 分支的现有项目
- 合并时 art_web 和 begreat_frontend 保留在 main 分支（只新增 commander/，不删除旧目录）
- 回滚：切回 main，Nginx 恢复旧配置

---

### D8：BI 面板跨 App 差异化——三层过滤，非两套代码

**问题：** mandis 和 begreat 写入同一个 `bi_events` 集合、同一个 Mongoose Schema，数据结构没有格式差异。但它们产生的事件类型不同——mandis 有文件上传和 Qwen AI 分析，begreat 没有；两个 app 的热门 API 端点也不同。Commander 的 BI Dashboard 如何在 app 切换时正确展示？

**选择：** 同一套 BI Dashboard 组件，通过三层控制实现 app 差异化。

#### 第一层：API 查询过滤（数据源）

所有 BI 查询自动带 `appName` 参数：

```typescript
// useBiDashboard Hook
const { currentApp } = useAppStore();

// mandis → GET /api/bi/dashboard?appName=mandis
// begreat → GET /api/bi/dashboard?appName=begreat
fetch(`/api/bi/dashboard?timeRange=7d&appName=${currentApp}`)
```

后端 `BiAnalyticsService` 根据 `appName` 参数过滤聚合表，begreat 的查询结果中 `qwen.totalCost` 和 `upload.totalBytes` 自然为 0。

#### 第二层：面板可见性声明（组件层）

每个 BI 面板组件声明自己"哪些 app 可见"：

```typescript
// commander/src/config/biPanels.ts
export const BI_PANELS = [
  {
    key: 'apiPerformance',
    label: 'API 性能',
    visible: ['mandis', 'begreat'],    // 两个 app 都有 API 请求
    component: ApiPerformancePanel,
  },
  {
    key: 'errorAnalysis',
    label: '错误分析',
    visible: ['mandis', 'begreat'],    // 两个 app 都可能出错
    component: ErrorAnalysisPanel,
  },
  {
    key: 'uploadStats',
    label: '上传统计',
    visible: ['mandis'],               // 仅 mandis 有文件上传
    component: UploadStatsPanel,
  },
  {
    key: 'qwenCosts',
    label: 'Qwen 成本',
    visible: ['mandis'],               // 仅 mandis 有 AI 分析
    component: QwenCostPanel,
  },
  {
    key: 'hotEndpoints',
    label: '热门端点',
    visible: ['mandis', 'begreat'],    // 两个 app 各有各的端点
    component: HotEndpointsPanel,
  },
];
```

BI Dashboard 渲染逻辑：

```typescript
const { currentApp } = useAppStore();

<Row gutter={16}>
  {BI_PANELS
    .filter(p => p.visible.includes(currentApp))
    .map(p => (
      <Col key={p.key} span={12}>
        <p.component />
      </Col>
    ))}
</Row>
```

#### 第三层：数据就绪检测（渲染层）

即使面板对当前 app 可见，如果查询结果确实为空（如 begreat 的 `qwen.totalCost === 0`），面板显示占位状态而非报错或展示空图表：

```typescript
// QwenCostPanel.tsx
const { qwenCosts, isLoading } = useBiDashboard();

if (isLoading) return <Skeleton />;
if (!qwenCosts || qwenCosts.totalCost === 0) {
  return (
    <Card title="Qwen 成本">
      <Empty description="当前应用无 AI 分析数据" />
    </Card>
  );
}
return <PieChart data={qwenCosts.breakdown} />;
```

**效果示意：**

```
┌─ Commander: currentApp = mandis ───────────────┐
│  BI 仪表盘                                       │
│  ┌──────────────────┐ ┌──────────────────┐      │
│  │ API 性能趋势     │ │ 错误 Top 5       │  ← 通用
│  └──────────────────┘ └──────────────────┘      │
│  ┌──────────────────┐ ┌──────────────────┐      │
│  │ 上传统计         │ │ Qwen 成本        │  ← mandis
│  │ (files/content)  │ │ (tokens/¥)       │    专属
│  └──────────────────┘ └──────────────────┘      │
└─────────────────────────────────────────────────┘

        ↓ 用户点击 [begreat] Tab ↓

┌─ Commander: currentApp = begreat ──────────────┐
│  BI 仪表盘                                       │
│  ┌──────────────────┐ ┌──────────────────┐      │
│  │ API 性能趋势     │ │ 错误 Top 5       │  ← 通用
│  └──────────────────┘ └──────────────────┘      │
│  ┌──────────────────┐                           │
│  │ 热门端点         │                    ← begreat
│  └──────────────────┘                     专属   │
│                                                  │
│  (上传/Qwen 面板自动隐藏)                        │
└─────────────────────────────────────────────────┘
```

**原因：**
- 不需要写两套 BI Dashboard 组件——所有面板共享同一套代码，差异仅在于 `visible` 配置和数据内容
- `biPanels.ts` 是声明式配置，新增 app 或新事件类型时只需加一行
- 第三层（空数据检测）保证即使后端返回的指标为 0，UI 也不会崩溃或误导

**放弃方案：** 在 Commander 内建两套 Dashboard（mandisDashboard / begreatDashboard）——组件重复，后续维护 ×2。三层过滤方案将差异收敛到一份配置文件。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| mandis 的 `/auth/me` 不存在，无法在刷新时验证 token 有效性 | mandis auth 降级为"检查 token 存在"（与当前 art_web 行为一致），后续可补后端端点 |
| art_web 的品牌视觉在 Ant Design 下还原度不足 | ConfigProvider theme token 精确映射，Dashboard 页面视觉回归测试 |
| 两个后端的响应格式差异导致页面出错 | 统一在 axios interceptor 做归一化，页面组件只感知归一化后的数据 |
| commander 构建产物 > 5MB（Ant Design + @ant-design/plots） | 代码分割 + 路由懒加载；Dashboard 页面按 app 分包 |
| 旧 Nginx cache 导致切换后用户看到旧页面 | `/admin/index.html` 配置 `Cache-Control: no-store`；assets 文件名含 hash，自然刷新 |
| BI 面板在 begreat 下显示空图表（如 Qwen 成本为 0） | D8 第三层：渲染前检测数据是否为 0，显示 `<Empty>` 占位而非空图表；第二层 `visible` 配置可直接隐藏不适用面板 |
| 未来新增 app（如 art_app 后台）需要改多处代码 | D8 第二层：新增 app 只需在 `biPanels.ts` 的 `visible` 数组中追加，组件和 Hook 代码零改动 |

## Migration Plan

### 第一步：开发（feature/commander 分支）

1. 复制 `begreat_frontend/` → `commander/`，修改 `package.json` name
2. 实现 `appStore` + `authStore` 双 token
3. 实现 `AppLayout` 的 App 切换 Tab
4. 迁移 art_web 的 3 个页面到 Ant Design
5. 实现公共 BI Dashboard（单套 Ant Design 组件 + `biPanels.ts` 声明式配置，三层过滤见 D8）
6. 本地联调 mandis 和 begreat 后端

### 第二步：部署（合并 main 后）

7. `npm run build` → `dist/`
8. `rsync dist/ → server:/usr/share/nginx/html/commander/`
9. 修改 `nginx/conf.d/mandis.conf`：新增 `/admin/` location
10. 修改 `nginx/conf.d/begreat.conf`：`/admin/` 路径从 `begreat-admin/` 改为 `commander/`
11. `nginx -s reload`

### 第三步：验证

12. 访问 `mandis.xxx/admin/` → 确认 mandis 页面正常
13. 访问 `begreat.xxx/admin/` → 确认 begreat 页面正常
14. 切换 App Tab → 确认 API 调用正确
15. BI Dashboard → 确认两个 app 的数据都能查询

### 第四步：清理

16. 观察 1 周，确认无回滚需求
17. 删除 `art_web/` 和 `begreat_frontend/` 目录
18. 删除 mandis Express 中的 art_web 静态 serve 代码
19. 删除 `/usr/share/nginx/html/begreat-admin/`（旧构建产物）

**回滚**：
- Nginx 恢复旧配置（`art_web` 路径和 `begreat-admin` 路径）
- `nginx -s reload`
- 不影响后端 API
