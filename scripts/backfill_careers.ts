/**
 * 回填职业匹配与 AI 冲击数据
 *
 * 针对 topCareers 为空的已完成 session，利用已存储的 big5Normalized
 * 重新执行职业匹配并生成报告快照（含 careerSection.aiImpact）。
 *
 * 用法：
 *   ENV=development ts-node scripts/backfill_careers.ts
 *   ENV=development ts-node scripts/backfill_careers.ts --dry-run
 */
import * as path from "path";
import * as mongoose from "mongoose";
import { matchCareers } from "../src/apps/begreat/miniapp/services/MatchingService";
import { buildBegreatReportSnapshot, loadReportTemplate } from "../src/apps/begreat/miniapp/services/reportTemplate";
import { buildPersonalityLabel } from "../src/apps/begreat/miniapp/services/CalculationEngine";

// ── DB 连接 ──────────────────────────────────────────────────────────────────

async function connect(env: string): Promise<void> {
  const configPath = path.resolve(__dirname, `../src/apps/begreat/sysconfig/${env}/db_config.json`);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbCfg = (require(configPath) as {
    db_global: { host: string; port: number; db: string; user?: string; password?: string; authSource?: string };
  }).db_global;

  const auth    = dbCfg.user ? `${dbCfg.user}:${dbCfg.password}@` : "";
  const authSrc = dbCfg.authSource ? `?authSource=${dbCfg.authSource}` : "";
  const url     = `mongodb://${auth}${dbCfg.host}:${dbCfg.port}/${dbCfg.db}${authSrc}`;

  console.log(`连接 ${dbCfg.host}:${dbCfg.port}/${dbCfg.db} ...`);
  await mongoose.connect(url);
  console.log("已连接。\n");
}

// ── 主流程 ───────────────────────────────────────────────────────────────────

async function main() {
  const args   = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  const env  = process.env.ENV ?? "development";
  await connect(env);

  // 预加载报告模板（验证模板文件可读）
  loadReportTemplate();

  // 用 schema-less model 直接访问集合
  const SessionSchema    = new mongoose.Schema({}, { strict: false });
  const OccupationSchema = new mongoose.Schema({}, { strict: false });
  const SessionModel    = mongoose.model("_BFSession",    SessionSchema,    "assessmentsessions");
  const OccupationModel = mongoose.model("_BFOccupation", OccupationSchema, "occupationnorms");

  // 加载所有激活职业
  const occupations = await OccupationModel.find({ isActive: true }).lean().exec();
  console.log(`激活职业数：${occupations.length}`);
  if (occupations.length === 0) {
    console.error("❌ 没有激活的职业数据，请先运行 import_occupations.ts");
    process.exit(1);
  }

  // 找出需要回填的 session：已完成但 topCareers 为空
  const targets = await SessionModel.find({
    status: { $in: ["completed", "paid"] },
    $or: [
      { "result.topCareers": { $exists: false } },
      { "result.topCareers": { $size: 0 } },
    ],
  }).lean().exec();

  console.log(`待回填 session：${targets.length} 条`);
  if (targets.length === 0) {
    console.log("无需处理，退出。");
    await mongoose.disconnect();
    return;
  }

  if (dryRun) {
    console.log("\n[dry-run] 不写入数据库，仅预览第一条：");
  }

  let success = 0;
  let failed  = 0;

  for (const _session of targets) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = _session as any;
    const sid    = session.sessionId as string;
    const result = session.result as Record<string, unknown> | undefined;
    const profile = session.userProfile as { gender: "male" | "female"; age: number } | undefined;

    if (!result || !profile) {
      console.warn(`  ⚠ [${sid}] 缺少 result 或 userProfile，跳过`);
      failed++;
      continue;
    }

    const big5Norm = result["big5Normalized"] as Record<string, number> | undefined;

    if (!big5Norm) {
      console.warn(`  ⚠ [${sid}] 缺少 big5Normalized，跳过`);
      failed++;
      continue;
    }

    try {
      // 重新匹配职业
      const topCareers = matchCareers(
        { big5Norm, age: profile.age },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        occupations as any
      );

      // 重新生成报告快照
      const { label, summary } = buildPersonalityLabel(big5Norm);

      const report = buildBegreatReportSnapshot({
        gender:             profile.gender,
        age:                profile.age,
        big5Z:              big5Norm,
        personalitySummary: summary,
        topCareers,
      });

      const freeSummary = `${report.coverLine}\n\n${report.summaryLine}`;

      if (dryRun) {
        console.log(`\n[${sid}] status=${session.status}`);
        console.log(`  topCareers: ${topCareers.length} 条`);
        console.log(`  personalityLabel: ${label}`);
        console.log(`  careerSection.careers: ${report.careerSection?.careers.length ?? 0} 条`);
        const firstAi = report.careerSection?.careers[0]?.aiImpact;
        console.log(`  第一条职业 aiImpact:`, firstAi ? `风险=${firstAi.risk}, badge=${firstAi.badge}` : "无");
        // dry-run 只处理第一条
        break;
      }

      // 写回数据库（仅更新职业相关字段，保留原始答卷数据）
      await SessionModel.updateOne(
        { sessionId: sid },
        {
          $set: {
            "result.topCareers":       topCareers,
            "result.report":           report,
            "result.freeSummary":      freeSummary,
            "result.personalityLabel": label,
          },
        }
      );

      console.log(`  ✓ [${sid}] status=${session.status} | 匹配 ${topCareers.length} 个职业 | ${label}`);
      success++;
    } catch (err) {
      console.error(`  ❌ [${sid}] 处理失败：`, (err as Error).message);
      failed++;
    }
  }

  if (!dryRun) {
    console.log(`\n完成：成功 ${success} 条，失败 ${failed} 条。`);

    // 验证
    const stillEmpty = await SessionModel.countDocuments({
      status: { $in: ["completed", "paid"] },
      $or: [
        { "result.topCareers": { $exists: false } },
        { "result.topCareers": { $size: 0 } },
      ],
    });
    if (stillEmpty > 0) {
      console.warn(`⚠ 仍有 ${stillEmpty} 条 session 未回填，请人工排查。`);
    } else {
      console.log("✓ 所有 session 已回填完毕。");
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("回填失败：", err);
  process.exit(1);
});
