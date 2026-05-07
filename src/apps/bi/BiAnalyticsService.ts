import { getBiModelManager } from '../../dbservice/model/BiDBModel';

export interface DashboardSummary {
  overview: { totalEvents: number; totalUsers: number; successRate: number; avgResponseTime: number };
  qwenCosts: { totalCost: number; totalTokens: number; trend: 'up' | 'down' | 'stable'; breakdown: Array<{ period?: string; model?: string; tokens: number; cost: number; requests: number; avgTokensPerRequest?: number }> };
  topErrors: Array<{ errorCode: string; count: number; rate: number }>;
  recentActivity: Array<{ timestamp: string; totalEvents: number }>;
}

export class BiAnalyticsService {
  private get biEvent() { return getBiModelManager().getBiEventModel(); }
  private get biHourly() { return getBiModelManager().getBiMetricsHourlyModel(); }
  private get biDaily() { return getBiModelManager().getBiMetricsDailyModel(); }

  async queryTrends(startTime: Date, endTime: Date, granularity: 'hourly' | 'daily', _metrics?: string[], appName?: string, eventType?: string) {
    const col = granularity === 'hourly' ? this.biHourly : this.biDaily;
    const q: Record<string, unknown> = { periodStart: { $gte: startTime, $lt: endTime } };
    if (appName) q.appName = appName;
    if (eventType) q.eventType = eventType;
    const results = await col.find(q).sort({ periodStart: 1 }).lean();
    return results.map(r => ({ timestamp: r.periodStart.toISOString(), totalEvents: r.totalEvents, successRate: r.totalEvents ? r.successCount / r.totalEvents : 0, avgDurationMs: r.avgDurationMs, appName: r.appName, eventType: r.eventType }));
  }

  async queryErrorAnalysis(startTime: Date, endTime: Date, appName?: string, limit = 20) {
    const match: Record<string, unknown> = { timestamp: { $gte: startTime, $lt: endTime }, 'data.status': 'failed' };
    if (appName) match.appName = appName;
    const results = await this.biEvent.aggregate([
      { $match: match },
      { $group: { _id: '$data.errorCode', count: { $sum: 1 }, firstSeen: { $min: '$timestamp' }, lastSeen: { $max: '$timestamp' }, affectedUsers: { $addToSet: '$userId' } } },
      { $project: { errorCode: { $ifNull: ['$_id', 'UNKNOWN'] }, count: 1, firstSeen: 1, lastSeen: 1, affectedUsers: { $size: '$affectedUsers' } } },
      { $sort: { count: -1 as const } }, { $limit: limit },
    ]);
    const total = await this.biEvent.countDocuments({ timestamp: { $gte: startTime, $lt: endTime }, ...(appName ? { appName } : {}) });
    return results.map(r => ({ errorCode: r.errorCode, count: r.count, rate: total ? r.count / total : 0, firstSeen: r.firstSeen, lastSeen: r.lastSeen, affectedUsers: r.affectedUsers }));
  }

  async queryCostAnalysis(startTime: Date, endTime: Date, appName?: string, groupBy: 'hour' | 'day' | 'model' = 'day') {
    const match: Record<string, unknown> = { eventType: 'qwen_analyze', timestamp: { $gte: startTime, $lt: endTime }, 'data.status': 'success' };
    if (appName) match.appName = appName;
    let groupId: Record<string, unknown>;
    if (groupBy === 'hour') groupId = { $dateToString: { format: '%Y-%m-%dT%H:00:00Z', date: '$timestamp' } };
    else if (groupBy === 'day') groupId = { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } };
    else groupId = { $ifNull: ['$data.model', 'unknown'] };

    const results = await this.biEvent.aggregate([
      { $match: match },
      { $group: { _id: groupId, tokens: { $sum: { $ifNull: ['$data.totalTokens', 0] } }, cost: { $sum: { $ifNull: ['$data.cost', 0] } }, requests: { $sum: 1 } } },
      { $project: { period: groupBy !== 'model' ? '$_id' : undefined, model: groupBy === 'model' ? '$_id' : undefined, tokens: 1, cost: 1, requests: 1, avgTokensPerRequest: { $cond: [{ $gt: ['$requests', 0] }, { $divide: ['$tokens', '$requests'] }, 0] } } },
      { $sort: { cost: -1 as const } },
    ]);
    const totalCost = results.reduce((s, r) => s + (r.cost ?? 0), 0);
    const totalTokens = results.reduce((s, r) => s + (r.tokens ?? 0), 0);
    const totalRequests = results.reduce((s, r) => s + (r.requests ?? 0), 0);
    return { totalCost, totalTokens, totalRequests, breakdown: results.map(r => ({ period: r.period, model: r.model, tokens: r.tokens ?? 0, cost: r.cost ?? 0, requests: r.requests ?? 0, avgTokensPerRequest: r.avgTokensPerRequest ?? 0 })) };
  }

  async queryPerformanceAnalysis(startTime: Date, endTime: Date, appName?: string, eventType?: string) {
    const q: Record<string, unknown> = { timestamp: { $gte: startTime, $lt: endTime } };
    if (appName) q.appName = appName;
    if (eventType) q.eventType = eventType;
    const events = await this.biEvent.find(q, { 'data.durationMs': 1 }).lean();
    const d = events.map(e => (e.data as Record<string, unknown>).durationMs as number | undefined).filter((d): d is number => typeof d === 'number').sort((a, b) => a - b);
    if (!d.length) return { totalEvents: 0, avgDurationMs: 0, p50DurationMs: 0, p95DurationMs: 0, p99DurationMs: 0, maxDurationMs: 0 };
    const pct = (arr: number[], p: number) => { const i = Math.ceil(p / 100 * arr.length) - 1; return arr[Math.max(0, i)]; };
    return { totalEvents: d.length, avgDurationMs: d.reduce((s, x) => s + x, 0) / d.length, p50DurationMs: pct(d, 50), p95DurationMs: pct(d, 95), p99DurationMs: pct(d, 99), maxDurationMs: d[d.length - 1] };
  }

  async getDashboardSummary(timeRange: string, appName?: string): Promise<DashboardSummary> {
    const { startTime, endTime } = parseTime(timeRange);
    const [overview, costs, errors, activity] = await Promise.all([
      this.getOverviewStats(startTime, endTime, appName),
      this.queryCostAnalysis(startTime, endTime, appName, 'day'),
      this.queryErrorAnalysis(startTime, endTime, appName, 5),
      this.queryTrends(startTime, endTime, 'daily', undefined, appName),
    ]);
    return { overview, qwenCosts: { totalCost: costs.totalCost, totalTokens: costs.totalTokens, trend: trend(costs.breakdown), breakdown: costs.breakdown }, topErrors: errors.slice(0, 5), recentActivity: activity.slice(-7).map(a => ({ timestamp: a.timestamp, totalEvents: a.totalEvents })) };
  }

  async queryMetrics(startTime: Date, endTime: Date, granularity: 'hourly' | 'daily', appName?: string, eventType?: string) {
    const col = granularity === 'hourly' ? this.biHourly : this.biDaily;
    const q: Record<string, unknown> = { periodStart: { $gte: startTime, $lt: endTime } };
    if (appName) q.appName = appName;
    if (eventType) q.eventType = eventType;
    return col.find(q).sort({ periodStart: 1 }).lean();
  }

  private async getOverviewStats(startTime: Date, endTime: Date, appName?: string) {
    const match: Record<string, unknown> = { timestamp: { $gte: startTime, $lt: endTime } };
    if (appName) match.appName = appName;
    const [r] = await this.biEvent.aggregate([{ $match: match }, { $group: { _id: null as unknown, totalEvents: { $sum: 1 }, successCount: { $sum: { $cond: [{ $eq: ['$data.status', 'success'] }, 1, 0] } }, uniqueUsers: { $addToSet: '$userId' }, durations: { $push: '$data.durationMs' } } }]);
    if (!r) return { totalEvents: 0, totalUsers: 0, successRate: 0, avgResponseTime: 0 };
    const d = (r.durations as number[]).filter(x => typeof x === 'number');
    return { totalEvents: r.totalEvents, totalUsers: (r.uniqueUsers as string[]).filter(u => u).length, successRate: r.totalEvents ? r.successCount / r.totalEvents : 0, avgResponseTime: d.length ? d.reduce((s, x) => s + x, 0) / d.length : 0 };
  }
}

function parseTime(tr: string): { startTime: Date; endTime: Date } {
  const end = new Date(); const start = new Date();
  const m = tr.match(/^(\d+)([hdwm])$/); if (!m) { start.setDate(start.getDate() - 7); return { startTime: start, endTime: end }; }
  const [, v, u] = m; const n = parseInt(v, 10);
  if (u === 'h') start.setHours(start.getHours() - n);
  else if (u === 'd') start.setDate(start.getDate() - n);
  else if (u === 'w') start.setDate(start.getDate() - n * 7);
  else if (u === 'm') start.setMonth(start.getMonth() - n);
  return { startTime: start, endTime: end };
}
function trend(bd: Array<{ cost: number }>): 'up' | 'down' | 'stable' {
  if (bd.length < 2) return 'stable';
  const recent = bd.slice(-3).reduce((s, b) => s + b.cost, 0) / Math.min(3, bd.slice(-3).length);
  const older = bd.slice(-6, -3).reduce((s, b) => s + b.cost, 0) / Math.min(3, bd.slice(-6, -3).length);
  if (!older) return 'stable'; const c = (recent - older) / older;
  return c > 0.1 ? 'up' : c < -0.1 ? 'down' : 'stable';
}
