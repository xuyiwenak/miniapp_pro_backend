import type { Connection, Model } from 'mongoose';
import { BiEventSchema, type IBiEvent } from '../../entity/biEvent.entity';
import { BiMetricsHourlySchema, BiMetricsDailySchema, type IBiMetricsHourly, type IBiMetricsDaily } from '../../entity/biMetrics.entity';

class BiModelManager {
  private biEventModel!: Model<IBiEvent>;
  private biMetricsHourlyModel!: Model<IBiMetricsHourly>;
  private biMetricsDailyModel!: Model<IBiMetricsDaily>;

  registerModels(connection: Connection): void {
    this.biEventModel = connection.model<IBiEvent>('BiEvent', BiEventSchema, 'bi_events');
    this.biEventModel.createIndexes().catch(() => {});
    this.biMetricsHourlyModel = connection.model<IBiMetricsHourly>(
      'BiMetricsHourly',
      BiMetricsHourlySchema,
      'bi_metrics_hourly',
    );
    this.biMetricsHourlyModel.createIndexes().catch(() => {});
    this.biMetricsDailyModel = connection.model<IBiMetricsDaily>(
      'BiMetricsDaily',
      BiMetricsDailySchema,
      'bi_metrics_daily',
    );
    this.biMetricsDailyModel.createIndexes().catch(() => {});
  }

  getBiEventModel(): Model<IBiEvent> { return this.biEventModel; }
  getBiMetricsHourlyModel(): Model<IBiMetricsHourly> { return this.biMetricsHourlyModel; }
  getBiMetricsDailyModel(): Model<IBiMetricsDaily> { return this.biMetricsDailyModel; }
}

let biModelManager: BiModelManager | null = null;

export function initializeBiModels(connection: Connection): BiModelManager {
  if (!biModelManager) {
    biModelManager = new BiModelManager();
    biModelManager.registerModels(connection);
  }
  return biModelManager;
}

export function getBiModelManager(): BiModelManager {
  if (!biModelManager) throw new Error('BiModelManager not initialized');
  return biModelManager;
}
