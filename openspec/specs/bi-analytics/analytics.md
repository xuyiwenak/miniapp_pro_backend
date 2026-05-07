# BI Analytics - Data Analysis & Visualization

## 数据分析和呈现方案

### 1. REST API 接口设计

```typescript
// src/apps/bi/BiAnalyticsController.ts
import type { Request, Response } from 'express';
import { BiAnalyticsService } from './BiAnalyticsService';
import { z } from 'zod';

const QueryMetricsSchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  granularity: z.enum(['hourly', 'daily']),
  appName: z.string().optional(),
  eventType: z.string().optional(),
});

const QueryTrendsSchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  granularity: z.enum(['hourly', 'daily']),
  appName: z.string().optional(),
  eventType: z.string().optional(),
  metrics: z.array(z.string()).default(['totalEvents', 'successRate', 'avgDurationMs']),
});

export class BiAnalyticsController {
  constructor(private service: BiAnalyticsService) {}

  /**
   * GET /api/bi/metrics
   * 查询聚合指标
   */
  async getMetrics(req: Request, res: Response) {
    try {
      const params = QueryMetricsSchema.parse(req.query);

      const metrics = await this.service.queryMetrics(
        new Date(params.startTime),
        new Date(params.endTime),
        params.granularity,
        params.appName,
        params.eventType,
      );

      return res.json({
        code: 200,
        data: metrics,
      });
    } catch (error) {
      return res.status(400).json({
        code: 400,
        message: error instanceof Error ? error.message : 'Invalid request',
      });
    }
  }

  /**
   * GET /api/bi/trends
   * 查询趋势数据（用于图表）
   */
  async getTrends(req: Request, res: Response) {
    try {
      const params = QueryTrendsSchema.parse(req.query);

      const trends = await this.service.queryTrends(
        new Date(params.startTime),
        new Date(params.endTime),
        params.granularity,
        params.metrics,
        params.appName,
        params.eventType,
      );

      return res.json({
        code: 200,
        data: trends,
      });
    } catch (error) {
      return res.status(400).json({
        code: 400,
        message: error instanceof Error ? error.message : 'Invalid request',
      });
    }
  }

  /**
   * GET /api/bi/errors
   * 查询错误分析
   */
  async getErrorAnalysis(req: Request, res: Response) {
    try {
      const { startTime, endTime, appName, limit = 20 } = req.query;

      const errors = await this.service.queryErrorAnalysis(
        new Date(startTime as string),
        new Date(endTime as string),
        appName as string | undefined,
        parseInt(limit as string, 10),
      );

      return res.json({
        code: 200,
        data: errors,
      });
    } catch (error) {
      return res.status(400).json({
        code: 400,
        message: error instanceof Error ? error.message : 'Invalid request',
      });
    }
  }

  /**
   * GET /api/bi/costs
   * 查询成本分析（Qwen token使用）
   */
  async getCostAnalysis(req: Request, res: Response) {
    try {
      const { startTime, endTime, appName, groupBy = 'day' } = req.query;

      const costs = await this.service.queryCostAnalysis(
        new Date(startTime as string),
        new Date(endTime as string),
        appName as string | undefined,
        groupBy as 'hour' | 'day' | 'model',
      );

      return res.json({
        code: 200,
        data: costs,
      });
    } catch (error) {
      return res.status(400).json({
        code: 400,
        message: error instanceof Error ? error.message : 'Invalid request',
      });
    }
  }

  /**
   * GET /api/bi/performance
   * 查询性能分析（P50/P95/P99）
   */
  async getPerformanceAnalysis(req: Request, res: Response) {
    try {
      const { startTime, endTime, appName, eventType } = req.query;

      const performance = await this.service.queryPerformanceAnalysis(
        new Date(startTime as string),
        new Date(endTime as string),
        appName as string | undefined,
        eventType as string | undefined,
      );

      return res.json({
        code: 200,
        data: performance,
      });
    } catch (error) {
      return res.status(400).json({
        code: 400,
        message: error instanceof Error ? error.message : 'Invalid request',
      });
    }
  }

  /**
   * GET /api/bi/upload-stats
   * 查询上传统计（文件类型、大小分布）
   */
  async getUploadStats(req: Request, res: Response) {
    try {
      const { startTime, endTime, appName } = req.query;

      const stats = await this.service.queryUploadStats(
        new Date(startTime as string),
        new Date(endTime as string),
        appName as string | undefined,
      );

      return res.json({
        code: 200,
        data: stats,
      });
    } catch (error) {
      return res.status(400).json({
        code: 400,
        message: error instanceof Error ? error.message : 'Invalid request',
      });
    }
  }

  /**
   * GET /api/bi/user-activity
   * 查询用户活跃度
   */
  async getUserActivity(req: Request, res: Response) {
    try {
      const { startTime, endTime, appName, granularity = 'daily' } = req.query;

      const activity = await this.service.queryUserActivity(
        new Date(startTime as string),
        new Date(endTime as string),
        granularity as 'hourly' | 'daily',
        appName as string | undefined,
      );

      return res.json({
        code: 200,
        data: activity,
      });
    } catch (error) {
      return res.status(400).json({
        code: 400,
        message: error instanceof Error ? error.message : 'Invalid request',
      });
    }
  }

  /**
   * GET /api/bi/dashboard
   * 获取Dashboard总览数据
   */
  async getDashboard(req: Request, res: Response) {
    try {
      const { timeRange = '7d', appName } = req.query;

      const dashboard = await this.service.getDashboardSummary(
        timeRange as string,
        appName as string | undefined,
      );

      return res.json({
        code: 200,
        data: dashboard,
      });
    } catch (error) {
      return res.status(500).json({
        code: 500,
        message: error instanceof Error ? error.message : 'Internal error',
      });
    }
  }
}
```

### 2. BiAnalyticsService 实现

```typescript
// src/apps/bi/BiAnalyticsService.ts
import { Db, Collection } from 'mongodb';
import type { BiEvent, BiMetricsHourly } from '../../entity/BiEvent';

export class BiAnalyticsService {
  private eventsCollection: Collection<BiEvent>;
  private hourlyMetricsCollection: Collection<BiMetricsHourly>;
  private dailyMetricsCollection: Collection<BiMetricsHourly>;

  constructor(private db: Db) {
    this.eventsCollection = db.collection<BiEvent>('bi_events');
    this.hourlyMetricsCollection = db.collection<BiMetricsHourly>('bi_metrics_hourly');
    this.dailyMetricsCollection = db.collection<BiMetricsHourly>('bi_metrics_daily');
  }

  /**
   * 查询趋势数据（时间序列）
   */
  async queryTrends(
    startTime: Date,
    endTime: Date,
    granularity: 'hourly' | 'daily',
    metrics: string[],
    appName?: string,
    eventType?: string,
  ): Promise<Array<Record<string, any>>> {
    const collection = granularity === 'hourly'
      ? this.hourlyMetricsCollection
      : this.dailyMetricsCollection;

    const query: any = {
      periodStart: { $gte: startTime, $lt: endTime },
    };

    if (appName) query.appName = appName;
    if (eventType) query.eventType = eventType;

    const results = await collection
      .find(query)
      .sort({ periodStart: 1 })
      .toArray();

    return results.map((r) => {
      const dataPoint: Record<string, any> = {
        timestamp: r.periodStart,
        appName: r.appName,
        eventType: r.eventType,
      };

      // 计算成功率
      if (metrics.includes('successRate')) {
        dataPoint.successRate = r.totalEvents > 0
          ? r.successCount / r.totalEvents
          : 0;
      }

      // 添加请求的指标
      metrics.forEach((metric) => {
        if (metric in r) {
          dataPoint[metric] = (r as any)[metric];
        }
      });

      return dataPoint;
    });
  }

  /**
   * 查询错误分析
   */
  async queryErrorAnalysis(
    startTime: Date,
    endTime: Date,
    appName?: string,
    limit: number = 20,
  ): Promise<Array<{
    errorCode: string;
    count: number;
    rate: number;
    firstSeen: Date;
    lastSeen: Date;
    affectedUsers: number;
  }>> {
    const pipeline = [
      {
        $match: {
          timestamp: { $gte: startTime, $lt: endTime },
          'data.status': 'failed',
          ...(appName && { appName }),
        },
      },
      {
        $group: {
          _id: '$data.errorCode',
          count: { $sum: 1 },
          firstSeen: { $min: '$timestamp' },
          lastSeen: { $max: '$timestamp' },
          affectedUsers: { $addToSet: '$userId' },
        },
      },
      {
        $project: {
          errorCode: '$_id',
          count: 1,
          firstSeen: 1,
          lastSeen: 1,
          affectedUsers: { $size: '$affectedUsers' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: limit },
    ];

    const results = await this.eventsCollection.aggregate(pipeline).toArray();

    // 计算总事件数用于计算错误率
    const totalEvents = await this.eventsCollection.countDocuments({
      timestamp: { $gte: startTime, $lt: endTime },
      ...(appName && { appName }),
    });

    return results.map((r) => ({
      errorCode: r.errorCode,
      count: r.count,
      rate: totalEvents > 0 ? r.count / totalEvents : 0,
      firstSeen: r.firstSeen,
      lastSeen: r.lastSeen,
      affectedUsers: r.affectedUsers,
    }));
  }

  /**
   * 查询成本分析
   */
  async queryCostAnalysis(
    startTime: Date,
    endTime: Date,
    appName?: string,
    groupBy: 'hour' | 'day' | 'model' = 'day',
  ): Promise<{
    totalCost: number;
    totalTokens: number;
    totalRequests: number;
    breakdown: Array<{
      period?: string;
      model?: string;
      tokens: number;
      cost: number;
      requests: number;
      avgTokensPerRequest: number;
    }>;
  }> {
    let groupId: any;
    if (groupBy === 'hour') {
      groupId = {
        $dateToString: { format: '%Y-%m-%dT%H:00:00Z', date: '$timestamp' },
      };
    } else if (groupBy === 'day') {
      groupId = {
        $dateToString: { format: '%Y-%m-%d', date: '$timestamp' },
      };
    } else {
      groupId = '$data.model';
    }

    const pipeline = [
      {
        $match: {
          eventType: 'qwen_analyze',
          timestamp: { $gte: startTime, $lt: endTime },
          'data.status': 'success',
          ...(appName && { appName }),
        },
      },
      {
        $group: {
          _id: groupId,
          tokens: { $sum: '$data.totalTokens' },
          cost: { $sum: '$data.cost' },
          requests: { $sum: 1 },
        },
      },
      {
        $project: {
          period: groupBy !== 'model' ? '$_id' : undefined,
          model: groupBy === 'model' ? '$_id' : undefined,
          tokens: 1,
          cost: 1,
          requests: 1,
          avgTokensPerRequest: { $divide: ['$tokens', '$requests'] },
        },
      },
      { $sort: { cost: -1 } },
    ];

    const results = await this.eventsCollection.aggregate(pipeline).toArray();

    const totalCost = results.reduce((sum, r) => sum + r.cost, 0);
    const totalTokens = results.reduce((sum, r) => sum + r.tokens, 0);
    const totalRequests = results.reduce((sum, r) => sum + r.requests, 0);

    return {
      totalCost,
      totalTokens,
      totalRequests,
      breakdown: results.map((r) => ({
        period: r.period,
        model: r.model,
        tokens: r.tokens,
        cost: r.cost,
        requests: r.requests,
        avgTokensPerRequest: r.avgTokensPerRequest,
      })),
    };
  }

  /**
   * 查询性能分析（从原始事件计算分位数）
   */
  async queryPerformanceAnalysis(
    startTime: Date,
    endTime: Date,
    appName?: string,
    eventType?: string,
  ): Promise<{
    totalEvents: number;
    avgDurationMs: number;
    p50DurationMs: number;
    p95DurationMs: number;
    p99DurationMs: number;
    maxDurationMs: number;
  }> {
    const query: any = {
      timestamp: { $gte: startTime, $lt: endTime },
    };

    if (appName) query.appName = appName;
    if (eventType) query.eventType = eventType;

    // 获取所有duration值
    const events = await this.eventsCollection
      .find(query, { projection: { 'data.durationMs': 1 } })
      .toArray();

    const durations = events
      .map((e) => e.data.durationMs)
      .filter((d): d is number => typeof d === 'number')
      .sort((a, b) => a - b);

    if (durations.length === 0) {
      return {
        totalEvents: 0,
        avgDurationMs: 0,
        p50DurationMs: 0,
        p95DurationMs: 0,
        p99DurationMs: 0,
        maxDurationMs: 0,
      };
    }

    const percentile = (p: number) => {
      const index = Math.ceil((p / 100) * durations.length) - 1;
      return durations[index];
    };

    const sum = durations.reduce((acc, d) => acc + d, 0);

    return {
      totalEvents: durations.length,
      avgDurationMs: sum / durations.length,
      p50DurationMs: percentile(50),
      p95DurationMs: percentile(95),
      p99DurationMs: percentile(99),
      maxDurationMs: durations[durations.length - 1],
    };
  }

  /**
   * 查询上传统计
   */
  async queryUploadStats(
    startTime: Date,
    endTime: Date,
    appName?: string,
  ): Promise<{
    totalUploads: number;
    totalBytes: number;
    avgBytes: number;
    contentTypes: Array<{ type: string; count: number; percentage: number }>;
    sizeDistribution: Array<{ range: string; count: number }>;
  }> {
    const pipeline = [
      {
        $match: {
          eventType: 'upload_file',
          timestamp: { $gte: startTime, $lt: endTime },
          'data.status': 'success',
          ...(appName && { appName }),
        },
      },
      {
        $group: {
          _id: null,
          totalUploads: { $sum: 1 },
          totalBytes: { $sum: '$data.bytes' },
          contentTypes: { $push: '$data.contentType' },
          sizes: { $push: '$data.bytes' },
        },
      },
    ];

    const [result] = await this.eventsCollection.aggregate(pipeline).toArray();

    if (!result) {
      return {
        totalUploads: 0,
        totalBytes: 0,
        avgBytes: 0,
        contentTypes: [],
        sizeDistribution: [],
      };
    }

    // 统计contentType分布
    const contentTypeCounts: Record<string, number> = {};
    result.contentTypes.forEach((type: string) => {
      contentTypeCounts[type] = (contentTypeCounts[type] || 0) + 1;
    });

    const contentTypes = Object.entries(contentTypeCounts)
      .map(([type, count]) => ({
        type,
        count,
        percentage: count / result.totalUploads,
      }))
      .sort((a, b) => b.count - a.count);

    // 统计文件大小分布
    const sizeRanges = [
      { label: '< 100KB', min: 0, max: 100 * 1024 },
      { label: '100KB - 500KB', min: 100 * 1024, max: 500 * 1024 },
      { label: '500KB - 1MB', min: 500 * 1024, max: 1024 * 1024 },
      { label: '1MB - 5MB', min: 1024 * 1024, max: 5 * 1024 * 1024 },
      { label: '> 5MB', min: 5 * 1024 * 1024, max: Infinity },
    ];

    const sizeDistribution = sizeRanges.map((range) => ({
      range: range.label,
      count: result.sizes.filter((size: number) => size >= range.min && size < range.max).length,
    }));

    return {
      totalUploads: result.totalUploads,
      totalBytes: result.totalBytes,
      avgBytes: result.totalBytes / result.totalUploads,
      contentTypes,
      sizeDistribution,
    };
  }

  /**
   * 查询用户活跃度
   */
  async queryUserActivity(
    startTime: Date,
    endTime: Date,
    granularity: 'hourly' | 'daily',
    appName?: string,
  ): Promise<Array<{
    timestamp: Date;
    activeUsers: number;
    activeSessions: number;
    eventsPerUser: number;
  }>> {
    const collection = granularity === 'hourly'
      ? this.hourlyMetricsCollection
      : this.dailyMetricsCollection;

    const query: any = {
      periodStart: { $gte: startTime, $lt: endTime },
    };

    if (appName) query.appName = appName;

    const results = await collection
      .find(query)
      .sort({ periodStart: 1 })
      .toArray();

    // 按时间聚合
    const timeMap = new Map<string, {
      activeUsers: Set<string>;
      activeSessions: Set<string>;
      totalEvents: number;
    }>();

    results.forEach((r) => {
      const key = r.periodStart.toISOString();
      if (!timeMap.has(key)) {
        timeMap.set(key, {
          activeUsers: new Set(),
          activeSessions: new Set(),
          totalEvents: 0,
        });
      }

      const entry = timeMap.get(key)!;
      entry.totalEvents += r.totalEvents;
    });

    return Array.from(timeMap.entries()).map(([timestamp, data]) => ({
      timestamp: new Date(timestamp),
      activeUsers: data.activeUsers.size,
      activeSessions: data.activeSessions.size,
      eventsPerUser: data.activeUsers.size > 0
        ? data.totalEvents / data.activeUsers.size
        : 0,
    }));
  }

  /**
   * 获取Dashboard总览
   */
  async getDashboardSummary(
    timeRange: string,
    appName?: string,
  ): Promise<{
    overview: {
      totalEvents: number;
      totalUsers: number;
      successRate: number;
      avgResponseTime: number;
    };
    qwenCosts: {
      totalCost: number;
      totalTokens: number;
      trend: 'up' | 'down' | 'stable';
    };
    topErrors: Array<{ errorCode: string; count: number }>;
    recentActivity: Array<{ timestamp: Date; events: number }>;
  }> {
    // 解析时间范围
    const { startTime, endTime } = this.parseTimeRange(timeRange);

    // 并行查询多个指标
    const [overview, costs, errors, activity] = await Promise.all([
      this.getOverviewStats(startTime, endTime, appName),
      this.queryCostAnalysis(startTime, endTime, appName, 'day'),
      this.queryErrorAnalysis(startTime, endTime, appName, 5),
      this.queryTrends(startTime, endTime, 'daily', ['totalEvents'], appName),
    ]);

    return {
      overview,
      qwenCosts: {
        totalCost: costs.totalCost,
        totalTokens: costs.totalTokens,
        trend: this.calculateTrend(costs.breakdown),
      },
      topErrors: errors.slice(0, 5).map((e) => ({
        errorCode: e.errorCode,
        count: e.count,
      })),
      recentActivity: activity.slice(-7).map((a) => ({
        timestamp: new Date(a.timestamp),
        events: a.totalEvents,
      })),
    };
  }

  private async getOverviewStats(
    startTime: Date,
    endTime: Date,
    appName?: string,
  ): Promise<{
    totalEvents: number;
    totalUsers: number;
    successRate: number;
    avgResponseTime: number;
  }> {
    const pipeline = [
      {
        $match: {
          timestamp: { $gte: startTime, $lt: endTime },
          ...(appName && { appName }),
        },
      },
      {
        $group: {
          _id: null,
          totalEvents: { $sum: 1 },
          successCount: {
            $sum: { $cond: [{ $eq: ['$data.status', 'success'] }, 1, 0] },
          },
          uniqueUsers: { $addToSet: '$userId' },
          durations: { $push: '$data.durationMs' },
        },
      },
    ];

    const [result] = await this.eventsCollection.aggregate(pipeline).toArray();

    if (!result) {
      return {
        totalEvents: 0,
        totalUsers: 0,
        successRate: 0,
        avgResponseTime: 0,
      };
    }

    const avgDuration = result.durations.reduce((sum: number, d: number) => sum + (d || 0), 0) / result.durations.length;

    return {
      totalEvents: result.totalEvents,
      totalUsers: result.uniqueUsers.length,
      successRate: result.totalEvents > 0 ? result.successCount / result.totalEvents : 0,
      avgResponseTime: avgDuration,
    };
  }

  private parseTimeRange(timeRange: string): { startTime: Date; endTime: Date } {
    const endTime = new Date();
    const startTime = new Date();

    const match = timeRange.match(/^(\d+)([hdwm])$/);
    if (!match) {
      // 默认7天
      startTime.setDate(startTime.getDate() - 7);
      return { startTime, endTime };
    }

    const [, value, unit] = match;
    const numValue = parseInt(value, 10);

    switch (unit) {
      case 'h':
        startTime.setHours(startTime.getHours() - numValue);
        break;
      case 'd':
        startTime.setDate(startTime.getDate() - numValue);
        break;
      case 'w':
        startTime.setDate(startTime.getDate() - numValue * 7);
        break;
      case 'm':
        startTime.setMonth(startTime.getMonth() - numValue);
        break;
    }

    return { startTime, endTime };
  }

  private calculateTrend(breakdown: Array<{ cost: number }>): 'up' | 'down' | 'stable' {
    if (breakdown.length < 2) return 'stable';

    const recent = breakdown.slice(-3);
    const older = breakdown.slice(-6, -3);

    if (older.length === 0) return 'stable';

    const recentAvg = recent.reduce((sum, b) => sum + b.cost, 0) / recent.length;
    const olderAvg = older.reduce((sum, b) => sum + b.cost, 0) / older.length;

    const change = (recentAvg - olderAvg) / olderAvg;

    if (change > 0.1) return 'up';
    if (change < -0.1) return 'down';
    return 'stable';
  }
}
```

### 3. 定时任务：数据聚合

```typescript
// src/jobs/BiAggregationJob.ts
import { CronJob } from 'cron';
import { Db } from 'mongodb';
import { gameLogger as logger } from '../util/logger';
import { BiAggregator } from './BiAggregator';

export class BiAggregationJob {
  private hourlyJob: CronJob;
  private dailyJob: CronJob;
  private aggregator: BiAggregator;

  constructor(db: Db) {
    this.aggregator = new BiAggregator(db);

    // 每5分钟执行一次小时聚合（聚合上一个完整小时）
    this.hourlyJob = new CronJob(
      '*/5 * * * *', // 每5分钟
      async () => {
        try {
          await this.runHourlyAggregation();
        } catch (error) {
          logger.error('Hourly aggregation failed', { error });
        }
      },
      null,
      false,
      'Asia/Shanghai',
    );

    // 每天凌晨1点执行日聚合（聚合昨天的数据）
    this.dailyJob = new CronJob(
      '0 1 * * *', // 每天01:00
      async () => {
        try {
          await this.runDailyAggregation();
        } catch (error) {
          logger.error('Daily aggregation failed', { error });
        }
      },
      null,
      false,
      'Asia/Shanghai',
    );
  }

  start() {
    this.hourlyJob.start();
    this.dailyJob.start();
    logger.info('BiAggregationJob started');
  }

  stop() {
    this.hourlyJob.stop();
    this.dailyJob.stop();
    logger.info('BiAggregationJob stopped');
  }

  private async runHourlyAggregation() {
    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
    const periodStart = new Date(periodEnd.getTime() - 60 * 60 * 1000); // 1小时前

    logger.info('Running hourly aggregation', { periodStart, periodEnd });

    await this.aggregator.aggregateHourly(periodStart, periodEnd);

    logger.info('Hourly aggregation completed');
  }

  private async runDailyAggregation() {
    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const periodStart = new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000); // 昨天

    logger.info('Running daily aggregation', { periodStart, periodEnd });

    await this.aggregator.aggregateDaily(periodStart, periodEnd);

    logger.info('Daily aggregation completed');
  }
}
```

```typescript
// src/jobs/BiAggregator.ts
import { Db, Collection } from 'mongodb';
import type { BiEvent, BiMetricsHourly, AppName, EventType } from '../entity/BiEvent';

export class BiAggregator {
  private eventsCollection: Collection<BiEvent>;
  private hourlyMetricsCollection: Collection<BiMetricsHourly>;
  private dailyMetricsCollection: Collection<BiMetricsHourly>;

  constructor(private db: Db) {
    this.eventsCollection = db.collection<BiEvent>('bi_events');
    this.hourlyMetricsCollection = db.collection<BiMetricsHourly>('bi_metrics_hourly');
    this.dailyMetricsCollection = db.collection<BiMetricsHourly>('bi_metrics_daily');
  }

  /**
   * 小时聚合：聚合指定小时的所有事件类型
   */
  async aggregateHourly(periodStart: Date, periodEnd: Date) {
    // 获取该时间段内的所有应用和事件类型组合
    const combinations = await this.eventsCollection
      .distinct('appName', {
        timestamp: { $gte: periodStart, $lt: periodEnd },
      })
      .then(async (appNames) => {
        const eventTypes = await this.eventsCollection.distinct('eventType', {
          timestamp: { $gte: periodStart, $lt: periodEnd },
        });

        return appNames.flatMap((appName) =>
          eventTypes.map((eventType) => ({ appName, eventType })),
        );
      });

    // 为每个组合执行聚合
    for (const { appName, eventType } of combinations) {
      await this.aggregateHourlyForType(
        appName as AppName,
        eventType as EventType,
        periodStart,
        periodEnd,
      );
    }
  }

  private async aggregateHourlyForType(
    appName: AppName,
    eventType: EventType,
    periodStart: Date,
    periodEnd: Date,
  ) {
    const pipeline = [
      {
        $match: {
          appName,
          eventType,
          timestamp: { $gte: periodStart, $lt: periodEnd },
        },
      },
      {
        $group: {
          _id: null,
          totalEvents: { $sum: 1 },
          successCount: {
            $sum: { $cond: [{ $eq: ['$data.status', 'success'] }, 1, 0] },
          },
          failedCount: {
            $sum: { $cond: [{ $eq: ['$data.status', 'failed'] }, 1, 0] },
          },
          uniqueUsers: { $addToSet: '$userId' },
          uniqueSessions: { $addToSet: '$sessionId' },
          durations: { $push: '$data.durationMs' },

          // Upload指标
          uploadBytes: {
            $push: {
              $cond: [{ $eq: ['$eventType', 'upload_file'] }, '$data.bytes', '$$REMOVE'],
            },
          },
          uploadContentTypes: {
            $push: {
              $cond: [{ $eq: ['$eventType', 'upload_file'] }, '$data.contentType', '$$REMOVE'],
            },
          },

          // Qwen指标
          qwenTokens: {
            $push: {
              $cond: [{ $eq: ['$eventType', 'qwen_analyze'] }, '$data.totalTokens', '$$REMOVE'],
            },
          },
          qwenCosts: {
            $push: {
              $cond: [{ $eq: ['$eventType', 'qwen_analyze'] }, '$data.cost', '$$REMOVE'],
            },
          },
          qwenModels: {
            $push: {
              $cond: [{ $eq: ['$eventType', 'qwen_analyze'] }, '$data.model', '$$REMOVE'],
            },
          },

          // API指标
          apiEndpoints: {
            $push: {
              $cond: [{ $eq: ['$eventType', 'api_request'] }, '$data.endpoint', '$$REMOVE'],
            },
          },
          apiStatusCodes: {
            $push: {
              $cond: [
                { $eq: ['$eventType', 'api_request'] },
                { $toString: '$data.statusCode' },
                '$$REMOVE',
              ],
            },
          },
          apiRequestBytes: {
            $push: {
              $cond: [{ $eq: ['$eventType', 'api_request'] }, '$data.requestSize', '$$REMOVE'],
            },
          },
          apiResponseBytes: {
            $push: {
              $cond: [{ $eq: ['$eventType', 'api_request'] }, '$data.responseSize', '$$REMOVE'],
            },
          },
        },
      },
    ];

    const [result] = await this.eventsCollection.aggregate(pipeline).toArray();

    if (!result || result.totalEvents === 0) {
      return; // 没有数据，跳过
    }

    // 计算性能指标
    const sortedDurations = result.durations.sort((a: number, b: number) => a - b);
    const p50 = this.percentile(sortedDurations, 50);
    const p95 = this.percentile(sortedDurations, 95);
    const p99 = this.percentile(sortedDurations, 99);

    // 构建指标文档
    const metrics: Partial<BiMetricsHourly> = {
      periodStart,
      periodEnd,
      appName,
      eventType,
      totalEvents: result.totalEvents,
      successCount: result.successCount,
      failedCount: result.failedCount,
      uniqueUsers: result.uniqueUsers.length,
      uniqueSessions: result.uniqueSessions.length,
      avgDurationMs: result.durations.reduce((sum: number, d: number) => sum + d, 0) / result.durations.length,
      p50DurationMs: p50,
      p95DurationMs: p95,
      p99DurationMs: p99,
      maxDurationMs: sortedDurations[sortedDurations.length - 1],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 添加事件特定指标
    if (eventType === 'upload_file') {
      metrics.upload = {
        totalBytes: result.uploadBytes.reduce((sum: number, b: number) => sum + b, 0),
        avgBytes: result.uploadBytes.reduce((sum: number, b: number) => sum + b, 0) / result.uploadBytes.length,
        totalImages: result.uploadBytes.length,
        contentTypes: this.countOccurrences(result.uploadContentTypes),
      };
    } else if (eventType === 'qwen_analyze') {
      metrics.qwen = {
        totalTokens: result.qwenTokens.reduce((sum: number, t: number) => sum + t, 0),
        totalCost: result.qwenCosts.reduce((sum: number, c: number) => sum + c, 0),
        avgTokensPerRequest: result.qwenTokens.reduce((sum: number, t: number) => sum + t, 0) / result.qwenTokens.length,
        models: this.countOccurrences(result.qwenModels),
      };
    } else if (eventType === 'api_request') {
      metrics.api = {
        endpoints: this.countOccurrences(result.apiEndpoints),
        statusCodes: this.countOccurrences(result.apiStatusCodes),
        totalRequestBytes: result.apiRequestBytes.reduce((sum: number, b: number) => sum + b, 0),
        totalResponseBytes: result.apiResponseBytes.reduce((sum: number, b: number) => sum + b, 0),
      };
    }

    // Upsert到hourly metrics表
    await this.hourlyMetricsCollection.updateOne(
      { appName, eventType, periodStart },
      { $set: metrics },
      { upsert: true },
    );
  }

  /**
   * 日聚合：从小时指标聚合到日指标
   */
  async aggregateDaily(periodStart: Date, periodEnd: Date) {
    const combinations = await this.hourlyMetricsCollection
      .distinct('appName', {
        periodStart: { $gte: periodStart, $lt: periodEnd },
      })
      .then(async (appNames) => {
        const eventTypes = await this.hourlyMetricsCollection.distinct('eventType', {
          periodStart: { $gte: periodStart, $lt: periodEnd },
        });

        return appNames.flatMap((appName) =>
          eventTypes.map((eventType) => ({ appName, eventType })),
        );
      });

    for (const { appName, eventType } of combinations) {
      await this.aggregateDailyForType(
        appName as AppName,
        eventType as EventType,
        periodStart,
        periodEnd,
      );
    }
  }

  private async aggregateDailyForType(
    appName: AppName,
    eventType: EventType,
    periodStart: Date,
    periodEnd: Date,
  ) {
    const hourlyMetrics = await this.hourlyMetricsCollection
      .find({
        appName,
        eventType,
        periodStart: { $gte: periodStart, $lt: periodEnd },
      })
      .toArray();

    if (hourlyMetrics.length === 0) return;

    // 聚合计算
    const totalEvents = hourlyMetrics.reduce((sum, m) => sum + m.totalEvents, 0);
    const successCount = hourlyMetrics.reduce((sum, m) => sum + m.successCount, 0);
    const failedCount = hourlyMetrics.reduce((sum, m) => sum + m.failedCount, 0);

    // 加权平均
    const weightedAvgDuration = hourlyMetrics.reduce(
      (sum, m) => sum + m.avgDurationMs * m.totalEvents,
      0,
    ) / totalEvents;

    // 合并分位数（简化：取最大值）
    const p50DurationMs = Math.max(...hourlyMetrics.map((m) => m.p50DurationMs));
    const p95DurationMs = Math.max(...hourlyMetrics.map((m) => m.p95DurationMs));
    const p99DurationMs = Math.max(...hourlyMetrics.map((m) => m.p99DurationMs));
    const maxDurationMs = Math.max(...hourlyMetrics.map((m) => m.maxDurationMs));

    // 合并uniqueUsers和uniqueSessions（需要从原始事件重新计算，这里简化为求和）
    const uniqueUsers = hourlyMetrics.reduce((sum, m) => sum + m.uniqueUsers, 0);
    const uniqueSessions = hourlyMetrics.reduce((sum, m) => sum + m.uniqueSessions, 0);

    const dailyMetrics: Partial<BiMetricsHourly> = {
      periodStart,
      periodEnd,
      appName,
      eventType,
      totalEvents,
      successCount,
      failedCount,
      uniqueUsers,
      uniqueSessions,
      avgDurationMs: weightedAvgDuration,
      p50DurationMs,
      p95DurationMs,
      p99DurationMs,
      maxDurationMs,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 合并事件特定指标
    if (eventType === 'upload_file') {
      dailyMetrics.upload = {
        totalBytes: hourlyMetrics.reduce((sum, m) => sum + (m.upload?.totalBytes || 0), 0),
        avgBytes: 0, // 需要重新计算
        totalImages: hourlyMetrics.reduce((sum, m) => sum + (m.upload?.totalImages || 0), 0),
        contentTypes: this.mergeContentTypes(hourlyMetrics.map((m) => m.upload?.contentTypes || {})),
      };
      dailyMetrics.upload.avgBytes = dailyMetrics.upload.totalBytes / dailyMetrics.upload.totalImages;
    } else if (eventType === 'qwen_analyze') {
      dailyMetrics.qwen = {
        totalTokens: hourlyMetrics.reduce((sum, m) => sum + (m.qwen?.totalTokens || 0), 0),
        totalCost: hourlyMetrics.reduce((sum, m) => sum + (m.qwen?.totalCost || 0), 0),
        avgTokensPerRequest: 0,
        models: this.mergeModels(hourlyMetrics.map((m) => m.qwen?.models || {})),
      };
      dailyMetrics.qwen.avgTokensPerRequest = dailyMetrics.qwen.totalTokens / totalEvents;
    } else if (eventType === 'api_request') {
      dailyMetrics.api = {
        endpoints: this.mergeEndpoints(hourlyMetrics.map((m) => m.api?.endpoints || {})),
        statusCodes: this.mergeStatusCodes(hourlyMetrics.map((m) => m.api?.statusCodes || {})),
        totalRequestBytes: hourlyMetrics.reduce((sum, m) => sum + (m.api?.totalRequestBytes || 0), 0),
        totalResponseBytes: hourlyMetrics.reduce((sum, m) => sum + (m.api?.totalResponseBytes || 0), 0),
      };
    }

    // Upsert到daily metrics表
    await this.dailyMetricsCollection.updateOne(
      { appName, eventType, periodStart },
      { $set: dailyMetrics },
      { upsert: true },
    );
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  private countOccurrences(arr: string[]): Record<string, number> {
    return arr.reduce((acc, val) => {
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private mergeContentTypes(types: Array<Record<string, number>>): Record<string, number> {
    return types.reduce((acc, t) => {
      for (const [key, count] of Object.entries(t)) {
        acc[key] = (acc[key] || 0) + count;
      }
      return acc;
    }, {} as Record<string, number>);
  }

  private mergeModels(models: Array<Record<string, number>>): Record<string, number> {
    return this.mergeContentTypes(models);
  }

  private mergeEndpoints(endpoints: Array<Record<string, number>>): Record<string, number> {
    return this.mergeContentTypes(endpoints);
  }

  private mergeStatusCodes(codes: Array<Record<string, number>>): Record<string, number> {
    return this.mergeContentTypes(codes);
  }
}
```

### 4. Dashboard 可视化方案

#### 推荐Dashboard布局

```
┌─────────────────────────────────────────────────────────────┐
│  BI Analytics Dashboard - 过去7天                            │
├─────────────────────────────────────────────────────────────┤
│  [应用选择: 全部 ▼]  [时间范围: 7d ▼]                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  总事件数    │  │  活跃用户    │  │  成功率      │       │
│  │              │  │              │  │              │       │
│  │  123,456     │  │  4,567       │  │  98.5%       │       │
│  │  ↑ 12%       │  │  ↑ 5%        │  │  ↓ 0.2%      │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  平均响应时间│  │  Qwen成本    │  │  上传总量    │       │
│  │              │  │              │  │              │       │
│  │  234ms       │  │  $12.34      │  │  2.3GB       │       │
│  │  ↓ 23ms      │  │  ↑ $1.23     │  │  ↑ 0.5GB     │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│  事件趋势 (折线图)                                            │
│  ┌───────────────────────────────────────────────────────┐   │
│  │                             ╱╲                        │   │
│  │                            ╱  ╲        ╱╲            │   │
│  │                  ╱╲      ╱    ╲      ╱  ╲           │   │
│  │        ╱╲      ╱  ╲    ╱      ╲    ╱    ╲          │   │
│  │      ╱  ╲    ╱    ╲  ╱        ╲  ╱      ╲         │   │
│  │    ╱    ╲  ╱      ╲╱          ╲╱        ╲        │   │
│  │  ╱      ╲╱                                ╲       │   │
│  │─────────────────────────────────────────────────────│   │
│  │ Mon  Tue  Wed  Thu  Fri  Sat  Sun                  │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                               │
├───────────────────────────┬─────────────────────────────────┤
│  错误分析 (表格)          │  Qwen成本分析 (饼图)            │
│  ┌──────────────────────┐ │  ┌───────────────────────────┐ │
│  │ 错误码    │ 次数 │率 │ │  │                           │ │
│  ├──────────────────────┤ │  │      qwen-vl-plus         │ │
│  │ NOT_ARTWORK│  23 │2%│ │  │         78%               │ │
│  │ TIMEOUT    │  12 │1%│ │  │                           │ │
│  │ OSS_ERROR  │   8 │1%│ │  │    qwen-vl-max  22%       │ │
│  └──────────────────────┘ │  └───────────────────────────┘ │
│                           │                                 │
├───────────────────────────┴─────────────────────────────────┤
│  上传统计                                                     │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ 文件类型分布 (柱状图)     │ 文件大小分布 (柱状图)    │   │
│  │ ████████ image/jpeg 45%   │ ████ <100KB    12%       │   │
│  │ █████ image/png     30%   │ ██████ 100-500KB 45%     │   │
│  │ ███ image/webp      25%   │ ████ 500KB-1MB   23%     │   │
│  │                           │ ██ 1-5MB         18%     │   │
│  │                           │ █ >5MB            2%     │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

#### 推荐可视化工具

1. **前端框架**: React + TypeScript
2. **图表库**:
   - Recharts (轻量，简单易用)
   - ECharts (功能强大，中文文档完善)
   - Chart.js (简单场景)
3. **UI组件**: Ant Design / Material-UI
4. **数据获取**: React Query / SWR (自动缓存和刷新)

#### 示例：React组件

```typescript
// Dashboard.tsx
import React from 'react';
import { useQuery } from 'react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Card, Select, DatePicker } from 'antd';

export function Dashboard() {
  const [timeRange, setTimeRange] = React.useState('7d');
  const [appName, setAppName] = React.useState<string | undefined>();

  const { data: dashboard } = useQuery(
    ['dashboard', timeRange, appName],
    () => fetchDashboard(timeRange, appName),
    { refetchInterval: 60000 }, // 每分钟刷新
  );

  return (
    <div className="dashboard">
      <h1>BI Analytics Dashboard</h1>

      <div className="filters">
        <Select value={appName} onChange={setAppName}>
          <Option value={undefined}>全部应用</Option>
          <Option value="mandis">Mandis</Option>
          <Option value="begreat">Begreat</Option>
        </Select>

        <Select value={timeRange} onChange={setTimeRange}>
          <Option value="24h">过去24小时</Option>
          <Option value="7d">过去7天</Option>
          <Option value="30d">过去30天</Option>
        </Select>
      </div>

      <div className="metrics-cards">
        <MetricCard
          title="总事件数"
          value={dashboard?.overview.totalEvents}
          trend="up"
        />
        <MetricCard
          title="活跃用户"
          value={dashboard?.overview.totalUsers}
          trend="up"
        />
        <MetricCard
          title="成功率"
          value={`${(dashboard?.overview.successRate * 100).toFixed(1)}%`}
          trend="stable"
        />
      </div>

      <Card title="事件趋势">
        <LineChart width={800} height={300} data={dashboard?.recentActivity}>
          <XAxis dataKey="timestamp" />
          <YAxis />
          <CartesianGrid strokeDasharray="3 3" />
          <Tooltip />
          <Line type="monotone" dataKey="events" stroke="#8884d8" />
        </LineChart>
      </Card>

      <div className="bottom-row">
        <ErrorTable errors={dashboard?.topErrors} />
        <CostPieChart costs={dashboard?.qwenCosts} />
      </div>
    </div>
  );
}

async function fetchDashboard(timeRange: string, appName?: string) {
  const params = new URLSearchParams({ timeRange });
  if (appName) params.append('appName', appName);

  const res = await fetch(`/api/bi/dashboard?${params}`);
  return res.json().then((d) => d.data);
}
```

## 总结

本方案提供了完整的BI数据分析和呈现解决方案：

1. ✅ **REST API接口** - 支持多维度查询（指标、趋势、错误、成本、性能）
2. ✅ **聚合计算** - 小时/日聚合任务，自动计算统计指标
3. ✅ **定时任务** - Cron调度，每5分钟/每天自动聚合
4. ✅ **Dashboard设计** - 清晰的布局和图表建议
5. ✅ **性能优化** - 索引优化、缓存策略、分页查询

下一步可以：
- 添加告警功能（错误率超阈值、成本超预算）
- 导出报表功能（Excel、PDF）
- 用户行为分析（漏斗分析、留存分析）
- 实时大屏展示
