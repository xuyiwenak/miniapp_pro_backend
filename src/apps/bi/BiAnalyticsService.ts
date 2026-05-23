import { getBiModelManager } from '../../dbservice/model/BiDBModel';

interface CostBreakdownItem {
  period?: string;
  model?: string;
  tokens: number;
  cost: number;
  requests: number;
  avgTokensPerRequest?: number;
}

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
    breakdown: CostBreakdownItem[];
  };
  topErrors: Array<{ errorCode: string; count: number; rate: number }>;
  recentActivity: Array<{ timestamp: string; totalEvents: number }>;
}

export class BiAnalyticsService {
  private get biEvent() { return getBiModelManager().getBiEventModel(); }
  private get biHourly() { return getBiModelManager().getBiMetricsHourlyModel(); }
  private get biDaily() { return getBiModelManager().getBiMetricsDailyModel(); }

  async queryTrends(
    startTime: Date,
    endTime: Date,
    granularity: 'hourly' | 'daily',
    _metrics?: string[],
    appName?: string,
    eventType?: string,
  ) {
    const col = granularity === 'hourly' ? this.biHourly : this.biDaily;
    const q: Record<string, unknown> = { periodStart: { $gte: startTime, $lt: endTime } };
    if (appName) q.appName = appName;
    if (eventType) q.eventType = eventType;
    const results = await col.find(q).sort({ periodStart: 1 }).lean();
    return results.map((r) => ({
      timestamp: r.periodStart.toISOString(),
      totalEvents: r.totalEvents,
      successRate: r.totalEvents ? r.successCount / r.totalEvents : 0,
      avgDurationMs: r.avgDurationMs,
      appName: r.appName,
      eventType: r.eventType,
    }));
  }

  async queryErrorAnalysis(startTime: Date, endTime: Date, appName?: string, limit = 20) {
    const match = buildFailedEventMatch(startTime, endTime, appName);
    const results = await this.biEvent.aggregate(buildErrorAnalysisPipeline(match, limit));
    const total = await this.biEvent.countDocuments({
      timestamp: { $gte: startTime, $lt: endTime },
      ...(appName ? { appName } : {}),
    });
    return mapErrorAnalysisResults(results, total);
  }

  async queryCostAnalysis(
    startTime: Date,
    endTime: Date,
    appName?: string,
    groupBy: 'hour' | 'day' | 'model' = 'day',
  ) {
    const match: Record<string, unknown> = {
      eventType: 'qwen_analyze',
      timestamp: { $gte: startTime, $lt: endTime },
      'data.status': 'success',
    };
    if (appName) match.appName = appName;
    const groupId = buildCostGroupId(groupBy);
    const results = await this.biEvent.aggregate(buildCostAnalysisPipeline(match, groupId, groupBy));
    return summarizeCostBreakdown(results);
  }

  async queryPerformanceAnalysis(
    startTime: Date,
    endTime: Date,
    appName?: string,
    eventType?: string,
  ) {
    const q: Record<string, unknown> = { timestamp: { $gte: startTime, $lt: endTime } };
    if (appName) q.appName = appName;
    if (eventType) q.eventType = eventType;
    const events = await this.biEvent.find(q, { 'data.durationMs': 1 }).lean();
    const durations = events
      .map((e) => (e.data as Record<string, unknown>).durationMs as number | undefined)
      .filter((value): value is number => typeof value === 'number')
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
    const pct = (arr: number[], p: number) => {
      const i = Math.ceil(p / 100 * arr.length) - 1;
      return arr[Math.max(0, i)];
    };
    const avg = durations.reduce((s, x) => s + x, 0) / durations.length;
    return {
      totalEvents: durations.length,
      avgDurationMs: avg,
      p50DurationMs: pct(durations, 50),
      p95DurationMs: pct(durations, 95),
      p99DurationMs: pct(durations, 99),
      maxDurationMs: durations[durations.length - 1],
    };
  }

  async getDashboardSummary(timeRange: string, appName?: string): Promise<DashboardSummary> {
    const { startTime, endTime } = parseTime(timeRange);
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
        trend: trend(costs.breakdown),
        breakdown: costs.breakdown,
      },
      topErrors: errors.slice(0, 5),
      recentActivity: activity.slice(-7).map((a) => ({
        timestamp: a.timestamp,
        totalEvents: a.totalEvents,
      })),
    };
  }

  async queryFunnelBiEvents(startTime: Date, endTime: Date, appName: string) {
    const base: Record<string, unknown> = { timestamp: { $gte: startTime, $lt: endTime }, appName };
    const [uploadedUsers, analyzedUsers] = await Promise.all([
      this.biEvent.distinct('userId', { ...base, eventType: 'upload_file', 'data.status': 'success' }),
      this.biEvent.distinct('userId', { ...base, eventType: 'qwen_analyze', 'data.status': 'success' }),
    ]);
    return {
      uploaded: (uploadedUsers as unknown[]).filter((u) => u).length,
      analyzed: (analyzedUsers as unknown[]).filter((u) => u).length,
    };
  }

  async queryUploadStats(startTime: Date, endTime: Date, appName?: string) {
    const match: Record<string, unknown> = {
      eventType: 'upload_file',
      timestamp: { $gte: startTime, $lt: endTime },
      'data.status': 'success',
    };
    if (appName) match.appName = appName;
    const results = await this.biEvent.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $ifNull: ['$data.contentType', 'unknown'] },
          count: { $sum: 1 },
          totalBytes: { $sum: { $ifNull: ['$data.bytes', 0] } },
        },
      },
      { $sort: { count: -1 as const } },
    ]);
    const totalUploads = results.reduce((s, r) => s + (r.count as number), 0);
    const totalBytes = results.reduce((s, r) => s + (r.totalBytes as number), 0);
    return {
      totalUploads,
      totalBytes,
      avgBytes: totalUploads ? Math.round(totalBytes / totalUploads) : 0,
      contentTypes: results.map((r) => ({
        type: r._id as string,
        count: r.count as number,
        bytes: r.totalBytes as number,
      })),
    };
  }

  async queryMetrics(
    startTime: Date,
    endTime: Date,
    granularity: 'hourly' | 'daily',
    appName?: string,
    eventType?: string,
  ) {
    const col = granularity === 'hourly' ? this.biHourly : this.biDaily;
    const q: Record<string, unknown> = { periodStart: { $gte: startTime, $lt: endTime } };
    if (appName) q.appName = appName;
    if (eventType) q.eventType = eventType;
    return col.find(q).sort({ periodStart: 1 }).lean();
  }

  private async getOverviewStats(startTime: Date, endTime: Date, appName?: string) {
    const match: Record<string, unknown> = { timestamp: { $gte: startTime, $lt: endTime } };
    if (appName) match.appName = appName;
    const [r] = await this.biEvent.aggregate([
      { $match: match },
      {
        $group: {
          _id: null as unknown,
          totalEvents: { $sum: 1 },
          successCount: { $sum: { $cond: [{ $eq: ['$data.status', 'success'] }, 1, 0] } },
          uniqueUsers: { $addToSet: '$userId' },
          durations: { $push: '$data.durationMs' },
        },
      },
    ]);
    if (!r) {
      return { totalEvents: 0, totalUsers: 0, successRate: 0, avgResponseTime: 0 };
    }
    const durations = (r.durations as number[]).filter((x) => typeof x === 'number');
    const uniqueUsers = (r.uniqueUsers as string[]).filter((u) => u).length;
    const successRate = r.totalEvents ? r.successCount / r.totalEvents : 0;
    const avgResponseTime = durations.length
      ? durations.reduce((s, x) => s + x, 0) / durations.length
      : 0;
    return {
      totalEvents: r.totalEvents,
      totalUsers: uniqueUsers,
      successRate,
      avgResponseTime,
    };
  }
}

function buildFailedEventMatch(startTime: Date, endTime: Date, appName?: string) {
  const match: Record<string, unknown> = {
    timestamp: { $gte: startTime, $lt: endTime },
    'data.status': 'failed',
  };
  if (appName) match.appName = appName;
  return match;
}

function buildErrorAnalysisPipeline(match: Record<string, unknown>, limit: number) {
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

function mapErrorAnalysisResults(
  results: Array<Record<string, unknown>>,
  total: number,
) {
  return results.map((r) => ({
    errorCode: r.errorCode as string,
    count: r.count as number,
    rate: total ? (r.count as number) / total : 0,
    firstSeen: r.firstSeen,
    lastSeen: r.lastSeen,
    affectedUsers: r.affectedUsers,
  }));
}

function buildCostGroupId(groupBy: 'hour' | 'day' | 'model'): Record<string, unknown> {
  if (groupBy === 'hour') {
    return { $dateToString: { format: '%Y-%m-%dT%H:00:00Z', date: '$timestamp' } };
  }
  if (groupBy === 'day') {
    return { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } };
  }
  return { $ifNull: ['$data.model', 'unknown'] };
}

function buildCostAnalysisPipeline(
  match: Record<string, unknown>,
  groupId: Record<string, unknown>,
  groupBy: 'hour' | 'day' | 'model',
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

function summarizeCostBreakdown(results: Array<Record<string, unknown>>) {
  const totalCost = results.reduce((s, r) => s + ((r.cost as number) ?? 0), 0);
  const totalTokens = results.reduce((s, r) => s + ((r.tokens as number) ?? 0), 0);
  const totalRequests = results.reduce((s, r) => s + ((r.requests as number) ?? 0), 0);
  return {
    totalCost,
    totalTokens,
    totalRequests,
    breakdown: results.map((r) => ({
      period: r.period as string | undefined,
      model: r.model as string | undefined,
      tokens: (r.tokens as number) ?? 0,
      cost: (r.cost as number) ?? 0,
      requests: (r.requests as number) ?? 0,
      avgTokensPerRequest: (r.avgTokensPerRequest as number) ?? 0,
    })),
  };
}

function parseTime(tr: string): { startTime: Date; endTime: Date } {
  const end = new Date();
  const start = new Date();
  const m = tr.match(/^(\d+)([hdwm])$/);
  if (!m) {
    start.setDate(start.getDate() - 7);
    return { startTime: start, endTime: end };
  }
  const [, v, u] = m;
  const n = parseInt(v, 10);
  if (u === 'h') start.setHours(start.getHours() - n);
  else if (u === 'd') start.setDate(start.getDate() - n);
  else if (u === 'w') start.setDate(start.getDate() - n * 7);
  else if (u === 'm') start.setMonth(start.getMonth() - n);
  return { startTime: start, endTime: end };
}

function trend(bd: Array<{ cost: number }>): 'up' | 'down' | 'stable' {
  if (bd.length < 2) return 'stable';
  const recentSlice = bd.slice(-3);
  const olderSlice = bd.slice(-6, -3);
  const recent = recentSlice.reduce((s, b) => s + b.cost, 0) / Math.min(3, recentSlice.length);
  const older = olderSlice.reduce((s, b) => s + b.cost, 0) / Math.min(3, olderSlice.length);
  if (!older) return 'stable';
  const change = (recent - older) / older;
  if (change > 0.1) return 'up';
  if (change < -0.1) return 'down';
  return 'stable';
}
