# Student H5（学生课堂端）

这是成人学生扫码进入的一次性课堂 H5，不是微信小程序，也不是个人创作账号站。核心目标是手机竖屏下快速完成课堂
记录，并在网络中断或退出后从当前未完成步骤恢复。

## 页面与状态定位

| 文件 | 职责 |
|---|---|
| `src/ClassroomPage.tsx` | 课堂路由入口和顶层页面 |
| `src/classroom/useClassroomFlow.ts` | 五步流程状态机、恢复与接口编排 |
| `src/classroom/api.ts` | 公开课堂与参与 API |
| `src/classroom/storage.ts` | 当前参与 token、步骤和本地草稿缓存 |
| `src/classroom/components/ClassroomConfirm.tsx` | 课程、课次、主题、日期、年级、教师、地点与流程确认 |
| `src/classroom/components/PreparationSteps.tsx` | 用户须知与基础研究资料 |
| `src/classroom/components/AssessmentStep.tsx` | 三页 VAD + I-PANAS-SF，中英文切换和左右滑动 |
| `src/classroom/components/ActivityStep.tsx` | 线下创作中状态与创作完成确认 |
| `src/classroom/components/ArtworkStep.tsx` | 学生上传或申请教师代传 |
| `src/classroom/components/EchoStep.tsx` | 作品回响与体验反馈 |
| `src/classroom/components/CourseProgress.tsx` | 五步编号及完成、当前、待补充、失败状态 |
| `src/classroom/classroom.css` | 课堂 H5 主样式 |

## 固定流程与体验约束

1. 扫码确认课堂。
2. 同意用户须知并填写可选基础研究资料。
3. 课前测评。
4. 线下创作。
5. 上传作品或申请教师代传。
6. 课后测评。
7. 等待并查看作品回响，选择体验反馈后结束。

界面向学生展示的是五个主步骤：课前测评、线下创作、上传作品、课后测评、作品回响。参与编号平时隐藏，仅在申请
教师代传后突出显示。作品未上传不能阻塞课后测评，但没有作品时不能提前生成 AI 回响。

- 同一量表前后各一次，页面必须明确显示“活动前/活动后”。
- 测评共三页，支持按钮和左右滑动返回修改；中英文是原位切换，不创建两套状态。
- VAD 必须用短句解释愉悦度、唤醒度、掌控度，避免引导具体答案。
- 已完成步骤写入本地缓存；退出后只重做未完成的当前步骤。
- 当前不实现后台自动重试上传本地草稿；网络失败应保留草稿并清楚提示用户手动重试。
- 不要求手机号、姓名、学号，也不向用户持续展示内部 `participantId`。

验证：在 workspace 根目录运行 `npm run build:student`；涉及恢复、滑动、刷新或移动端布局时，再用窄屏浏览器验证
前进、返回、刷新和断网后的状态。
