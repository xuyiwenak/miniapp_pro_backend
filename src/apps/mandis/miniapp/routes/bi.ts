import { Router, Request, Response } from 'express';
import { BiAnalyticsService } from '../../../bi/BiAnalyticsService';
import { ComponentManager } from '../../../../common/BaseComponent';
import { BiAnalyticsComponent } from '../../../../component/BiAnalyticsComponent';
import type { IClientEventData } from '../../../../entity/biEvent.entity';
import { mandisAdminJwtAuth } from './mandisAdmin/auth';
import { sendSucc } from '../../../../shared/miniapp/middleware/response';
import { gameLogger } from '../../../../util/logger';
import type { PlayerComponent } from '../../../../component/PlayerComponent';
import { getPlayerModel } from '../../../../dbservice/model/ZoneDBModel';
import { getWorkModel } from '../../../../dbservice/model/GlobalInfoDBModel';
import { SCORE_DIMENSIONS } from './healing';

const router = Router();
const service = new BiAnalyticsService();

async function queryEmotionStats(startTime: string, endTime: string) {
  const match = {
    'healing.status': 'success',
    createdAt: { $gte: new Date(startTime), $lt: new Date(endTime) },
  };
  const [dimResults, dominantResults] = await Promise.all([
    fetchDimensionAvgs(match),
    fetchDominantDistribution(match),
  ]);
  return formatEmotionStats(dimResults, dominantResults);
}

async function fetchDimensionAvgs(match: Record<string, unknown>) {
  const Work = getWorkModel();
  return Work.aggregate([
    { $match: match },
    { $project: { scoresArray: { $objectToArray: '$healing.scores' } } },
    { $unwind: '$scoresArray' },
    { $group: { _id: '$scoresArray.k', avg: { $avg: '$scoresArray.v' }, count: { $sum: 1 } } },
  ]);
}

async function fetchDominantDistribution(match: Record<string, unknown>) {
  const Work = getWorkModel();
  return Work.aggregate([
    { $match: match },
    {
      $project: {
        dominant: {
          $reduce: {
            input: { $objectToArray: '$healing.scores' },
            initialValue: { k: '', v: -1 },
            in: { $cond: [{ $gt: ['$$this.v', '$$value.v'] }, '$$this', '$$value'] },
          },
        },
      },
    },
    { $group: { _id: '$dominant.k', count: { $sum: 1 } } },
    { $sort: { count: -1 as const } },
  ]);
}

function formatEmotionStats(
  dimResults: Array<Record<string, unknown>>,
  dominantResults: Array<Record<string, unknown>>,
) {
  const labelMap = Object.fromEntries(SCORE_DIMENSIONS.map((d) => [d.key, d.label]));
  const dimensionAvgs = SCORE_DIMENSIONS.map((d) => {
    const found = dimResults.find((r) => r._id === d.key);
    return { key: d.key, label: d.label, avg: found ? Math.round((found.avg as number) * 10) / 10 : 0 };
  });
  const dominantDistribution = dominantResults
    .filter((r) => r._id)
    .map((r) => ({
      key: r._id as string,
      label: labelMap[r._id as string] ?? (r._id as string),
      count: r.count as number,
    }));
  return { dimensionAvgs, dominantDistribution };
}

/**
 * GET /api/bi/metrics
 * 查询聚合指标
 */
router.get('/metrics', mandisAdminJwtAuth, async (req: Request, res: Response) => {
  try {
    const { startTime, endTime, granularity, appName, eventType } = req.query;
    if (!startTime || !endTime || !granularity) {
      return res.status(400).json({ code: 400, message: 'startTime, endTime, granularity are required' });
    }
    if (granularity !== 'hourly' && granularity !== 'daily') {
      return res.status(400).json({ code: 400, message: 'granularity must be hourly or daily' });
    }

    const data = await service.queryMetrics(
      new Date(startTime as string),
      new Date(endTime as string),
      granularity as 'hourly' | 'daily',
      appName as string | undefined,
      eventType as string | undefined,
    );

    sendSucc(res, data);
    return;
  } catch (error) {
    gameLogger.error('GET /api/bi/metrics failed', { error });
    return res.status(500).json({ code: 500, message: 'Internal error' });
  }
});

/**
 * GET /api/bi/trends
 * 查询趋势数据
 */
router.get('/trends', mandisAdminJwtAuth, async (req: Request, res: Response) => {
  try {
    const { startTime, endTime, granularity, appName, eventType, metrics } = req.query;
    if (!startTime || !endTime || !granularity) {
      return res.status(400).json({ code: 400, message: 'startTime, endTime, granularity are required' });
    }

    const data = await service.queryTrends(
      new Date(startTime as string),
      new Date(endTime as string),
      granularity as 'hourly' | 'daily',
      metrics ? (metrics as string).split(',') : undefined,
      appName as string | undefined,
      eventType as string | undefined,
    );

    sendSucc(res, data);
    return;
  } catch (error) {
    gameLogger.error('GET /api/bi/trends failed', { error });
    return res.status(500).json({ code: 500, message: 'Internal error' });
  }
});

/**
 * GET /api/bi/errors
 * 查询错误分析
 */
router.get('/errors', mandisAdminJwtAuth, async (req: Request, res: Response) => {
  try {
    const { startTime, endTime, appName, limit } = req.query;
    if (!startTime || !endTime) {
      return res.status(400).json({ code: 400, message: 'startTime and endTime are required' });
    }

    const data = await service.queryErrorAnalysis(
      new Date(startTime as string),
      new Date(endTime as string),
      appName as string | undefined,
      limit ? parseInt(limit as string, 10) : 20,
    );

    sendSucc(res, data);
    return;
  } catch (error) {
    gameLogger.error('GET /api/bi/errors failed', { error });
    return res.status(500).json({ code: 500, message: 'Internal error' });
  }
});

/**
 * GET /api/bi/costs
 * 查询成本分析
 */
router.get('/costs', mandisAdminJwtAuth, async (req: Request, res: Response) => {
  try {
    const { startTime, endTime, appName, groupBy } = req.query;
    if (!startTime || !endTime) {
      return res.status(400).json({ code: 400, message: 'startTime and endTime are required' });
    }

    const data = await service.queryCostAnalysis(
      new Date(startTime as string),
      new Date(endTime as string),
      appName as string | undefined,
      (groupBy as 'hour' | 'day' | 'model') ?? 'day',
    );

    sendSucc(res, data);
    return;
  } catch (error) {
    gameLogger.error('GET /api/bi/costs failed', { error });
    return res.status(500).json({ code: 500, message: 'Internal error' });
  }
});

/**
 * GET /api/bi/performance
 * 查询性能分析
 */
router.get('/performance', mandisAdminJwtAuth, async (req: Request, res: Response) => {
  try {
    const { startTime, endTime, appName, eventType } = req.query;
    if (!startTime || !endTime) {
      return res.status(400).json({ code: 400, message: 'startTime and endTime are required' });
    }

    const data = await service.queryPerformanceAnalysis(
      new Date(startTime as string),
      new Date(endTime as string),
      appName as string | undefined,
      eventType as string | undefined,
    );

    sendSucc(res, data);
    return;
  } catch (error) {
    gameLogger.error('GET /api/bi/performance failed', { error });
    return res.status(500).json({ code: 500, message: 'Internal error' });
  }
});

/**
 * GET /api/bi/dashboard
 * Dashboard 总览
 */
router.get('/dashboard', mandisAdminJwtAuth, async (req: Request, res: Response) => {
  try {
    const { timeRange, appName } = req.query;

    const data = await service.getDashboardSummary(
      (timeRange as string) ?? '7d',
      appName as string | undefined,
    );

    sendSucc(res, data);
    return;
  } catch (error) {
    gameLogger.error('GET /api/bi/dashboard failed', { error });
    return res.status(500).json({ code: 500, message: 'Internal error' });
  }
});

/**
 * GET /api/bi/emotion-stats
 * 情绪评分分布：8维度均值 + 主导情绪分布（从 Work 集合直接聚合）
 */
router.get('/emotion-stats', mandisAdminJwtAuth, async (req: Request, res: Response) => {
  try {
    const { startTime, endTime } = req.query;
    if (!startTime || !endTime) {
      return res.status(400).json({ code: 400, message: 'startTime and endTime are required' });
    }

    const data = await queryEmotionStats(startTime as string, endTime as string);
    sendSucc(res, data);
    return;
  } catch (error) {
    gameLogger.error('GET /api/bi/emotion-stats failed', { error });
    return res.status(500).json({ code: 500, message: 'Internal error' });
  }
});

/**
 * GET /api/bi/funnel
 * 用户行为漏斗：注册 → 上传作品 → AI 分析
 */
router.get('/funnel', mandisAdminJwtAuth, async (req: Request, res: Response) => {
  try {
    const { startTime, endTime, appName = 'mandis' } = req.query;
    if (!startTime || !endTime) {
      return res.status(400).json({ code: 400, message: 'startTime and endTime are required' });
    }
    const start = new Date(startTime as string);
    const end = new Date(endTime as string);

    const playerComp = ComponentManager.instance.getComponentByKey<PlayerComponent>('PlayerComponent');
    const zoneId = playerComp?.getDefaultZoneId();
    if (!zoneId) return res.status(503).json({ code: 503, message: 'Server not ready' });

    const Player = getPlayerModel(zoneId);
    const [registered, biEvents] = await Promise.all([
      Player.countDocuments({ createdAt: { $gte: start, $lt: end } }),
      service.queryFunnelBiEvents(start, end, appName as string),
    ]);

    sendSucc(res, { registered, ...biEvents });
    return;
  } catch (error) {
    gameLogger.error('GET /api/bi/funnel failed', { error });
    return res.status(500).json({ code: 500, message: 'Internal error' });
  }
});

/**
 * GET /api/bi/upload-stats
 * 上传文件统计：类型分布、大小、总量
 */
router.get('/upload-stats', mandisAdminJwtAuth, async (req: Request, res: Response) => {
  try {
    const { startTime, endTime, appName } = req.query;
    if (!startTime || !endTime) {
      return res.status(400).json({ code: 400, message: 'startTime and endTime are required' });
    }

    const data = await service.queryUploadStats(
      new Date(startTime as string),
      new Date(endTime as string),
      appName as string | undefined,
    );

    sendSucc(res, data);
    return;
  } catch (error) {
    gameLogger.error('GET /api/bi/upload-stats failed', { error });
    return res.status(500).json({ code: 500, message: 'Internal error' });
  }
});

/**
 * POST /api/bi/client-event
 * 接收前端 SDK 发送的客户端事件（无需 admin 鉴权）
 */
router.post('/client-event', (req: Request, res: Response) => {
  try {
    const { eventSubType, page, action, errorMessage, errorStack, durationMs } = req.body;

    if (!eventSubType || !['page_view', 'user_action', 'client_error'].includes(eventSubType)) {
      return res.status(400).json({ code: 400, message: 'eventSubType must be page_view, user_action, or client_error' });
    }

    const biAnalytics = ComponentManager.instance.getComponentByKey<BiAnalyticsComponent>('BiAnalytics');
    if (!biAnalytics) {
      return res.status(503).json({ code: 503, message: 'BI service not available' });
    }

    const status = eventSubType === 'client_error' ? 'failed' : 'success';

    const data: IClientEventData = {
      eventSubType: eventSubType as IClientEventData['eventSubType'],
      status,
      page: page ?? undefined,
      action: action ?? undefined,
      errorMessage: errorMessage ?? undefined,
      errorStack: errorStack ? String(errorStack).slice(0, 500) : undefined,
      durationMs: durationMs ? parseInt(String(durationMs), 10) : undefined,
    };

    biAnalytics.trackClientEvent(data, {
      userId: (req as unknown as Record<string, unknown>).userId as string | undefined ?? null,
      ipAddress: BiAnalyticsComponent.anonymizeIp(req.ip ?? '0.0.0.0'),
      userAgent: req.headers['user-agent'] ?? 'unknown',
      platform: 'web',
    });

    return res.json({ code: 200, data: { accepted: true } });
  } catch (error) {
    gameLogger.error('POST /api/bi/client-event failed', { error });
    return res.status(500).json({ code: 500, message: 'Internal error' });
  }
});

export default router;
