import type { AppName, EventType } from '../entity/biEvent.entity';
import type { IBiMetricsHourly } from '../entity/biMetrics.entity';
import { getBiModelManager } from '../dbservice/model/BiDBModel';
import { IBaseComponent } from '../common/BaseComponent';
import { gameLogger } from '../util/logger';

/**
 * BI 聚合引擎
 * 实现 OpenSpec: bi-aggregation-api
 * 从 bi_events 聚合到 bi_metrics_hourly，再从 bi_metrics_hourly 汇总到 bi_metrics_daily
 */
export class BiAggregator implements IBaseComponent {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  init(_option: any) { gameLogger.info('BiAggregator initialized'); }
  async start() { gameLogger.info('BiAggregator started'); }
  async afterStart() {}
  async stop() { gameLogger.info('BiAggregator stopped'); }

  private get biEvent() { return getBiModelManager().getBiEventModel(); }
  private get biHourly() { return getBiModelManager().getBiMetricsHourlyModel(); }
  private get biDaily() { return getBiModelManager().getBiMetricsDailyModel(); }

  async aggregateHourly(periodStart: Date, periodEnd: Date): Promise<void> {
    const combos = await this.getCombinations(periodStart, periodEnd);
    for (const { appName, eventType } of combos) {
      if (eventType === 'client_event') continue;
      await this.aggregateHourlyForType(appName as AppName, eventType as EventType, periodStart, periodEnd);
    }
    gameLogger.debug('Hourly aggregation completed', { periodStart, periodEnd, combos: combos.length });
  }

  async aggregateDaily(periodStart: Date, periodEnd: Date): Promise<void> {
    const appNames = await this.biHourly.distinct('appName', { periodStart: { $gte: periodStart, $lt: periodEnd } });
    const eventTypes = await this.biHourly.distinct('eventType', { periodStart: { $gte: periodStart, $lt: periodEnd } });
    for (const appName of appNames) {
      for (const eventType of eventTypes) {
        await this.aggregateDailyForType(appName as AppName, eventType as EventType, periodStart, periodEnd);
      }
    }
    gameLogger.debug('Daily aggregation completed', { periodStart, periodEnd });
  }

  private async getCombinations(periodStart: Date, periodEnd: Date) {
    const appNames = await this.biEvent.distinct('appName', { timestamp: { $gte: periodStart, $lt: periodEnd } });
    const eventTypes = await this.biEvent.distinct('eventType', { timestamp: { $gte: periodStart, $lt: periodEnd } });
    return appNames.flatMap(appName => eventTypes.map(eventType => ({ appName, eventType })));
  }

  private async aggregateHourlyForType(appName: AppName, eventType: EventType, periodStart: Date, periodEnd: Date) {
    const results = await this.biEvent.aggregate<Record<string, unknown>>([
      { $match: { appName, eventType, timestamp: { $gte: periodStart, $lt: periodEnd } } },
      {
        $group: {
          _id: null as unknown,
          totalEvents: { $sum: 1 },
          successCount: { $sum: { $cond: [{ $eq: ['$data.status', 'success'] }, 1, 0] } },
          failedCount: { $sum: { $cond: [{ $eq: ['$data.status', 'failed'] }, 1, 0] } },
          uniqueUsers: { $addToSet: '$userId' },
          uniqueSessions: { $addToSet: '$sessionId' },
          durations: { $push: '$data.durationMs' },
          uploadBytes: { $push: { $cond: [{ $eq: ['$eventType', 'upload_file'] }, '$data.bytes', '$$REMOVE'] } },
          uploadContentTypes: { $push: { $cond: [{ $eq: ['$eventType', 'upload_file'] }, '$data.contentType', '$$REMOVE'] } },
          qwenTokens: { $push: { $cond: [{ $eq: ['$eventType', 'qwen_analyze'] }, '$data.totalTokens', '$$REMOVE'] } },
          qwenCosts: { $push: { $cond: [{ $eq: ['$eventType', 'qwen_analyze'] }, '$data.cost', '$$REMOVE'] } },
          qwenModels: { $push: { $cond: [{ $eq: ['$eventType', 'qwen_analyze'] }, '$data.model', '$$REMOVE'] } },
          apiEndpoints: { $push: { $cond: [{ $eq: ['$eventType', 'api_request'] }, '$data.endpoint', '$$REMOVE'] } },
          apiStatusCodes: { $push: { $cond: [{ $eq: ['$eventType', 'api_request'] }, { $toString: '$data.statusCode' }, '$$REMOVE'] } },
          apiRequestBytes: { $push: { $cond: [{ $eq: ['$eventType', 'api_request'] }, '$data.requestSize', '$$REMOVE'] } },
          apiResponseBytes: { $push: { $cond: [{ $eq: ['$eventType', 'api_request'] }, '$data.responseSize', '$$REMOVE'] } },
        },
      },
    ]);
    if (!results.length || (results[0].totalEvents as number) === 0) return;

    const r = results[0];
    const durations = (r.durations as number[]).filter(d => typeof d === 'number').sort((a, b) => a - b);
    const metrics: Partial<IBiMetricsHourly> = {
      periodStart, periodEnd, appName, eventType,
      totalEvents: Number(r.totalEvents ?? 0),
      successCount: Number(r.successCount ?? 0),
      failedCount: Number(r.failedCount ?? 0),
      uniqueUsers: (r.uniqueUsers as string[]).length,
      uniqueSessions: (r.uniqueSessions as string[]).length,
      avgDurationMs: durations.length ? durations.reduce((s, d) => s + d, 0) / durations.length : 0,
      p50DurationMs: pct(durations, 50), p95DurationMs: pct(durations, 95),
      p99DurationMs: pct(durations, 99), maxDurationMs: durations.length ? durations[durations.length - 1] : 0,
      createdAt: new Date(), updatedAt: new Date(),
    };
    if (eventType === 'upload_file') metrics.upload = uploadSub(r);
    else if (eventType === 'qwen_analyze') metrics.qwen = qwenSub(r);
    else if (eventType === 'api_request') metrics.api = apiSub(r);

    await this.biHourly.updateOne({ appName, eventType, periodStart }, { $set: metrics }, { upsert: true });
  }

  private async aggregateDailyForType(appName: AppName, eventType: EventType, periodStart: Date, periodEnd: Date) {
    const hMetrics = await this.biHourly.find({ appName, eventType, periodStart: { $gte: periodStart, $lt: periodEnd } }).lean();
    if (!hMetrics.length) return;
    const totalEvents = hMetrics.reduce((s, m) => s + m.totalEvents, 0);
    const wAvg = totalEvents ? hMetrics.reduce((s, m) => s + m.avgDurationMs * m.totalEvents, 0) / totalEvents : 0;
    const daily: Partial<IBiMetricsHourly> = {
      periodStart, periodEnd, appName, eventType,
      totalEvents,
      successCount: hMetrics.reduce((s, m) => s + m.successCount, 0),
      failedCount: hMetrics.reduce((s, m) => s + m.failedCount, 0),
      uniqueUsers: hMetrics.reduce((s, m) => s + m.uniqueUsers, 0),
      uniqueSessions: hMetrics.reduce((s, m) => s + m.uniqueSessions, 0),
      avgDurationMs: wAvg, p50DurationMs: max(hMetrics.map(m => m.p50DurationMs)),
      p95DurationMs: max(hMetrics.map(m => m.p95DurationMs)), p99DurationMs: max(hMetrics.map(m => m.p99DurationMs)),
      maxDurationMs: max(hMetrics.map(m => m.maxDurationMs)), createdAt: new Date(), updatedAt: new Date(),
    };
    if (eventType === 'upload_file') daily.upload = mergeUpload(hMetrics);
    else if (eventType === 'qwen_analyze') daily.qwen = mergeQwen(hMetrics, totalEvents);
    else if (eventType === 'api_request') daily.api = mergeApi(hMetrics);
    await this.biDaily.updateOne({ appName, eventType, periodStart }, { $set: daily }, { upsert: true });
  }
}

// ── helpers ──

function pct(s: number[], p: number): number { if (!s.length) return 0; const i = Math.ceil(p / 100 * s.length) - 1; return s[Math.max(0, i)]; }
function max(arr: number[]): number { return arr.length ? Math.max(...arr) : 0; }

function uploadSub(r: Record<string, unknown>): NonNullable<IBiMetricsHourly['upload']> {
  const b = (r.uploadBytes as number[]).filter(x => typeof x === 'number');
  return { totalBytes: sum(b), avgBytes: b.length ? sum(b) / b.length : 0, totalImages: b.length, contentTypes: count(r.uploadContentTypes as string[]) };
}
function qwenSub(r: Record<string, unknown>): NonNullable<IBiMetricsHourly['qwen']> {
  const t = (r.qwenTokens as number[]).filter(x => typeof x === 'number');
  const c = (r.qwenCosts as number[]).filter(x => typeof x === 'number');
  return { totalTokens: sum(t), totalCost: sum(c), avgTokensPerRequest: t.length ? sum(t) / t.length : 0, models: count(r.qwenModels as string[]) };
}
function apiSub(r: Record<string, unknown>): NonNullable<IBiMetricsHourly['api']> {
  const rb = (r.apiRequestBytes as number[]).filter(x => typeof x === 'number');
  const rs = (r.apiResponseBytes as number[]).filter(x => typeof x === 'number');
  return { endpoints: count(r.apiEndpoints as string[]), statusCodes: count(r.apiStatusCodes as string[]), totalRequestBytes: sum(rb), totalResponseBytes: sum(rs) };
}

function sum(arr: number[]): number { return arr.reduce((s, x) => s + x, 0); }
function count(arr: string[]): Record<string, number> { return arr.reduce((acc, v) => { if (v != null) acc[v] = (acc[v] || 0) + 1; return acc; }, {} as Record<string, number>); }
function mergeMaps(maps: Array<Record<string, number>>): Record<string, number> { return maps.reduce((acc, m) => { for (const [k, c] of Object.entries(m)) acc[k] = (acc[k] || 0) + c; return acc; }, {} as Record<string, number>); }

function mergeUpload(hm: IBiMetricsHourly[]): NonNullable<IBiMetricsHourly['upload']> {
  const tb = hm.reduce((s, m) => s + (m.upload?.totalBytes ?? 0), 0);
  const ti = hm.reduce((s, m) => s + (m.upload?.totalImages ?? 0), 0);
  return { totalBytes: tb, avgBytes: ti ? tb / ti : 0, totalImages: ti, contentTypes: mergeMaps(hm.map(m => m.upload?.contentTypes ?? {})) };
}
function mergeQwen(hm: IBiMetricsHourly[], totalEvents: number): NonNullable<IBiMetricsHourly['qwen']> {
  const tt = hm.reduce((s, m) => s + (m.qwen?.totalTokens ?? 0), 0);
  return { totalTokens: tt, totalCost: hm.reduce((s, m) => s + (m.qwen?.totalCost ?? 0), 0), avgTokensPerRequest: totalEvents ? tt / totalEvents : 0, models: mergeMaps(hm.map(m => m.qwen?.models ?? {})) };
}
function mergeApi(hm: IBiMetricsHourly[]): NonNullable<IBiMetricsHourly['api']> {
  return { endpoints: mergeMaps(hm.map(m => m.api?.endpoints ?? {})), statusCodes: mergeMaps(hm.map(m => m.api?.statusCodes ?? {})), totalRequestBytes: hm.reduce((s, m) => s + (m.api?.totalRequestBytes ?? 0), 0), totalResponseBytes: hm.reduce((s, m) => s + (m.api?.totalResponseBytes ?? 0), 0) };
}
