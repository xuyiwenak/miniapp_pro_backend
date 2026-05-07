import { CronJob } from 'cron';
import { BiAggregator } from '../component/BiAggregator';
import { gameLogger } from '../util/logger';

/**
 * BI 聚合定时任务调度
 * 实现 OpenSpec: bi-aggregation-api
 */
export class BiAggregationJob {
  private hourlyJob: CronJob;
  private dailyJob: CronJob;
  private aggregator: BiAggregator;
  private consecutiveFailures = 0;
  private readonly FAILURE_ALERT_THRESHOLD = 5;

  constructor(aggregator: BiAggregator) {
    this.aggregator = aggregator;

    // 每 5 分钟聚合上一个完整小时
    this.hourlyJob = new CronJob(
      '*/5 * * * *',
      () => { void this.runHourlyAggregation(); },
      null,
      false,
      'Asia/Shanghai',
    );

    // 每天凌晨 1:00 聚合昨天
    this.dailyJob = new CronJob(
      '0 1 * * *',
      () => { void this.runDailyAggregation(); },
      null,
      false,
      'Asia/Shanghai',
    );
  }

  start(): void {
    this.hourlyJob.start();
    this.dailyJob.start();
    gameLogger.info('BiAggregationJob started');
  }

  stop(): void {
    this.hourlyJob.stop();
    this.dailyJob.stop();
    gameLogger.info('BiAggregationJob stopped');
  }

  private async runHourlyAggregation(): Promise<void> {
    try {
      const now = new Date();
      const periodEnd = new Date(
        now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0,
      );
      const periodStart = new Date(periodEnd.getTime() - 60 * 60 * 1000); // 1 小时前

      gameLogger.debug('Running hourly aggregation', { periodStart, periodEnd });
      await this.aggregator.aggregateHourly(periodStart, periodEnd);
      this.consecutiveFailures = 0;
    } catch (error) {
      this.consecutiveFailures++;
      gameLogger.error('Hourly aggregation failed', {
        error: error instanceof Error ? error.message : String(error),
        consecutiveFailures: this.consecutiveFailures,
      });
      if (this.consecutiveFailures >= this.FAILURE_ALERT_THRESHOLD) {
        gameLogger.error('BiAggregationJob ALERT: hourly aggregation failed 5 consecutive times');
      }
    }
  }

  private async runDailyAggregation(): Promise<void> {
    try {
      const now = new Date();
      const periodEnd = new Date(
        now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0,
      );
      const periodStart = new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000); // 昨天

      gameLogger.debug('Running daily aggregation', { periodStart, periodEnd });
      await this.aggregator.aggregateDaily(periodStart, periodEnd);
      this.consecutiveFailures = 0;
    } catch (error) {
      this.consecutiveFailures++;
      gameLogger.error('Daily aggregation failed', {
        error: error instanceof Error ? error.message : String(error),
        consecutiveFailures: this.consecutiveFailures,
      });
    }
  }
}
