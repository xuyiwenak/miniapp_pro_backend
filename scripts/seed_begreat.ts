/**
 * BFI-2 题库种子脚本（60题，gender=both）
 * 运行方式：
 *   ENV=development ts-node scripts/seed_begreat.ts
 *   ENV=production  ts-node scripts/seed_begreat.ts
 */
import * as mongoose from "mongoose";
import { randomBytes } from "crypto";
import {
  BFI2_REVERSE_ITEMS,
  bfi2DomainForItem,
  bfi2FacetForItem,
  bfi2ItemContent,
} from "../src/apps/begreat/bfi2/bfi2ItemMeta";

interface QuestionSeed {
  questionId: string;
  modelType: "BIG5";
  dimension: string;
  content: string;
  weight: number;
  gender: "both";
  isActive: boolean;
  bfiItemNo: number;
  bfiReverse: boolean;
  bfiFacet: string;
}

async function seed() {
  const env = process.env.ENV ?? process.env.environment ?? "development";
  const configPath = `${__dirname}/../src/apps/begreat/sysconfig/${env}/db_config.json`;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbCfg = (require(configPath) as { db_global: { host: string; port: number; db: string; user?: string; password?: string; authSource?: string } }).db_global;

  const auth    = dbCfg.user ? `${dbCfg.user}:${dbCfg.password}@` : "";
  const authSrc = dbCfg.authSource ? `?authSource=${dbCfg.authSource}` : "";
  const url     = `mongodb://${auth}${dbCfg.host}:${dbCfg.port}/${dbCfg.db}${authSrc}`;

  console.log(`Connecting to ${dbCfg.host}:${dbCfg.port}/${dbCfg.db} ...`);
  await mongoose.connect(url);
  console.log("Connected.");

  const QModel = mongoose.model("_Q", new mongoose.Schema({}, { strict: false }), "questions");

  await QModel.deleteMany({});

  const questions: QuestionSeed[] = [];
  for (let n = 1; n <= 60; n++) {
    const dim   = bfi2DomainForItem(n);
    const facet = bfi2FacetForItem(n);
    if (!dim || !facet) continue;
    questions.push({
      questionId: randomBytes(8).toString("hex"),
      modelType:  "BIG5",
      dimension:  dim,
      content:    bfi2ItemContent(n),
      weight:     1.0,
      gender:     "both",
      isActive:   true,
      bfiItemNo:  n,
      bfiReverse: BFI2_REVERSE_ITEMS.has(n),
      bfiFacet:   facet,
    });
  }

  await QModel.insertMany(questions);
  console.log(`Inserted ${questions.length} BFI-2 questions (gender: both).`);

  await mongoose.disconnect();
  console.log("Done.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
