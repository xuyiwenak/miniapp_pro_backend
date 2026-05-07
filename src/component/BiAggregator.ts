import {
  BiEvent,
  AppName,
  EventType,
} from '../entity/biEvent.entity';
import {
  BiMetricsHourly,
  BiMetricsDaily,
  IBiMetricsHourly,
} from '../entity/biMetrics.entity';
import { IBaseComponent } from '../common/BaseComponent';
import { gameLogger } from '../util/logger';

/**
 * BI 聚合引擎
 * 实现 OpenSpec: bi-aggregation-api
 * 从 bi_events 聚合到 bi_metrics_hourly，再从 bi_metrics_hourly 汇总到 bi_metrics_daily
 */
export class BiAggregator implements IBaseComponent {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  init(_option: any) {
    gameLogger.info('BiAggregator initialized');
  }

  async start() {
    gameLogger.info('BiAggregator started');
  }

  async afterStart() {
    // 不依赖其他组件
  }

  async stop() {
    gameLogger.info('BiAggregator stopped');
  }

  /**
   * 小时聚合：聚合指定小时窗口内的所有 (appName, eventType) 组合
   */
  async aggregateHourly(periodStart: Date, periodEnd: Date): Promise<void> {
    const combinations = await this.getCombinations(periodStart, periodEnd);

    for (const { appName, eventType } of combinations) {
      // client_event 不参与聚合（高基数低分析价值）
      if (eventType === 'client_event') continue;

      await this.aggregateHourlyForType(
        appName as AppName,
        eventType as EventType,
        periodStart,
        periodEnd,
      );
    }

    gameLogger.debug('Hourly aggregation completed', {
      periodStart,
      periodEnd,
      combinations: combinations.length,
    });
  }

  /**
   * 日聚合：从小时表汇总指定日期的数据
   */
  async aggregateDaily(periodStart: Date, periodEnd: Date): Promise<void> {
    const combinations = await BiMetricsHourly.distinct('appName', {
      periodStart: { $gte: periodStart, $lt: periodEnd },
    }).then(async (appNames) => {
      const eventTypes = await BiMetricsHourly.distinct('eventType', {
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

    gameLogger.debug('Daily aggregation completed', {
      periodStart,
      periodEnd,
      combinations: combinations.length,
    });
  }

  /**
   * 获取时间段内的所有 (appName, eventType) 列表
   */
  private async getCombinations(
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Array<{ appName: string; eventType: string }>> {
    const appNames = await BiEvent.distinct('appName', {
      timestamp: { $gte: periodStart, $lt: periodEnd },
    });
    const eventTypes = await BiEvent.distinct('eventType', {
      timestamp: { $gte: periodStart, $lt: periodEnd },
    });
    return appNames.flatMap((appName) =>
      eventTypes.map((eventType) => ({ appName, eventType })),
    );
  }

  /**
   * 单类型小时聚合
   */
  private async aggregateHourlyForType(
    appName: AppName,
    eventType: EventType,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<void> {
    const results = await BiEvent.aggregate(
      this.buildHourlyAggregatePipeline(appName, eventType, periodStart, periodEnd),
    );
    if (!results.length || results[0].totalEvents === 0) {
      return;
    }
    const result = results[0];
    const metrics = this.buildHourlyBaseMetrics(result, appName, eventType, periodStart, periodEnd);
    this.fillHourlySubMetrics(metrics, result, eventType);

    await BiMetricsHourly.updateOne(
      { appName, eventType, periodStart },
      { $set: metrics },
      { upsert: true },
    );
  }

  /**
   * 单类型日聚合——从小时表汇总
   */
  private async aggregateDailyForType(
    appName: AppName,
    eventType: EventType,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<void> {
    const hourlyMetrics = await this.loadHourlyMetrics(appName, eventType, periodStart, periodEnd);
    if (!hourlyMetrics.length) return;
    const dailyMetrics = this.buildDailyBaseMetrics(hourlyMetrics, appName, eventType, periodStart, periodEnd);
    this.fillDailySubMetrics(dailyMetrics, hourlyMetrics, eventType);

    await BiMetricsDaily.updateOne(
      { appName, eventType, periodStart },
      { $set: dailyMetrics },
      { upsert: true },
    );
  }

  // ── 辅助方法 ──

  private buildHourlyAggregatePipeline(
    appName: AppName,
    eventType: EventType,
    periodStart: Date,
    periodEnd: Date,
  ) {
    return [
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
          uploadContentTypes: {
            $push: { $cond: [{ $eq: ['$eventType', 'upload_file'] }, '$data.contentType', '$$REMOVE'] },
          },
          qwenTokens: { $push: { $cond: [{ $eq: ['$eventType', 'qwen_analyze'] }, '$data.totalTokens', '$$REMOVE'] } },
          qwenCosts: { $push: { $cond: [{ $eq: ['$eventType', 'qwen_analyze'] }, '$data.cost', '$$REMOVE'] } },
          qwenModels: { $push: { $cond: [{ $eq: ['$eventType', 'qwen_analyze'] }, '$data.model', '$$REMOVE'] } },
          apiEndpoints: { $push: { $cond: [{ $eq: ['$eventType', 'api_request'] }, '$data.endpoint', '$$REMOVE'] } },
          apiStatusCodes: {
            $push: { $cond: [{ $eq: ['$eventType', 'api_request'] }, { $toString: '$data.statusCode' }, '$$REMOVE'] },
          },
          apiRequestBytes: {
            $push: { $cond: [{ $eq: ['$eventType', 'api_request'] }, '$data.requestSize', '$$REMOVE'] },
          },
          apiResponseBytes: {
            $push: { $cond: [{ $eq: ['$eventType', 'api_request'] }, '$data.responseSize', '$$REMOVE'] },
          },
        },
      },
    ];
  }

  private buildHourlyBaseMetrics(
    result: Record<string, unknown>,
    appName: AppName,
    eventType: EventType,
    periodStart: Date,
    periodEnd: Date,
  ): Partial<IBiMetricsHourly> {
    const sortedDurations = (result.durations as number[]).filter((d) => typeof d === 'number').sort((a, b) => a - b);
    return {
      periodStart,
      periodEnd,
      appName,
      eventType,
      totalEvents: Number(result.totalEvents ?? 0),
      successCount: Number(result.successCount ?? 0),
      failedCount: Number(result.failedCount ?? 0),
      uniqueUsers: (result.uniqueUsers as string[]).length,
      uniqueSessions: (result.uniqueSessions as string[]).length,
      avgDurationMs: sortedDurations.length > 0
        ? sortedDurations.reduce((s, d) => s + d, 0) / sortedDurations.length
        : 0,
      p50DurationMs: this.percentile(sortedDurations, 50),
      p95DurationMs: this.percentile(sortedDurations, 95),
      p99DurationMs: this.percentile(sortedDurations, 99),
      maxDurationMs: sortedDurations.length > 0 ? sortedDurations[sortedDurations.length - 1] : 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private fillHourlySubMetrics(
    metrics: Partial<IBiMetricsHourly>,
    result: Record<string, unknown>,
    eventType: EventType,
  ): void {
    if (eventType === 'upload_file') {
      const bytes = (result.uploadBytes as number[]).filter((b) => typeof b === 'number');
      metrics.upload = {
        totalBytes: bytes.reduce((s, b) => s + b, 0),
        avgBytes: bytes.length > 0 ? bytes.reduce((s, b) => s + b, 0) / bytes.length : 0,
        totalImages: bytes.length,
        contentTypes: this.countOccurrences(result.uploadContentTypes as string[]),
      };
      return;
    }
    if (eventType === 'qwen_analyze') {
      const tokens = (result.qwenTokens as number[]).filter((t) => typeof t === 'number');
      const costs = (result.qwenCosts as number[]).filter((c) => typeof c === 'number');
      metrics.qwen = {
        totalTokens: tokens.reduce((s, t) => s + t, 0),
        totalCost: costs.reduce((s, c) => s + c, 0),
        avgTokensPerRequest: tokens.length > 0 ? tokens.reduce((s, t) => s + t, 0) / tokens.length : 0,
        models: this.countOccurrences(result.qwenModels as string[]),
      };
      return;
    }
    if (eventType === 'api_request') {
      const reqBytes = (result.apiRequestBytes as number[]).filter((b) => typeof b === 'number');
      const resBytes = (result.apiResponseBytes as number[]).filter((b) => typeof b === 'number');
      metrics.api = {
        endpoints: this.countOccurrences(result.apiEndpoints as string[]),
        statusCodes: this.countOccurrences(result.apiStatusCodes as string[]),
        totalRequestBytes: reqBytes.reduce((s, b) => s + b, 0),
        totalResponseBytes: resBytes.reduce((s, b) => s + b, 0),
      };
    }
  }

  private loadHourlyMetrics(appName: AppName, eventType: EventType, periodStart: Date, periodEnd: Date) {
    return BiMetricsHourly.find({
      appName,
      eventType,
      periodStart: { $gte: periodStart, $lt: periodEnd },
    }).lean();
  }

  private buildDailyBaseMetrics(
    hourlyMetrics: IBiMetricsHourly[],
    appName: AppName,
    eventType: EventType,
    periodStart: Date,
    periodEnd: Date,
  ): Partial<IBiMetricsHourly> {
    const totalEvents = hourlyMetrics.reduce((s, m) => s + m.totalEvents, 0);
    const weightedAvgDuration = totalEvents > 0
      ? hourlyMetrics.reduce((s, m) => s + m.avgDurationMs * m.totalEvents, 0) / totalEvents
      : 0;
    return {
      periodStart,
      periodEnd,
      appName,
      eventType,
      totalEvents,
      successCount: hourlyMetrics.reduce((s, m) => s + m.successCount, 0),
      failedCount: hourlyMetrics.reduce((s, m) => s + m.failedCount, 0),
      uniqueUsers: hourlyMetrics.reduce((s, m) => s + m.uniqueUsers, 0),
      uniqueSessions: hourlyMetrics.reduce((s, m) => s + m.uniqueSessions, 0),
      avgDurationMs: weightedAvgDuration,
      p50DurationMs: Math.max(...hourlyMetrics.map((m) => m.p50DurationMs), 0),
      p95DurationMs: Math.max(...hourlyMetrics.map((m) => m.p95DurationMs), 0),
      p99DurationMs: Math.max(...hourlyMetrics.map((m) => m.p99DurationMs), 0),
      maxDurationMs: Math.max(...hourlyMetrics.map((m) => m.maxDurationMs), 0),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private fillDailySubMetrics(
    dailyMetrics: Partial<IBiMetricsHourly>,
    hourlyMetrics: IBiMetricsHourly[],
    eventType: EventType,
  ): void {
    if (eventType === 'upload_file') {
      dailyMetrics.upload = {
        totalBytes: hourlyMetrics.reduce((s, m) => s + (m.upload?.totalBytes ?? 0), 0),
        avgBytes: 0,
        totalImages: hourlyMetrics.reduce((s, m) => s + (m.upload?.totalImages ?? 0), 0),
        contentTypes: this.mergeMaps(hourlyMetrics.map((m) => m.upload?.contentTypes ?? {})),
      };
      dailyMetrics.upload.avgBytes = dailyMetrics.upload.totalImages > 0
        ? dailyMetrics.upload.totalBytes / dailyMetrics.upload.totalImages
        : 0;
      return;
    }
    if (eventType === 'qwen_analyze') {
      const totalEvents = Number(dailyMetrics.totalEvents ?? 0);
      const totalTokens = hourlyMetrics.reduce((s, m) => s + (m.qwen?.totalTokens ?? 0), 0);
      dailyMetrics.qwen = {
        totalTokens,
        totalCost: hourlyMetrics.reduce((s, m) => s + (m.qwen?.totalCost ?? 0), 0),
        avgTokensPerRequest: totalEvents > 0 ? totalTokens / totalEvents : 0,
        models: this.mergeMaps(hourlyMetrics.map((m) => m.qwen?.models ?? {})),
      };
      return;
    }
    if (eventType === 'api_request') {
      dailyMetrics.api = {
        endpoints: this.mergeMaps(hourlyMetrics.map((m) => m.api?.endpoints ?? {})),
        statusCodes: this.mergeMaps(hourlyMetrics.map((m) => m.api?.statusCodes ?? {})),
        totalRequestBytes: hourlyMetrics.reduce((s, m) => s + (m.api?.totalRequestBytes ?? 0), 0),
        totalResponseBytes: hourlyMetrics.reduce((s, m) => s + (m.api?.totalResponseBytes ?? 0), 0),
      };
    }
  }

  private percentile(sorted: number[], p: number): number {
    if (!sorted.length) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  private countOccurrences(arr: string[]): Record<string, number> {
    return arr.reduce((acc, val) => {
      if (val !== null) acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private mergeMaps(maps: Array<Record<string, number>>): Record<string, number> {
    return maps.reduce((acc, m) => {
      for (const [key, count] of Object.entries(m)) {
        acc[key] = (acc[key] || 0) + count;
      }
      return acc;
    }, {} as Record<string, number>);
  }
}
