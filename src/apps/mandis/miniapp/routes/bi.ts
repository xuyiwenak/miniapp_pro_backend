import { Router, Request, Response } from 'express';
import { BiAnalyticsService } from '../../../bi/BiAnalyticsService';
import { ComponentManager } from '../../../../common/BaseComponent';
import { BiAnalyticsComponent } from '../../../../component/BiAnalyticsComponent';
import type { IClientEventData } from '../../../../entity/biEvent.entity';
import { authMiddleware } from '../../../../shared/miniapp/middleware/auth';
import { gameLogger } from '../../../../util/logger';

const router = Router();
const service = new BiAnalyticsService();

/**
 * GET /api/bi/metrics
 * 查询聚合指标
 */
router.get('/metrics', authMiddleware, async (req: Request, res: Response) => {
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

    return res.json({ code: 200, data });
  } catch (error) {
    gameLogger.error('GET /api/bi/metrics failed', { error });
    return res.status(500).json({ code: 500, message: 'Internal error' });
  }
});

/**
 * GET /api/bi/trends
 * 查询趋势数据
 */
router.get('/trends', authMiddleware, async (req: Request, res: Response) => {
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

    return res.json({ code: 200, data });
  } catch (error) {
    gameLogger.error('GET /api/bi/trends failed', { error });
    return res.status(500).json({ code: 500, message: 'Internal error' });
  }
});

/**
 * GET /api/bi/errors
 * 查询错误分析
 */
router.get('/errors', authMiddleware, async (req: Request, res: Response) => {
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

    return res.json({ code: 200, data });
  } catch (error) {
    gameLogger.error('GET /api/bi/errors failed', { error });
    return res.status(500).json({ code: 500, message: 'Internal error' });
  }
});

/**
 * GET /api/bi/costs
 * 查询成本分析
 */
router.get('/costs', authMiddleware, async (req: Request, res: Response) => {
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

    return res.json({ code: 200, data });
  } catch (error) {
    gameLogger.error('GET /api/bi/costs failed', { error });
    return res.status(500).json({ code: 500, message: 'Internal error' });
  }
});

/**
 * GET /api/bi/performance
 * 查询性能分析
 */
router.get('/performance', authMiddleware, async (req: Request, res: Response) => {
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

    return res.json({ code: 200, data });
  } catch (error) {
    gameLogger.error('GET /api/bi/performance failed', { error });
    return res.status(500).json({ code: 500, message: 'Internal error' });
  }
});

/**
 * GET /api/bi/dashboard
 * Dashboard 总览
 */
router.get('/dashboard', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { timeRange, appName } = req.query;

    const data = await service.getDashboardSummary(
      (timeRange as string) ?? '7d',
      appName as string | undefined,
    );

    return res.json({ code: 200, data });
  } catch (error) {
    gameLogger.error('GET /api/bi/dashboard failed', { error });
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
