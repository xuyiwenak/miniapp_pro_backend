/**
 * /app 路由 - 小程序应用配置
 */
import { Router, Response } from 'express';
import { sendSucc } from '../../../../shared/miniapp/middleware/response';
import { getRuntimeConfig } from '../../config/BegreatRuntimeConfig';

const router = Router();

/**
 * GET /app/config
 * 下发应用配置给前端（OSS 图片 URL 等）
 * 无需鉴权，供小程序启动时获取
 */
router.get('/config', (_req, res: Response) => {
  const config = getRuntimeConfig();
  sendSucc(res, {
    baseUrl: config.base_url,
    ossImages: {
      shareHome: config.ossImages.shareHome,
      shareHomeTimeline: config.ossImages.shareHomeTimeline,
      wxacode: config.ossImages.wxacode,
    },
  });
});

export default router;
