/**
 * 管理接口（需要 internal_server_token 鉴权）
 * Header:  Authorization: Bearer <internal_server_token>
 *
 * 题库通过 seed_begreat.ts 脚本维护，不提供 HTTP 导入/导出。
 */
import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { ComponentManager, EComName } from '../../../../common/BaseComponent';
import { getOccupationModel } from '../../dbservice/BegreatDBModel';
import { gameLogger as logger } from '../../../../util/logger';
import { reloadRuntimeConfig, getRuntimeConfig } from '../../config/BegreatRuntimeConfig';

const router = Router();

// ── 鉴权中间件 ────────────────────────────────────────────────────────────────

function adminAuth(req: Request, res: Response, next: () => void) {
  const sysCfg = ComponentManager.instance.getComponent(EComName.SysCfgComponent);
  const cfg = sysCfg.server_auth_config as { internal_server_token?: string };
  const expected = cfg?.internal_server_token;

  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!expected || token !== expected) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }
  next();
}

// ── 热加载运行时配置 ──────────────────────────────────────────────────────────
//
// POST /admin/reload-config
// 重新读取 runtime_config.json，无需重启容器立即生效。
// 当前生效配置可通过 GET /admin/config 查看。

router.post('/reload-config', adminAuth, (_req: Request, res: Response) => {
  try {
    const current = reloadRuntimeConfig();
    logger.info('[admin/reload-config] runtime config reloaded');
    res.json({ success: true, config: current });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('[admin/reload-config] failed:', msg);
    res.status(500).json({ success: false, message: msg });
  }
});

router.get('/config', adminAuth, (_req: Request, res: Response) => {
  res.json({ success: true, config: getRuntimeConfig() });
});

// ── 职业种子数据导入 ──────────────────────────────────────────────────────────
//
// POST /admin/occupations/seed
// 读取 tpl/seed_occupation.json，按 code 做 upsert（已存在则更新，不存在则新增）
// 支持 ?reset=true 先清空再写入（谨慎使用）

async function upsertOccupationRecords(
  records: unknown[],
  reset: boolean,
): Promise<{ upserted: number; errors: string[] }> {
  const Occupations = getOccupationModel();
  if (reset) {
    await Occupations.deleteMany({});
    logger.info('[admin/occupations/seed] cleared all occupations before seed');
  }

  let upserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < records.length; i++) {
    const raw = records[i] as Record<string, unknown>;
    if (!raw['code'] || !raw['title']) {
      errors.push(`第 ${i + 1} 条：缺少 code 或 title`);
      continue;
    }
    await Occupations.updateOne({ code: raw['code'] }, { $set: raw }, { upsert: true });
    upserted++;
  }

  return { upserted, errors };
}

router.post('/occupations/seed', adminAuth, async (req: Request, res: Response) => {
  const seedPath = path.resolve(process.cwd(), 'tpl/seed_occupation.json');

  if (!fs.existsSync(seedPath)) {
    res.status(404).json({ success: false, message: 'seed_occupation.json 不存在' });
    return;
  }

  let records: unknown[];
  try {
    records = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    if (!Array.isArray(records)) throw new Error('根节点必须是数组');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ success: false, message: `seed 文件解析失败: ${msg}` });
    return;
  }

  try {
    const reset = String(req.query['reset']).toLowerCase() === 'true';
    const { upserted, errors } = await upsertOccupationRecords(records, reset);
    logger.info(`[admin/occupations/seed] upserted ${upserted} occupations`);
    res.json({ success: true, upserted, errors });
  } catch (err) {
    logger.error('[admin/occupations/seed]', err);
    res.status(500).json({ success: false, message: '导入失败' });
  }
});

// GET /admin/occupations/seed — 预览 seed 文件（不写库，方便校验）
router.get('/occupations/seed', adminAuth, async (_req: Request, res: Response) => {
  const seedPath = path.resolve(process.cwd(), 'tpl/seed_occupation.json');
  if (!fs.existsSync(seedPath)) {
    res.status(404).json({ success: false, message: 'seed_occupation.json 不存在' });
    return;
  }
  try {
    const raw = fs.readFileSync(seedPath, 'utf8');
    const records = JSON.parse(raw) as unknown[];
    res.json({ success: true, count: records.length, records });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ success: false, message: `解析失败: ${msg}` });
  }
});

export default router;
