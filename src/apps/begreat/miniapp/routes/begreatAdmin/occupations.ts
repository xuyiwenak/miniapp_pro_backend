import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { getOccupationModel } from '../../../dbservice/BegreatDBModel';
import { sendSucc, sendErr } from '../../../../../shared/miniapp/middleware/response';
import { gameLogger as logger } from '../../../../../util/logger';

const router = Router();

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE     = 100;

// GET /begreat-admin/occupations/seed（预览，不写库）
router.get('/seed', (_req: Request, res: Response) => {
  const seedPath = path.resolve(process.cwd(), 'tpl/seed_occupation.json');
  if (!fs.existsSync(seedPath)) {
    sendErr(res, 'seed_occupation.json 不存在', 404);
    return;
  }
  try {
    const records = JSON.parse(fs.readFileSync(seedPath, 'utf-8')) as unknown[];
    sendSucc(res, { count: records.length, records });
  } catch (e: unknown) {
    sendErr(res, `解析失败: ${e instanceof Error ? e.message : String(e)}`, 400);
  }
});

// POST /begreat-admin/occupations/seed（upsert 导入）
router.post('/seed', async (req: Request, res: Response) => {
  const seedPath = path.resolve(process.cwd(), 'tpl/seed_occupation.json');
  if (!fs.existsSync(seedPath)) {
    sendErr(res, 'seed_occupation.json 不存在', 404);
    return;
  }

  let records: unknown[];
  try {
    records = JSON.parse(fs.readFileSync(seedPath, 'utf-8')) as unknown[];
    if (!Array.isArray(records)) throw new Error('根节点必须是数组');
  } catch (e: unknown) {
    sendErr(res, `seed 文件解析失败: ${e instanceof Error ? e.message : String(e)}`, 400);
    return;
  }

  const reset = String(req.query['reset']).toLowerCase() === 'true';
  const Occupations = getOccupationModel();

  try {
    if (reset) {
      await Occupations.deleteMany({});
      logger.info('[admin/occupations/seed] cleared before seed');
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

    logger.info(`[admin/occupations/seed] upserted ${upserted}`);
    sendSucc(res, { upserted, errors });
  } catch (err) {
    sendErr(res, '导入失败', 500);
    console.error('[admin/occupations/seed]', err);
  }
});

// GET /begreat-admin/occupations（实时从数据库查）
router.get('/', async (req: Request, res: Response) => {
  const page     = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(String(req.query['pageSize'] ?? String(DEFAULT_PAGE_SIZE)), 10) || DEFAULT_PAGE_SIZE));
  const isActiveParam = req.query['isActive'];

  const filter: Record<string, unknown> = {};
  if (isActiveParam === 'true')  filter['isActive'] = true;
  if (isActiveParam === 'false') filter['isActive'] = false;

  try {
    const Occupations = getOccupationModel();
    const [total, data] = await Promise.all([
      Occupations.countDocuments(filter),
      Occupations.find(filter)
        .select('code title isActive requiredBig5 industry')
        .sort({ code: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
    ]);
    sendSucc(res, { total, page, pageSize, data });
  } catch (err) {
    sendErr(res, 'Internal error', 500);
    console.error('[admin/occupations]', err);
  }
});

export default router;
