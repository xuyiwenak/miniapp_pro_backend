import { Router, type Request, type Response } from 'express';
import { getQuestionModel } from '../../../dbservice/BegreatDBModel';
import { sendSucc, sendErr } from '../../../../../shared/miniapp/middleware/response';
import { gameLogger as logger } from '../../../../../util/logger';
import { parsePage } from '../../../../../util/pagination';

const router = Router();

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE     = 200;

// GET /begreat-admin/questions
router.get('/', async (req: Request, res: Response) => {
  const { page, pageSize } = parsePage(req.query as Record<string, unknown>, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  const filter: Record<string, unknown> = {};
  if (req.query['modelType'])            filter['modelType']  = req.query['modelType'];
  if (req.query['dimension'])            filter['dimension']  = req.query['dimension'];
  if (req.query['gender'])               filter['gender']     = req.query['gender'];
  if (req.query['isActive'] === 'true')  filter['isActive']   = true;
  if (req.query['isActive'] === 'false') filter['isActive']   = false;

  try {
    const Q = getQuestionModel();
    const [total, data] = await Promise.all([
      Q.countDocuments(filter),
      Q.find(filter)
        .sort({ modelType: 1, bfiItemNo: 1, dimension: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
    ]);
    sendSucc(res, { total, page, pageSize, data });
  } catch (err) {
    logger.error('[admin/questions] list error', err);
    sendErr(res, 'Internal error', 500);
  }
});

// GET /begreat-admin/questions/stats
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const Q     = getQuestionModel();
    const stats = await Q.aggregate([
      { $group: { _id: { modelType: '$modelType', isActive: '$isActive' }, count: { $sum: 1 } } },
    ]);
    sendSucc(res, stats);
  } catch (err) {
    logger.error('[admin/questions] stats error', err);
    sendErr(res, 'Internal error', 500);
  }
});

// POST /begreat-admin/questions/import
// Body: { records: IQuestion[], reset?: boolean }
router.post('/import', async (req: Request, res: Response) => {
  const body    = req.body as { records?: unknown[]; reset?: boolean };
  const records = body.records;

  if (!Array.isArray(records) || records.length === 0) {
    sendErr(res, 'body.records 必须是非空数组', 400);
    return;
  }

  const missing = (records as Record<string, unknown>[]).filter(
    (r) => !r['questionId'] || !r['modelType'] || !r['dimension'] || !r['content'],
  );
  if (missing.length > 0) {
    sendErr(res, `${missing.length} 条缺少必填字段（questionId / modelType / dimension / content）`, 400);
    return;
  }

  try {
    const Q = getQuestionModel();
    if (body.reset) {
      await Q.deleteMany({});
      logger.info('[admin/questions/import] cleared before import');
    }

    let upserted = 0;
    const errors: string[] = [];
    for (const raw of records as Record<string, unknown>[]) {
      try {
        await Q.updateOne({ questionId: raw['questionId'] }, { $set: raw }, { upsert: true });
        upserted++;
      } catch (e) {
        errors.push(`${raw['questionId']}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    logger.info(`[admin/questions/import] upserted ${upserted}`);
    sendSucc(res, { upserted, errors });
  } catch (err) {
    logger.error('[admin/questions/import] error', err);
    sendErr(res, '导入失败', 500);
  }
});

export default router;
