/**
 * 管理员赠送免费解锁脚本
 *
 * 用途：给指定用户的测评报告赠送免费解锁（内测、合作伙伴、亲友等）
 *
 * 运行方式：
 *   # 查看用户的所有测评记录
 *   ENV=development ts-node scripts/grant_free_unlock.ts --openId=<用户openId>
 *
 *   # 赠送指定 session
 *   ENV=development ts-node scripts/grant_free_unlock.ts --sessionId=<sessionId> --reason="内测用户"
 *
 *   # 赠送用户的所有未付费60题测评
 *   ENV=development ts-node scripts/grant_free_unlock.ts --openId=<用户openId> --all --reason="合作伙伴"
 *
 * 说明：
 *   - 只能赠送60题测评（BFI2），20题测评本身免费
 *   - 已付费的 session 不会被修改
 *   - 赠送后 status 变为 "paid"，并标记 grantedByAdmin=true
 */

import * as mongoose from "mongoose";
import { SessionSchema } from "../src/apps/begreat/entity/session.entity";

interface GrantOptions {
  openId?: string;
  sessionId?: string;
  all?: boolean;
  reason?: string;
  list?: boolean; // 仅列出，不执行赠送
}

async function parseArgs(): Promise<GrantOptions> {
  const args = process.argv.slice(2);
  const opts: GrantOptions = {};

  for (const arg of args) {
    if (arg.startsWith("--openId=")) {
      opts.openId = arg.split("=")[1];
    } else if (arg.startsWith("--sessionId=")) {
      opts.sessionId = arg.split("=")[1];
    } else if (arg.startsWith("--reason=")) {
      opts.reason = arg.split("=")[1];
    } else if (arg === "--all") {
      opts.all = true;
    } else if (arg === "--list") {
      opts.list = true;
    }
  }

  return opts;
}

async function grantFreeUnlock() {
  const opts = await parseArgs();

  // 参数验证
  if (!opts.openId && !opts.sessionId) {
    console.error("❌ 错误：必须指定 --openId 或 --sessionId");
    console.log("\n用法示例：");
    console.log("  查看用户记录：ts-node scripts/grant_free_unlock.ts --openId=xxx --list");
    console.log("  赠送单个：    ts-node scripts/grant_free_unlock.ts --sessionId=xxx --reason=\"内测用户\"");
    console.log("  批量赠送：    ts-node scripts/grant_free_unlock.ts --openId=xxx --all --reason=\"合作伙伴\"");
    process.exit(1);
  }

  if (opts.all && !opts.openId) {
    console.error("❌ 错误：--all 必须配合 --openId 使用");
    process.exit(1);
  }

  // 连接数据库
  const env = process.env.ENV ?? process.env.environment ?? "development";
  const configPath = `${__dirname}/../src/apps/begreat/sysconfig/${env}/db_config.json`;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbCfg = (require(configPath) as {
    db_global: { host: string; port: number; db: string; user?: string; password?: string; authSource?: string };
  }).db_global;

  const auth = dbCfg.user ? `${dbCfg.user}:${dbCfg.password}@` : "";
  const authSrc = dbCfg.authSource ? `?authSource=${dbCfg.authSource}` : "";
  const url = `mongodb://${auth}${dbCfg.host}:${dbCfg.port}/${dbCfg.db}${authSrc}`;

  console.log(`🔗 连接数据库 ${dbCfg.host}:${dbCfg.port}/${dbCfg.db} ...`);
  await mongoose.connect(url);
  console.log("✅ 已连接\n");

  const SessionModel = mongoose.model("Session", SessionSchema, "sessions");

  try {
    // 情况1：按 sessionId 赠送单个
    if (opts.sessionId) {
      const session = await SessionModel.findOne({ sessionId: opts.sessionId });
      if (!session) {
        console.error(`❌ 未找到 session: ${opts.sessionId}`);
        process.exit(1);
      }

      console.log("📋 Session 信息：");
      console.log(`  SessionId: ${session.sessionId}`);
      console.log(`  用户: ${session.openId}`);
      console.log(`  测评类型: ${session.assessmentType}`);
      console.log(`  当前状态: ${session.status}`);
      console.log(`  性格类型: ${session.result?.personalityLabel || "未完成"}`);
      console.log(`  创建时间: ${session.createdAt}`);

      if (session.assessmentType !== "BFI2") {
        console.error(`\n❌ 只能赠送60题测评（BFI2），当前是 ${session.assessmentType}`);
        process.exit(1);
      }

      if (session.status === "paid" && !session.grantedByAdmin) {
        console.error("\n❌ 该 session 已付费，无需赠送");
        process.exit(1);
      }

      if (session.status === "in_progress") {
        console.error("\n❌ 测评未完成，无法赠送");
        process.exit(1);
      }

      if (opts.list) {
        console.log("\n✅ --list 模式，不执行赠送");
        process.exit(0);
      }

      // 执行赠送
      const reason = opts.reason || "管理员赠送";
      await SessionModel.updateOne(
        { sessionId: opts.sessionId },
        {
          $set: {
            status: "paid",
            grantedByAdmin: true,
            grantReason: reason,
            paidAt: new Date(),
          },
        }
      );

      console.log(`\n✅ 已赠送解锁！`);
      console.log(`   赠送原因: ${reason}`);
    }

    // 情况2：按 openId 查询或批量赠送
    if (opts.openId) {
      const sessions = await SessionModel.find({
        openId: opts.openId,
        assessmentType: "BFI2", // 只查60题
        status: { $in: ["completed", "invite_unlocked"] }, // 排除已付费和未完成
      }).sort({ createdAt: -1 });

      if (sessions.length === 0) {
        console.log(`ℹ️  用户 ${opts.openId} 没有可赠送的60题测评记录`);
        console.log("   （已排除：已付费、未完成、20题测评）");
        process.exit(0);
      }

      console.log(`📋 用户 ${opts.openId} 的可赠送测评记录：\n`);
      sessions.forEach((s, idx) => {
        console.log(`[${idx + 1}] SessionId: ${s.sessionId}`);
        console.log(`    状态: ${s.status}`);
        console.log(`    性格: ${s.result?.personalityLabel || "未完成"}`);
        console.log(`    创建: ${s.createdAt}`);
        console.log("");
      });

      if (opts.list || !opts.all) {
        if (!opts.all) {
          console.log("ℹ️  添加 --all 参数可批量赠送以上所有记录");
        }
        process.exit(0);
      }

      // 执行批量赠送
      const reason = opts.reason || "管理员批量赠送";
      const sessionIds = sessions.map((s) => s.sessionId);

      const result = await SessionModel.updateMany(
        { sessionId: { $in: sessionIds } },
        {
          $set: {
            status: "paid",
            grantedByAdmin: true,
            grantReason: reason,
            paidAt: new Date(),
          },
        }
      );

      console.log(`✅ 批量赠送完成！`);
      console.log(`   更新数量: ${result.modifiedCount} / ${sessions.length}`);
      console.log(`   赠送原因: ${reason}`);
    }
  } catch (err) {
    console.error("\n❌ 执行失败:", err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 已断开数据库连接");
  }
}

grantFreeUnlock().catch((err) => {
  console.error("❌ 脚本执行失败:", err);
  process.exit(1);
});
