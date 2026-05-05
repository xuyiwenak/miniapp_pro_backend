import { Router, Request, Response } from 'express';
import fs from 'fs';
import { getRuntimeConfig, reloadRuntimeConfig } from '../../../config/BegreatRuntimeConfig';
import { resolveSysconfigJsonFile } from '../../../../../util/sysconfig_path';
import { envFirst } from '../../../../../util/env';
import { sendSucc, sendErr } from '../../../../../shared/miniapp/middleware/response';
import { gameLogger as logger } from '../../../../../util/logger';

const router = Router();

const PRICE_FEN_MIN = 100;
const PRICE_FEN_MAX = 99900;

function resolveConfigPath(): string {
  const environment   = envFirst('environment', 'ENV') ?? 'development';
  const serverProvide = envFirst('serverProvide', 'SERVER_PROVIDE') ?? '';
  return resolveSysconfigJsonFile(environment, serverProvide, 'runtime_config.json');
}

// GET /begreat-admin/config
router.get('/', (_req: Request, res: Response) => {
  const cfg = getRuntimeConfig();
  sendSucc(res, {
    price_fen:       cfg.price_fen,
    payment_enabled: cfg.payment_enabled,
    dev_openids:     cfg.devOpenids,
  });
});

// POST /begreat-admin/config
// eslint-disable-next-line max-lines-per-function
router.post('/', (req: Request, res: Response) => {
  const body = req.body ?? {};
  const priceFen = body['price_fen'];
  const paymentEnabled = body['payment_enabled'];
  const devOpenids = body['dev_openids'];

  if (priceFen !== undefined) {
    if (
      typeof priceFen !== 'number'
      || !Number.isInteger(priceFen)
      || priceFen < PRICE_FEN_MIN
      || priceFen > PRICE_FEN_MAX
    ) {
      sendErr(res, `price_fen must be an integer between ${PRICE_FEN_MIN} and ${PRICE_FEN_MAX}`, 400);
      return;
    }
  }
  if (paymentEnabled !== undefined && typeof paymentEnabled !== 'boolean') {
    sendErr(res, 'payment_enabled must be a boolean', 400);
    return;
  }
  if (devOpenids !== undefined && (!Array.isArray(devOpenids) || devOpenids.some(id => typeof id !== 'string'))) {
    sendErr(res, 'dev_openids must be an array of strings', 400);
    return;
  }

  try {
    const filePath = resolveConfigPath();
    const existing = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf-8')) : {};

    if (priceFen !== undefined) existing['price_fen'] = priceFen;
    if (paymentEnabled !== undefined) existing['payment_enabled'] = paymentEnabled;
    if (devOpenids !== undefined) existing['dev_openids'] = devOpenids;

    fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf-8');
    const updated = reloadRuntimeConfig();
    logger.info('[admin/config] config updated and reloaded');
    sendSucc(res, {
      price_fen: updated.price_fen,
      payment_enabled: updated.payment_enabled,
      dev_openids: updated.devOpenids,
    });
  } catch (err) {
    sendErr(res, 'Failed to write config', 500);
    console.error('[admin/config] write error:', err);
  }
});

// POST /begreat-admin/config/reload
router.post('/reload', (_req: Request, res: Response) => {
  try {
    const updated = reloadRuntimeConfig();
    sendSucc(res, {
      price_fen: updated.price_fen,
      payment_enabled: updated.payment_enabled,
      dev_openids: updated.devOpenids,
    });
  } catch (err) {
    sendErr(res, 'Reload failed', 500);
    console.error('[admin/config/reload]', err);
  }
});

export default router;
