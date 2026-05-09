# Commander 路由架构规范

**版本：** 1.0.0  
**状态：** Active  
**适用范围：** `commander/` 前端管理后台

---

## 1. 设计目标

| 目标 | 说明 |
|------|------|
| 路由隔离 | 每个 app 的所有页面 URL 都在各自的前缀下，互不干扰 |
| 模块化注册 | 新增 app 只需新增一个模块目录 + 在注册表中添加一行 |
| 消除状态竞态 | `currentApp` 从 URL 推导，而非从持久化 store 读取 |
| Token 注入确定性 | Axios 拦截器根据请求 URL 前缀注入 token，与 UI 状态解耦 |

---

## 2. URL 路由规则（强制）

**所有页面 URL 必须以 app 前缀开头，不允许裸路径。**

```
/mandis/<page>    ← 所有 Mandis 管理页
/begreat/<page>   ← 所有 BeGreat 管理页
/login/:app       ← 登录页（:app = mandis | begreat）
/                 ← 重定向至 /mandis/dashboard
```

### ✅ 合规路径示例

```
/mandis/dashboard
/mandis/system
/mandis/server-control
/mandis/server-control/nginx
/mandis/users
/mandis/works
/mandis/feedback
/begreat/dashboard
/begreat/users
/begreat/users/:openId
/begreat/sessions
/begreat/sessions/:sessionId
/begreat/payments
/begreat/anomalies
/begreat/invites
/begreat/config
/begreat/occupations
```

### ❌ 禁止路径

```
/dashboard          ← 裸路径，无法区分 app
/system             ← 同上
/server-control     ← 同上
```

---

## 3. 模块化路由架构

### 目录结构

```
commander/src/
├── app-modules/
│   ├── types.ts          # AppModule 接口定义
│   ├── index.ts          # APP_MODULES 注册表 + 工具函数
│   ├── mandis/
│   │   └── index.tsx     # mandis 模块（routes + nav）
│   └── begreat/
│       └── index.tsx     # begreat 模块（routes + nav）
├── components/layout/
│   ├── AuthGuard.tsx     # 接收 appName prop（不读 store）
│   └── AppLayout.tsx     # 接收 module prop（不读 currentApp store）
└── router.tsx            # 从 APP_MODULES 组装路由树
```

### AppModule 接口

```typescript
interface AppModule {
  appName: AppName;        // 'mandis' | 'begreat'
  prefix: string;          // '/mandis' | '/begreat'
  label: string;           // 侧边栏顶部显示名
  loginRedirect: string;   // 登录后跳转目标
  nav: NavItem[];          // 侧边栏菜单（key 为绝对路径）
  routes: RouteObject[];   // 子路由（相对路径，无前缀）
}
```

### Router 组装逻辑

```typescript
// router.tsx
...APP_MODULES.map((mod) => ({
  path: mod.prefix,
  element: (
    <AuthGuard appName={mod.appName}>
      <AppLayout module={mod} />
    </AuthGuard>
  ),
  children: [
    { index: true, element: <Navigate to={mod.loginRedirect} replace /> },
    ...mod.routes,
  ],
}))
```

---

## 4. 新增 App 流程（三步）

```
1. 创建 src/app-modules/<appName>/index.tsx
   ├── 定义 lazy 加载的页面组件
   ├── 配置 nav 数组（key 使用绝对路径 /<appName>/...）
   └── 配置 routes 数组（path 使用相对路径）

2. 在 src/app-modules/index.ts 中注册
   import { newModule } from './<appName>';
   export const APP_MODULES = [...existing, newModule];

3. 在 authStore.ts 添加对应 token 字段和 login 方法
```

Nginx 和后端无需修改（路由隔离在前端完成）。

---

## 5. Token 注入规则

**Axios 拦截器根据请求 URL 前缀决定注入哪个 token，不依赖 `currentApp` store。**

```typescript
// src/api/client.ts
function isBegreatUrl(url: string): boolean {
  return url.startsWith('/begreat-admin');
}

http.interceptors.request.use((config) => {
  const token = isBegreatUrl(config.url ?? '')
    ? auth.begreatToken ?? localStorage.getItem('begreat_admin_token')
    : auth.mandisToken ?? localStorage.getItem('mandis_admin_token');
  // ...
});
```

| URL 前缀 | 注入 Token |
|---------|------------|
| `/begreat-admin/*` | begreatToken |
| `/api/*`（及其他） | mandisToken |

---

## 6. currentApp 推导规则

页面组件**不得**从 `appStore` 读取 `currentApp`，一律从 URL 推导：

```typescript
// 推荐方式（DashboardPage 等需要 appName 的页面）
import { useLocation } from 'react-router-dom';
import { getModuleByPath } from '@/app-modules';

const { pathname } = useLocation();
const currentApp = getModuleByPath(pathname)?.appName ?? 'mandis';
```

专属于单个 app 的页面（如 `ServerControlPage`、`NginxConfigPage`）直接硬编码：

```typescript
const currentApp: AppName = 'mandis'; // 此页面在 /mandis/ 前缀下，无需动态读取
```

---

## 7. Nginx 配置检查结论

当前 `nginx/conf.d/commander.conf` 已满足要求：

```nginx
location / {
    alias /usr/share/nginx/html/commander/;
    try_files $uri $uri/ /index_fallback.html;  # SPA fallback，覆盖所有前端路由
}
location /api/ {
    proxy_pass http://mandis_app:42002;
}
location /begreat-admin/ {
    proxy_pass http://begreat_app:41002;
}
```

`try_files` 的 fallback 机制确保 `/mandis/*` 和 `/begreat/*` 等所有前端路由都能正确返回 `index.html`。**无需修改 Nginx 配置。**

---

## 8. 后端配置检查结论

| 后端 | 挂载路径 | 状态 |
|------|---------|------|
| mandis (`art_backend`) | `/api/*` | ✅ 正常 |
| begreat admin | `/begreat-admin/*` | ✅ 正常，路由前缀与 Nginx proxy 一致 |

`begreat` 后端在 `server.ts` 中：

```typescript
app.use('/begreat-admin', begreatAdminRoutes);
```

Nginx proxy_pass 转发完整路径（含 `/begreat-admin` 前缀），后端路由匹配正确。**无需修改后端配置。**

---

## 9. 禁止事项

- ❌ 不得在页面组件中 `import { useAppStore }` 读取 `currentApp` 作为路由依据
- ❌ 不得注册不带 app 前缀的页面路由（`/dashboard`、`/system` 等）
- ❌ 不得在 Axios 拦截器中用 `currentApp` store 状态决定 token，必须用 URL 前缀
- ❌ 不得在 `AppModule.nav` 中使用相对路径作为 key，key 必须是完整绝对路径
