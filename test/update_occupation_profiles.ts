/**
 * 批量更新职业五维画像参数
 * 根据 OpenSpec 变更提案: update-occupation-profiles
 */

import fs from "fs";
import path from "path";

const filePath = path.join(__dirname, "../tpl/seed_occupation.json");
const backupPath = path.join(__dirname, "../tpl/seed_occupation.json.backup");

// 备份原始文件
fs.copyFileSync(filePath, backupPath);
console.log("✅ 已备份原始文件:", backupPath);

const occupations = JSON.parse(fs.readFileSync(filePath, "utf-8"));

console.log(`\n开始更新 ${occupations.length} 个职业...\n`);

let updateCount = 0;

occupations.forEach((job: any) => {
  const title = job.title;
  const r = job.requiredBig5;
  let updated = false;

  // ===== 1. 扩大评分范围 =====

  // 创意型职业 - 提升开放性
  if (["艺术总监", "科研人员", "游戏设计师", "AI 工程师", "数据科学家", "UX 设计师", "品牌视觉设计师", "内容创作者", "建筑设计师"].includes(title)) {
    if (title === "艺术总监") r.openness = 1.2;
    else if (title === "科研人员") r.openness = 1.5;
    else if (title === "游戏设计师") r.openness = 1.3;
    else if (title === "AI 工程师") r.openness = 1.0;
    else if (title === "数据科学家") r.openness = 0.9;
    else if (title === "UX 设计师") r.openness = 0.9;
    else if (title === "品牌视觉设计师") r.openness = 1.1;
    else if (title === "内容创作者") r.openness = 1.1;
    else if (title === "建筑设计师") r.openness = 0.9;
    updated = true;
  }

  // 高压型职业 - 提升情绪稳定性
  if (["临床医生", "心理咨询师", "投资分析师", "律师", "管理咨询顾问"].includes(title)) {
    if (title === "临床医生") r.emotionalStability = 0.8;
    else if (title === "心理咨询师") r.emotionalStability = 1.0;
    else if (title === "投资分析师") r.emotionalStability = 0.8;
    else if (title === "律师") r.emotionalStability = 0.7;
    else if (title === "管理咨询顾问") r.emotionalStability = 0.6;
    updated = true;
  }

  // 严谨型职业 - 提升尽责性
  if (["财务会计", "审计师", "企业法务", "电气工程师", "机械工程师"].includes(title)) {
    if (title === "财务会计") r.conscientiousness = 0.9;
    else if (title === "审计师") r.conscientiousness = 1.0;
    else if (title === "企业法务") r.conscientiousness = 0.8;
    else if (title === "电气工程师") r.conscientiousness = 0.7;
    else if (title === "机械工程师") r.conscientiousness = 0.7;
    updated = true;
  }

  // 其他职业 - 适度提升
  if (["软件工程师", "产品经理", "技术运营", "市场营销经理", "人力资源经理", "电商运营", "企业培训师", "学科教师", "健康管理师", "保险规划顾问", "社会工作者", "公益项目经理", "政府公务员"].includes(title)) {
    r.openness = Math.min(r.openness + 0.2, 0.8);
    r.conscientiousness = Math.min(r.conscientiousness + 0.1, 0.8);
    r.emotionalStability = Math.min(r.emotionalStability + 0.2, 0.6);
    updated = true;
  }

  // ===== 2. 增加硬性门槛 =====

  if (!job.minimumRequirements) {
    job.minimumRequirements = {};
  }

  // 医疗类
  if (title === "临床医生") {
    job.minimumRequirements.conscientiousness = 0.3;
    job.minimumRequirements.emotionalStability = 0.3;
    updated = true;
  }
  if (title === "心理咨询师") {
    job.minimumRequirements.emotionalStability = 0.4;
    job.minimumRequirements.agreeableness = 0.2;
    updated = true;
  }

  // 金融类
  if (title === "投资分析师") {
    job.minimumRequirements.emotionalStability = 0.3;
    job.minimumRequirements.conscientiousness = 0.2;
    updated = true;
  }
  if (title === "财务会计") {
    job.minimumRequirements.conscientiousness = 0.4;
    updated = true;
  }

  // 科研/教育类
  if (title === "科研人员") {
    job.minimumRequirements.openness = 0.3;
    updated = true;
  }
  if (title === "学科教师") {
    job.minimumRequirements.agreeableness = 0.1;
    job.minimumRequirements.emotionalStability = 0.1;
    updated = true;
  }
  if (title === "社会工作者") {
    job.minimumRequirements.agreeableness = 0.2;
    job.minimumRequirements.emotionalStability = 0.2;
    updated = true;
  }

  // 销售/咨询类
  if (title === "销售经理") {
    job.minimumRequirements.extraversion = 0.2;
    updated = true;
  }
  if (title === "在线教育讲师") {
    job.minimumRequirements.extraversion = 0.1;
    updated = true;
  }
  if (title === "管理咨询顾问") {
    job.minimumRequirements.conscientiousness = 0.2;
    job.minimumRequirements.emotionalStability = 0.2;
    updated = true;
  }

  // ===== 3. 启用外向性维度 =====

  // 高社交型
  if (["市场营销经理", "保险规划顾问", "创业者"].includes(title)) {
    r.extraversion = 0.4;
    updated = true;
  }

  // 中社交型
  if (["人力资源经理", "企业培训师", "管理咨询顾问"].includes(title)) {
    r.extraversion = 0.3;
    updated = true;
  }

  // 低社交型
  if (["产品经理", "学科教师", "临床医生", "心理咨询师", "社会工作者", "公益项目经理", "UX 设计师"].includes(title)) {
    r.extraversion = 0.2;
    updated = true;
  }

  // 极低社交型
  if (["品牌视觉设计师", "艺术总监"].includes(title)) {
    r.extraversion = 0.1;
    updated = true;
  }

  // 负社交型
  if (["内容创作者", "软件工程师"].includes(title)) {
    r.extraversion = 0.0;
    updated = true;
  }

  // ===== 4. 启用宜人性维度 =====

  // 高共情型
  if (["心理咨询师", "社会工作者"].includes(title)) {
    r.agreeableness = 0.5;
    updated = true;
  }

  // 中共情型
  if (["学科教师", "人力资源经理", "公益项目经理"].includes(title)) {
    r.agreeableness = 0.4;
    updated = true;
  }

  // 低共情型
  if (["临床医生", "企业培训师", "健康管理师"].includes(title)) {
    r.agreeableness = 0.3;
    updated = true;
  }

  // 极低共情型
  if (["UX 设计师", "产品经理"].includes(title)) {
    r.agreeableness = 0.2;
    updated = true;
  }

  if (updated) {
    updateCount++;
    console.log(`✅ ${title} - 已更新`);
  }
});

// 写回文件
fs.writeFileSync(filePath, JSON.stringify(occupations, null, 2), "utf-8");

console.log(`\n==========`);
console.log(`总计: ${occupations.length} 个职业`);
console.log(`更新: ${updateCount} 个职业`);
console.log(`==========\n`);

console.log("✅ 职业数据已更新:", filePath);
console.log("✅ 备份文件:", backupPath);
console.log("\n请运行验证脚本检查结果:");
console.log("  npx tsx test/check_occupation_dimensions.ts");
