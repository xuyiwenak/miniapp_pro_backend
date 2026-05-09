import { Router, type Request, type Response } from 'express';
import { getNormModel } from '../../../dbservice/BegreatDBModel';
import { sendSucc, sendErr } from '../../../../../shared/miniapp/middleware/response';
import { gameLogger as logger } from '../../../../../util/logger';

const router = Router();

// GET /begreat-admin/norms/versions
router.get('/versions', async (_req: Request, res: Response) => {
  try {
    const N        = getNormModel();
    const versions = await N.distinct('normVersion') as string[];
    sendSucc(res, versions.sort().reverse());
  } catch (err) {
    logger.error('[admin/norms] versions error', err);
    sendErr(res, 'Internal error', 500);
  }
});

// GET /begreat-admin/norms?version=xxx&modelType=BIG5
router.get('/', async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = {};
  if (req.query['version'])   filter['normVersion'] = req.query['version'];
  if (req.query['modelType']) filter['modelType']   = req.query['modelType'];

  try {
    const N    = getNormModel();
    const data = await N.find(filter)
      .sort({ modelType: 1, dimension: 1, gender: 1, ageGroup: 1 })
      .lean();
    sendSucc(res, data);
  } catch (err) {
    logger.error('[admin/norms] list error', err);
    sendErr(res, 'Internal error', 500);
  }
});

// PUT /begreat-admin/norms/:id
// Body: { mean?, sd?, sampleSize?, source?, instrument? }
router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const body   = req.body as Record<string, unknown>;

  const allowed: Record<string, unknown> = {};
  if (body['mean']       !== undefined) allowed['mean']       = Number(body['mean']);
  if (body['sd']         !== undefined) allowed['sd']         = Number(body['sd']);
  if (body['sampleSize'] !== undefined) allowed['sampleSize'] = body['sampleSize'] === null ? null : Number(body['sampleSize']);
  if (body['source']     !== undefined) allowed['source']     = String(body['source']);
  if (body['instrument'] !== undefined) allowed['instrument'] = String(body['instrument']);

  if (Object.keys(allowed).length === 0) {
    sendErr(res, '无可更新字段', 400);
    return;
  }

  try {
    const N      = getNormModel();
    const result = await N.findByIdAndUpdate(id, { $set: allowed }, { new: true, lean: true });
    if (!result) {
      sendErr(res, '记录不存在', 404);
      return;
    }
    logger.info(`[admin/norms] updated ${id}`);
    sendSucc(res, result);
  } catch (err) {
    logger.error('[admin/norms] update error', err);
    sendErr(res, 'Internal error', 500);
  }
});

// POST /begreat-admin/norms/activate
// Body: { normVersion: string }
router.post('/activate', async (req: Request, res: Response) => {
  const { normVersion } = req.body as { normVersion?: string };
  if (!normVersion) {
    sendErr(res, 'normVersion 必填', 400);
    return;
  }

  try {
    const N     = getNormModel();
    const count = await N.countDocuments({ normVersion });
    if (count === 0) {
      sendErr(res, `版本 ${normVersion} 不存在`, 404);
      return;
    }
    await N.updateMany({ isActive: true }, { $set: { isActive: false } });
    await N.updateMany({ normVersion }, { $set: { isActive: true } });
    logger.info(`[admin/norms] activated version ${normVersion} (${count} docs)`);
    sendSucc(res, { normVersion, activated: count });
  } catch (err) {
    logger.error('[admin/norms] activate error', err);
    sendErr(res, 'Internal error', 500);
  }
});

export default router;
