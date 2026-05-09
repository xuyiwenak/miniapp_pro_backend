## 1. Bug 修复（已完成）

- [x] 1.1 修复 `Sessions.tsx`：navigate 路径 `/sessions/:id` → `/begreat/sessions/:id`
- [x] 1.2 修复 `SessionDetail.tsx`：返回按钮路径 `/sessions` → `/begreat/sessions`
- [x] 1.3 修复 `Dashboard.tsx`：掉单跳转路径 `/payments/anomalies` → `/begreat/anomalies`

## 2. 导航重构（已完成）

- [x] 2.1 重写 `AppLayout.tsx` BEGREAT_NAV：新增"数据大盘"顶级项、"运营支持"折叠分组（含用户管理/测评记录/支付管理/掉单修复/邀请裂变）
- [x] 2.2 引入 `BarChartOutlined`、`SolutionOutlined`、`UserOutlined` 图标
- [x] 2.3 将 `defaultOpenKeys` 改为受控状态（`useState` + `useEffect`），实现路由变化自动展开父级分组
- [x] 2.4 Menu `onClick` 改为 `key.startsWith('/')` 判断，避免分组 key 触发 navigate

## 3. 用户列表页（已完成）

- [x] 3.1 新建 `commander/src/pages/begreat/Users.tsx`
- [x] 3.2 实现 openId 搜索框（Input.Search）
- [x] 3.3 实现首次见到日期范围筛选（RangePicker）
- [x] 3.4 实现分页 Table，展示 openId/测评次数/付费次数/最新状态/首次见到/最近活动
- [x] 3.5 付费次数 > 0 时绿色 Tag 高亮
- [x] 3.6 openId 列和操作列均可跳转到 `/begreat/users/:openId`

## 4. 用户时间线详情页（已完成）

- [x] 4.1 新建 `commander/src/pages/begreat/UserDetail.tsx`
- [x] 4.2 调用 `usersApi.timeline(openId)` 获取事件列表
- [x] 4.3 按事件类型定义 EVENT_META（label/color/icon）
- [x] 4.4 从事件列表计算测评次数、付费次数，展示摘要 Tag
- [x] 4.5 使用 Ant Design Timeline `items` API 渲染事件列表
- [x] 4.6 每条事件展示：中文标签、时间戳（精确到秒）、detail 键值对
- [x] 4.7 无记录时展示"该用户暂无行为记录"提示
- [x] 4.8 "返回用户列表"按钮跳转 `/begreat/users`

## 5. 路由注册（已完成）

- [x] 5.1 在 `router.tsx` 添加 `BegreatUsers` 和 `BegreatUserDetail` 懒加载组件
- [x] 5.2 注册路由 `/begreat/users` 和 `/begreat/users/:openId`

## 6. 验证

- [x] 6.1 TypeScript 编译零报错（`npx tsc --noEmit`）
- [ ] 6.2 登录 BeGreat，确认侧边栏"运营支持"分组正常折叠展开
- [ ] 6.3 访问"用户管理"，确认列表加载、搜索、分页正常
- [ ] 6.4 点击某用户 openId，确认时间线页正常展示
- [ ] 6.5 从 Sessions 列表点击"详情"，确认跳转到正确路径 `/begreat/sessions/:id`
- [ ] 6.6 从 SessionDetail 点击"返回列表"，确认跳转到 `/begreat/sessions`
- [ ] 6.7 Dashboard 掉单预警"立即处理"点击，确认跳转到 `/begreat/anomalies`
