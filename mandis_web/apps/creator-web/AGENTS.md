# Creator Web（原有个人用户网页）

这是原 Mandis Web 用户端，线上路径为 `/art/`。它服务个人账号、作品上传和个人报告，不承载扫码课堂学生流程，也不
承担教师课堂管理。

## 文件定位

- `src/pages/LoginPage.tsx`：登录。
- `src/pages/UploadPage.tsx`、`src/components/UploadCanvas.tsx`：个人作品上传。
- `src/pages/ReportsPage.tsx`、`src/pages/ReportDetailPage.tsx`：个人报告列表与详情。
- `src/pages/ProfilePage.tsx`：个人资料。
- `src/api/`：个人用户 API。
- `src/i18n/copy.ts`、`src/components/LocaleToggle.tsx`：中英文文案与切换。

教育课堂需求默认不改本应用。只有跨三端稳定的课堂类型或文案才进入 `@mandis/common`；不要为了复用把课堂状态机、
教师权限或学生本地缓存带入个人用户端。

验证：在 workspace 根目录运行 `npm run build:creator`。
