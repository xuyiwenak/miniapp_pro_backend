import { BiEvent } from '../../entity/biEvent.entity';
import { BiMetricsHourly, BiMetricsDaily } from '../../entity/biMetrics.entity';

export interface DashboardSummary {
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
    breakdown: Array<{
      period?: string;
      model?: string;
      tokens: number;
      cost: number;
      requests: number;
      avgTokensPerRequest?: number;
    }>;
  };
  topErrors: Array<{ errorCode: string; count: number; rate: number }>;
  recentActivity: Array<{ timestamp: string; totalEvents: number }>;
}

export interface TrendPoint {
  timestamp: string;
  totalEvents: number;
  successRate: number;
  avgDurationMs: number;
  appName: string;
  eventType: string;
}

export interface ErrorItem {
  errorCode: string;
  count: number;
  rate: number;
  firstSeen: Date;
  lastSeen: Date;
  affectedUsers: number;
}

export interface CostBreakdown {
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
}

export interface PerformanceStats {
  totalEvents: number;
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  maxDurationMs: number;
}

/**
 * BI 查询服务层
 * 实现 OpenSpec: bi-aggregation-api
 * 优先查聚合表（快），降级查原始事件表
 */
export class BiAnalyticsService {
  /**
   * 查询趋势数据（时间序列）
   */
  async queryTrends(
    startTime: Date,
    endTime: Date,
    granularity: 'hourly' | 'daily',
    _metrics: string[] = ['totalEvents', 'successRate', 'avgDurationMs'],
    appName?: string,
    eventType?: string,
  ): Promise<TrendPoint[]> {
    const collection = granularity === 'hourly' ? BiMetricsHourly : BiMetricsDaily;
    const query: Record<string, unknown> = {
      periodStart: { $gte: startTime, $lt: endTime },
    };
    if (appName) query.appName = appName;
    if (eventType) query.eventType = eventType;

    const results = await collection.find(query).sort({ periodStart: 1 }).lean();

    return results.map((r) => ({
      timestamp: r.periodStart.toISOString(),
      totalEvents: r.totalEvents,
      successRate: r.totalEvents > 0 ? r.successCount / r.totalEvents : 0,
      avgDurationMs: r.avgDurationMs,
      appName: r.appName,
      eventType: r.eventType,
    }));
  }

  /**
   * 查询错误分析
   */
  async queryErrorAnalysis(
    startTime: Date,
    endTime: Date,
    appName?: string,
    limit = 20,
  ): Promise<ErrorItem[]> {
    const match = this.buildFailedEventMatch(startTime, endTime, appName);
    const pipeline = this.buildErrorAnalysisPipeline(match, limit);
    const [results, totalEvents] = await Promise.all([
      BiEvent.aggregate(pipeline),
      this.countTotalEvents(startTime, endTime, appName),
    ]);
    return this.mapErrorItems(results, totalEvents);
  }

  /**
   * 查询成本分析
   */
  async queryCostAnalysis(
    startTime: Date,
    endTime: Date,
    appName?: string,
    groupBy: 'hour' | 'day' | 'model' = 'day',
  ): Promise<CostBreakdown> {
    const match = this.buildCostMatch(startTime, endTime, appName);
    const groupId = this.buildCostGroupId(groupBy);
    const pipeline = this.buildCostPipeline(match, groupBy, groupId);
    const results = await BiEvent.aggregate(pipeline);
    return this.buildCostBreakdown(results);
  }

  /**
   * 查询性能分析
   */
  async queryPerformanceAnalysis(
    startTime: Date,
    endTime: Date,
    appName?: string,
    eventType?: string,
  ): Promise<PerformanceStats> {
    const query: Record<string, unknown> = {
      timestamp: { $gte: startTime, $lt: endTime },
    };
    if (appName) query.appName = appName;
    if (eventType) query.eventType = eventType;

    const events = await BiEvent.find(query, { 'data.durationMs': 1 }).lean();
    const durations = events
      .map((e) => (e.data as Record<string, unknown>).durationMs as number | undefined)
      .filter((d): d is number => typeof d === 'number')
      .sort((a, b) => a - b);

    if (!durations.length) {
      return {
        totalEvents: 0,
        avgDurationMs: 0,
        p50DurationMs: 0,
        p95DurationMs: 0,
        p99DurationMs: 0,
        maxDurationMs: 0,
      };
    }

    const percentile = (arr: number[], p: number) => {
      const idx = Math.ceil((p / 100) * arr.length) - 1;
      return arr[Math.max(0, idx)];
    };

    return {
      totalEvents: durations.length,
      avgDurationMs: durations.reduce((s, d) => s + d, 0) / durations.length,
      p50DurationMs: percentile(durations, 50),
      p95DurationMs: percentile(durations, 95),
      p99DurationMs: percentile(durations, 99),
      maxDurationMs: durations[durations.length - 1],
    };
  }

  /**
   * 获取 Dashboard 总览
   */
  async getDashboardSummary(
    timeRange: string,
    appName?: string,
  ): Promise<DashboardSummary> {
    const { startTime, endTime } = this.parseTimeRange(timeRange);

    const [overview, costs, errors, activity] = await Promise.all([
      this.getOverviewStats(startTime, endTime, appName),
      this.queryCostAnalysis(startTime, endTime, appName, 'day'),
      this.queryErrorAnalysis(startTime, endTime, appName, 5),
      this.queryTrends(startTime, endTime, 'daily', undefined, appName),
    ]);

    return {
      overview,
      qwenCosts: {
        totalCost: costs.totalCost,
        totalTokens: costs.totalTokens,
        trend: this.calculateCostTrend(costs.breakdown),
        breakdown: costs.breakdown,
      },
      topErrors: errors.slice(0, 5),
      recentActivity: activity.slice(-7).map((a) => ({
        timestamp: a.timestamp,
        totalEvents: a.totalEvents,
      })),
    };
  }

  /**
   * 查询指标（通用聚合查询）
   */
  async queryMetrics(
    startTime: Date,
    endTime: Date,
    granularity: 'hourly' | 'daily',
    appName?: string,
    eventType?: string,
  ) {
    const collection = granularity === 'hourly' ? BiMetricsHourly : BiMetricsDaily;
    const query: Record<string, unknown> = {
      periodStart: { $gte: startTime, $lt: endTime },
    };
    if (appName) query.appName = appName;
    if (eventType) query.eventType = eventType;

    return collection.find(query).sort({ periodStart: 1 }).lean();
  }

  // ── 私有方法 ──

  private async getOverviewStats(startTime: Date, endTime: Date, appName?: string) {
    const match: Record<string, unknown> = {
      timestamp: { $gte: startTime, $lt: endTime },
    };
    if (appName) match.appName = appName;

    const [result] = await BiEvent.aggregate([
      { $match: match },
      {
        $group: {
          _id: null as unknown,
          totalEvents: { $sum: 1 },
          successCount: {
            $sum: { $cond: [{ $eq: ['$data.status', 'success'] }, 1, 0] },
          },
          uniqueUsers: { $addToSet: '$userId' },
          durations: { $push: '$data.durationMs' },
        },
      },
    ]);

    if (!result) {
      return { totalEvents: 0, totalUsers: 0, successRate: 0, avgResponseTime: 0 };
    }

    const durations = (result.durations as number[]).filter((d) => typeof d === 'number');
    return {
      totalEvents: result.totalEvents,
      totalUsers: (result.uniqueUsers as string[]).filter((u) => u !== null).length,
      successRate: result.totalEvents > 0 ? result.successCount / result.totalEvents : 0,
      avgResponseTime: durations.length
        ? durations.reduce((s, d) => s + d, 0) / durations.length
        : 0,
    };
  }

  private buildFailedEventMatch(startTime: Date, endTime: Date, appName?: string) {
    const match: Record<string, unknown> = {
      timestamp: { $gte: startTime, $lt: endTime },
      'data.status': 'failed',
    };
    if (appName) match.appName = appName;
    return match;
  }

  private buildErrorAnalysisPipeline(match: Record<string, unknown>, limit: number) {
    return [
      { $match: match },
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
          errorCode: { $ifNull: ['$_id', 'UNKNOWN'] },
          count: 1,
          firstSeen: 1,
          lastSeen: 1,
          affectedUsers: { $size: '$affectedUsers' },
        },
      },
      { $sort: { count: -1 as const } },
      { $limit: limit },
    ];
  }

  private countTotalEvents(startTime: Date, endTime: Date, appName?: string) {
    return BiEvent.countDocuments({
      timestamp: { $gte: startTime, $lt: endTime },
      ...(appName ? { appName } : {}),
    });
  }

  private mapErrorItems(results: Array<Record<string, unknown>>, totalEvents: number): ErrorItem[] {
    return results.map((r) => ({
      errorCode: String(r.errorCode ?? 'UNKNOWN'),
      count: Number(r.count ?? 0),
      rate: totalEvents > 0 ? Number(r.count ?? 0) / totalEvents : 0,
      firstSeen: r.firstSeen as Date,
      lastSeen: r.lastSeen as Date,
      affectedUsers: Number(r.affectedUsers ?? 0),
    }));
  }

  private buildCostMatch(startTime: Date, endTime: Date, appName?: string) {
    const match: Record<string, unknown> = {
      eventType: 'qwen_analyze',
      timestamp: { $gte: startTime, $lt: endTime },
      'data.status': 'success',
    };
    if (appName) match.appName = appName;
    return match;
  }

  private buildCostGroupId(groupBy: 'hour' | 'day' | 'model') {
    if (groupBy === 'hour') {
      return { $dateToString: { format: '%Y-%m-%dT%H:00:00Z', date: '$timestamp' } };
    }
    if (groupBy === 'day') {
      return { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } };
    }
    return { $ifNull: ['$data.model', 'unknown'] };
  }

  private buildCostPipeline(
    match: Record<string, unknown>,
    groupBy: 'hour' | 'day' | 'model',
    groupId: Record<string, unknown>,
  ) {
    return [
      { $match: match },
      {
        $group: {
          _id: groupId,
          tokens: { $sum: { $ifNull: ['$data.totalTokens', 0] } },
          cost: { $sum: { $ifNull: ['$data.cost', 0] } },
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
          avgTokensPerRequest: {
            $cond: [{ $gt: ['$requests', 0] }, { $divide: ['$tokens', '$requests'] }, 0],
          },
        },
      },
      { $sort: { cost: -1 as const } },
    ];
  }

  private buildCostBreakdown(results: Array<Record<string, unknown>>): CostBreakdown {
    const totalCost = results.reduce((s, r) => s + Number(r.cost ?? 0), 0);
    const totalTokens = results.reduce((s, r) => s + Number(r.tokens ?? 0), 0);
    const totalRequests = results.reduce((s, r) => s + Number(r.requests ?? 0), 0);
    return {
      totalCost,
      totalTokens,
      totalRequests,
      breakdown: results.map((r) => ({
        period: r.period as string | undefined,
        model: r.model as string | undefined,
        tokens: Number(r.tokens ?? 0),
        cost: Number(r.cost ?? 0),
        requests: Number(r.requests ?? 0),
        avgTokensPerRequest: Number(r.avgTokensPerRequest ?? 0),
      })),
    };
  }

  private parseTimeRange(timeRange: string): { startTime: Date; endTime: Date } {
    const endTime = new Date();
    const startTime = new Date();
    const match = timeRange.match(/^(\d+)([hdwm])$/);
    if (!match) {
      startTime.setDate(startTime.getDate() - 7);
      return { startTime, endTime };
    }
    const [, value, unit] = match;
    const num = parseInt(value, 10);
    switch (unit) {
      case 'h': startTime.setHours(startTime.getHours() - num); break;
      case 'd': startTime.setDate(startTime.getDate() - num); break;
      case 'w': startTime.setDate(startTime.getDate() - num * 7); break;
      case 'm': startTime.setMonth(startTime.getMonth() - num); break;
    }
    return { startTime, endTime };
  }

  private calculateCostTrend(breakdown: Array<{ cost: number }>): 'up' | 'down' | 'stable' {
    if (breakdown.length < 2) return 'stable';
    const recent = breakdown.slice(-3).reduce((s, b) => s + b.cost, 0) / Math.min(3, breakdown.slice(-3).length);
    const older = breakdown.slice(-6, -3).reduce((s, b) => s + b.cost, 0) / Math.min(3, breakdown.slice(-6, -3).length);
    if (older === 0) return 'stable';
    const change = (recent - older) / older;
    if (change > 0.1) return 'up';
    if (change < -0.1) return 'down';
    return 'stable';
  }
}
