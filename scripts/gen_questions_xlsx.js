const XLSX = require('xlsx');
const path = require('path');

const QUESTIONS = [
  // ═══════════════════════════════════════════
  // RIASEC-R  实际操作型  (5男 + 5女 = 10)
  // ═══════════════════════════════════════════
  { content: "某智能制造实验室邀请你用编程控制机械臂组装零件，这让你感到？", modelType: "RIASEC", dimension: "R", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "一场无人机竞速赛需要维修团队，负责赛后故障排查与修复，你愿意加入吗？", modelType: "RIASEC", dimension: "R", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "团队需要有人学习操作新设备制作产品原型，你会主动承担吗？", modelType: "RIASEC", dimension: "R", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "公司为你配备了辅助设备用于指导设备安装，你最可能会主动探索它吗？", modelType: "RIASEC", dimension: "R", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "新款电动车底盘测试台需要专人负责校准与数据记录，你愿意主动学习操作吗？", modelType: "RIASEC", dimension: "R", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },

  { content: "智能家居展览需要现场调试专员负责多品类设备联动演示，你愿意承担这个角色吗？", modelType: "RIASEC", dimension: "R", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "工作坊提供可编程刺绣机，邀请你独立完成从设计到成品全流程，你期待尝试吗？", modelType: "RIASEC", dimension: "R", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "公司为产品组配备了手持 3D 扫描仪用于实物数字化，你会主动探索各种使用场景吗？", modelType: "RIASEC", dimension: "R", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "品牌活动需要有人操作激光切割机制作定制展品道具，你会主动接手吗？", modelType: "RIASEC", dimension: "R", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "可穿戴设备新品需要人负责硬件功能测试与用户体验记录，你对这类动手任务感兴趣吗？", modelType: "RIASEC", dimension: "R", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },

  // ═══════════════════════════════════════════
  // RIASEC-I  研究探索型  (5男 + 5女 = 10)
  // ═══════════════════════════════════════════
  { content: "公司系统给出意外预测结果，没人能解释，你会主动追查原因吗？", modelType: "RIASEC", dimension: "I", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "你发现新的工作方式可能极大提升效率，但需大量时间验证，你愿意投入吗？", modelType: "RIASEC", dimension: "I", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "竞争对手推出技术突破性产品，你最想做的是深入拆解其底层逻辑吗？", modelType: "RIASEC", dimension: "I", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "你发现一种改进排序算法可将搜索速度提升 40%，需两周验证，你愿意投入吗？", modelType: "RIASEC", dimension: "I", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "代码 Review 中发现历史遗留性能隐患，排查需要三天，你会主动申请处理吗？", modelType: "RIASEC", dimension: "I", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },

  { content: "一份远程办公对创意员工效率影响的数据集摆在你面前，你想深入挖掘吗？", modelType: "RIASEC", dimension: "I", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "面对复杂的用户行为分析任务，你倾向于先拆解数据框架再动手吗？", modelType: "RIASEC", dimension: "I", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "职场女性晋升速度与导师制度的关联数据摆在你面前，你最想做什么？（1=忽略，5=深挖）", modelType: "RIASEC", dimension: "I", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "用户调研数据显示某功能留存率异常低但原因不明，你会主动深入分析用户路径吗？", modelType: "RIASEC", dimension: "I", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "健康类 App 用户在特定时段情绪反馈有规律性波动，你愿意花时间研究背后原因吗？", modelType: "RIASEC", dimension: "I", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },

  // ═══════════════════════════════════════════
  // RIASEC-A  艺术创意型  (5男 + 5女 = 10)
  // ═══════════════════════════════════════════
  { content: "公司品牌视觉需全面重新设计以适应AI时代审美，你愿意主导这个项目吗？", modelType: "RIASEC", dimension: "A", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "一个虚拟展览需要你用生成式AI工具创作概念图，你对这个任务感兴趣吗？", modelType: "RIASEC", dimension: "A", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "竞技游戏整体视觉风格需要重新设计以适配电竞赛事舞台呈现，你愿意主导吗？", modelType: "RIASEC", dimension: "A", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "科技展览需要你用 AI 工具创作一组未来城市基础设施的概念渲染图，你感兴趣吗？", modelType: "RIASEC", dimension: "A", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "公司技术白皮书需从枯燥数据改写为极具感染力的创意叙事报告，你会主动接手吗？", modelType: "RIASEC", dimension: "A", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },

  { content: "有机会从色彩到排版完全主导一款新应用的界面设计，你的感受是？", modelType: "RIASEC", dimension: "A", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "团队需要人撰写公司年度报告的创意叙事文案，你会主动接手吗？", modelType: "RIASEC", dimension: "A", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "时尚品牌整体视觉体系需焕新以契合新一代消费者审美，你愿意主导这个项目吗？", modelType: "RIASEC", dimension: "A", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "线上艺术节需要你设计一个具有沉浸感的虚拟展厅空间，你对这类创意任务感兴趣吗？", modelType: "RIASEC", dimension: "A", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "品牌需要一篇能引发情感共鸣、打动目标用户的创意主题文案，你会主动承担撰写吗？", modelType: "RIASEC", dimension: "A", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },

  // ═══════════════════════════════════════════
  // RIASEC-S  社会服务型  (5男 + 5女 = 10)
  // ═══════════════════════════════════════════
  { content: "新来的实习生对远程协作工具不熟悉，你会主动带他们上手吗？", modelType: "RIASEC", dimension: "S", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "需要组织用户焦点小组访谈来收集产品反馈，你愿意主持这个过程吗？", modelType: "RIASEC", dimension: "S", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "新入职工程师对整套开发工具链陌生，你会主动花时间系统带他们上手吗？", modelType: "RIASEC", dimension: "S", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "两位技术骨干因架构分歧产生公开对立，有人找你居中协调，你会积极介入吗？", modelType: "RIASEC", dimension: "S", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "有机会为技术部门设计系统性 AI 工具使用培训计划，你认为这份工作有意义吗？", modelType: "RIASEC", dimension: "S", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },

  { content: "团队成员因工作方式分歧产生矛盾，有人找你调解，你会积极参与吗？", modelType: "RIASEC", dimension: "S", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "有机会为公司设计一套 AI 工具使用培训方案，你觉得这份工作有意义吗？", modelType: "RIASEC", dimension: "S", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "新入职同事对公司文化和远程协作方式感到迷茫，你会主动陪伴她们度过融入期吗？", modelType: "RIASEC", dimension: "S", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "团队因工作分配不均引发情绪积压，有人私下找你倾诉，你会推动问题公开解决吗？", modelType: "RIASEC", dimension: "S", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "有机会设计帮助新妈妈重返职场的支持体系，你觉得参与这项工作有意义吗？", modelType: "RIASEC", dimension: "S", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },

  // ═══════════════════════════════════════════
  // RIASEC-E  进取领导型  (5男 + 5女 = 10)
  // ═══════════════════════════════════════════
  { content: "你发现公司在某个AI新市场有巨大机会但无人推动，你会站出来吗？", modelType: "RIASEC", dimension: "E", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "有机会向投资人展示团队新业务方向，你愿意主导这次路演吗？", modelType: "RIASEC", dimension: "E", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "投资人评审会议汇报陷入僵局，你最可能主动接管发言权扭转局面吗？", modelType: "RIASEC", dimension: "E", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "你被任命主导公司最大规模数字化转型项目需协调 5 个部门，你的感受是？（1=抵触，5=期待）", modelType: "RIASEC", dimension: "E", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "你发现快速增长的细分市场存在先发优势但无人行动，你会主动推进吗？", modelType: "RIASEC", dimension: "E", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },

  { content: "远程团队会议陷入僵局，你最可能主动打破沉默、推进讨论吗？", modelType: "RIASEC", dimension: "E", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "你被提名负责一个跨部门数字化转型项目，你充满期待吗？", modelType: "RIASEC", dimension: "E", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "你注意到公司在推动女性领导力发展方面存在明显空白，你会主动发起改变吗？", modelType: "RIASEC", dimension: "E", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "跨部门视频会议各方意见严重分歧陷入停滞，你最可能主动整合各方立场推动共识吗？", modelType: "RIASEC", dimension: "E", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "有机会向战略合作伙伴独立展示你团队的社会影响力报告和合作愿景，你愿意主导吗？", modelType: "RIASEC", dimension: "E", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },

  // ═══════════════════════════════════════════
  // RIASEC-C  系统规范型  (5男 + 5女 = 10)
  // ═══════════════════════════════════════════
  { content: "公司要求制定一套工具的使用规范手册包含所有操作流程，你愿意主导吗？", modelType: "RIASEC", dimension: "C", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "财务系统升级需整理历史数据并建立新分类标准，你觉得这类任务有价值吗？", modelType: "RIASEC", dimension: "C", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "研发工具安全使用规范手册（含版本控制与权限管理）需要人主导制定，你愿意吗？", modelType: "RIASEC", dimension: "C", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "ERP 系统迁移需整理五年历史交易数据并建立新科目分类，你觉得这类工作有价值吗？", modelType: "RIASEC", dimension: "C", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "每月汇总分析全球远程团队工时、交付质量与代码提交数据，你觉得这份工作令你满意吗？", modelType: "RIASEC", dimension: "C", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },

  { content: "团队项目管理混乱，你有机会重新梳理所有任务和截止日期，你会主动承担吗？", modelType: "RIASEC", dimension: "C", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "每月整理并分析远程团队的工作量报表，你觉得这份工作令你满意吗？", modelType: "RIASEC", dimension: "C", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "团队远程协作缺乏统一规范，你有机会制定从会议礼仪到文件命名的完整准则，你愿意主导吗？", modelType: "RIASEC", dimension: "C", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "HR 系统升级需将所有员工档案按新标准重新归类整理，你觉得做好这件事很有价值吗？", modelType: "RIASEC", dimension: "C", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "建立月度客户满意度追踪体系并维护结构化分析报告，你觉得这类细致工作令你满意吗？", modelType: "RIASEC", dimension: "C", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },

  // ═══════════════════════════════════════════
  // BIG5-O  开放性  (4男 + 4女 = 8)
  // ═══════════════════════════════════════════
  { content: "同事提出完全颠覆传统工作流程的新方案，你倾向于支持探索吗？", modelType: "BIG5", dimension: "O", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "面对量子计算等抽象技术概念，你会感到好奇并主动学习吗？", modelType: "BIG5", dimension: "O", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "获得从未用过的开源 AI 框架访问权限时，你第一反应是立刻跑通 Demo 吗？", modelType: "BIG5", dimension: "O", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "竞争对手采用颠覆行业惯例的全新技术路径，你倾向于深入研究其可行性吗？", modelType: "BIG5", dimension: "O", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },

  { content: "当你遇到从未使用过的新工具或新方法时，你的第一反应是立刻尝试吗？", modelType: "BIG5", dimension: "O", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "你是否经常主动思考某个行业在10年内可能发生的根本性变化？", modelType: "BIG5", dimension: "O", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "接触到从未尝试过的创意工作方法（如设计思维工作坊）时，你会主动报名参与吗？", modelType: "BIG5", dimension: "O", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "面对 AI 伦理或可持续发展这类复杂抽象议题，你会感到好奇并主动深入了解吗？", modelType: "BIG5", dimension: "O", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },

  // ═══════════════════════════════════════════
  // BIG5-C  尽责性  (4男 + 4女 = 8)
  // ═══════════════════════════════════════════
  { content: "在远程办公、无人监督的环境下，你依然能保持高效的工作状态吗？", modelType: "BIG5", dimension: "C", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "你在某任务中发现了一个小错误，修复它需要额外3小时，你会立刻处理吗？", modelType: "BIG5", dimension: "C", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "接手跨度 6 个月依赖众多外部接口的技术项目时，你会第一步就画出完整任务分解图吗？", modelType: "BIG5", dimension: "C", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "产品即将上线时发现不影响核心功能但会拉低体验的 Bug，你会坚持修复后再上线吗？", modelType: "BIG5", dimension: "C", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },

  { content: "接手细节繁多的长期项目时，你会第一步就制定详细计划吗？", modelType: "BIG5", dimension: "C", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "项目还剩两周进度已达80%时，你会维持高强度推进直到完成吗？", modelType: "BIG5", dimension: "C", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "同时负责三个项目日程密集时，你依然能保持每项工作都不遗漏细节吗？", modelType: "BIG5", dimension: "C", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "对外发布的重要文案中发现小的逻辑措辞问题，修改需重新走审批，你会坚持修改吗？", modelType: "BIG5", dimension: "C", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },

  // ═══════════════════════════════════════════
  // BIG5-E  外向性  (4男 + 4女 = 8)
  // ═══════════════════════════════════════════
  { content: "一个需要持续与10个以上客户沟通的新项目找到你，你感到精力充沛吗？", modelType: "BIG5", dimension: "E", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "公司组织线下行业交流活动，你通常会主动拓展新联系吗？", modelType: "BIG5", dimension: "E", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "行业顶级峰会的 After Party，你通常会主动走向陌生人建立新的行业人脉吗？", modelType: "BIG5", dimension: "E", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "百人大会上被临时邀请上台分享 10 分钟，你能在 5 分钟内准备好并自如发挥吗？", modelType: "BIG5", dimension: "E", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },

  { content: "在陌生线上会议中主持人突然请你发言，你能轻松应对吗？", modelType: "BIG5", dimension: "E", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "午休时间你更倾向于和同事交流而非独处充电吗？", modelType: "BIG5", dimension: "E", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "女性职业社群的线下交流活动中，你通常会主动与陌生与会者建立有深度的新连接吗？", modelType: "BIG5", dimension: "E", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "工作结束后你更倾向于参加朋友聚会或社群活动而非独处安静恢复能量吗？", modelType: "BIG5", dimension: "E", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },

  // ═══════════════════════════════════════════
  // BIG5-A  宜人性  (4男 + 4女 = 8)
  // ═══════════════════════════════════════════
  { content: "同事的方案有明显缺陷但他非常投入，你在会议上会温和提出建议吗？", modelType: "BIG5", dimension: "A", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "合作客户提出你认为不合理的要求，你会优先考虑维护关系吗？", modelType: "BIG5", dimension: "A", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "技术方案有明显性能缺陷但同事付出大量心血，你在评审会上会直接指出吗？", modelType: "BIG5", dimension: "A", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "你的技术判断与团队多数人相悖但你相信正确，你会坚持还是为和谐妥协？（1=坚持，5=妥协）", modelType: "BIG5", dimension: "A", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },

  { content: "你发现团队某成员压力极大，虽不在你职责范围，你会主动提供支持吗？", modelType: "BIG5", dimension: "A", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "你的意见与团队多数人不同时，你倾向于为和谐而妥协吗？", modelType: "BIG5", dimension: "A", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "女性同事的提案有明显逻辑漏洞但她为此准备了很久，你会在公开场合温和提出建议吗？", modelType: "BIG5", dimension: "A", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "发现团队成员近期情绪低落状态下滑，不在你职责内，你会主动找她聊聊吗？", modelType: "BIG5", dimension: "A", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },

  // ═══════════════════════════════════════════
  // BIG5-N  情绪稳定性  (4男 + 4女 = 8)
  // ═══════════════════════════════════════════
  { content: "项目出现重大变更、所有计划需重来时，你会感到强烈焦虑吗？", modelType: "BIG5", dimension: "N", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "工作中犯了影响较大的错误后，你会反复自责很长时间吗？", modelType: "BIG5", dimension: "N", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "产品发布前夜核心服务出现故障所有上线计划被迫推翻，你会感到难以控制的焦虑吗？", modelType: "BIG5", dimension: "N", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "需求频繁反复、优先级持续变化、交付节点不断压缩，这种状态会让你感到明显不适吗？", modelType: "BIG5", dimension: "N", weight: 1, gender: "male", ageMin: 0, ageMax: 999, isActive: "TRUE" },

  { content: "连续两周高强度工作压力下，你通常很难保持情绪平稳吗？", modelType: "BIG5", dimension: "N", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "面对频繁变更的需求和工作中的不确定性，你会感到明显不适吗？", modelType: "BIG5", dimension: "N", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "被临时要求独立承担原本整个团队负责的重要汇报，你会感到强烈的焦虑和不安吗？", modelType: "BIG5", dimension: "N", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
  { content: "工作与个人生活边界长期模糊、随时被消息打扰，这种状态会让你感到持续疲惫焦虑吗？", modelType: "BIG5", dimension: "N", weight: 1, gender: "female", ageMin: 0, ageMax: 999, isActive: "TRUE" },
];

const headers = ["content","modelType","dimension","weight","gender","ageMin","ageMax","isActive"];
const rows = QUESTIONS.map(q => headers.map(h => q[h]));

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
ws['!cols'] = [
  { wch: 60 }, { wch: 10 }, { wch: 12 }, { wch: 8 },
  { wch: 8 },  { wch: 8 },  { wch: 8 },  { wch: 10 },
];
XLSX.utils.book_append_sheet(wb, ws, '题库');
XLSX.writeFile(wb, path.join(__dirname, 'questions_test.xlsx'));

// 统计
const stat = {};
QUESTIONS.forEach(q => {
  const k = `${q.modelType}-${q.dimension}(${q.gender})`;
  stat[k] = (stat[k]||0)+1;
});
console.log(`✅ 写入完成，共 ${QUESTIONS.length} 题`);
console.log('维度分布:');
Object.entries(stat).sort().forEach(([k,v]) => console.log(' ', k, v));
const male = QUESTIONS.filter(q=>q.gender==='male').length;
const female = QUESTIONS.filter(q=>q.gender==='female').length;
console.log(`男题: ${male}  女题: ${female}  合计: ${QUESTIONS.length}`);
