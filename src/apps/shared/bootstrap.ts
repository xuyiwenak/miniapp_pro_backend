import { ComponentManager, EComName } from '../../common/BaseComponent';
import { ServerGlobals } from '../../common/ServerGlobal';
import { GlobalVarComponent } from '../../component/GlobalVarComponent';
import { SysCfgComponent } from '../../component/SysCfgComponent';
import { BiAnalyticsComponent } from '../../component/BiAnalyticsComponent';
import { BiAggregator } from '../../component/BiAggregator';
import { BiAggregationJob } from '../../jobs/BiAggregationJob';
import type { AppName } from '../../entity/biEvent.entity';

type LifecycleLogger = {
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
};

export function registerCoreComponents(args: ServerGlobals): void {
  const globalVarComp = new GlobalVarComponent();
  globalVarComp.init(args);
  ComponentManager.instance.register(EComName.GlobalVarComponent, globalVarComp);

  const sysCfgComp = new SysCfgComponent();
  ComponentManager.instance.register(EComName.SysCfgComponent, sysCfgComp);
}

export async function startRegisteredComponents(): Promise<void> {
  await ComponentManager.instance.startAll();
  await ComponentManager.instance.afterStartAll();
}

export function registerBiServices(args: ServerGlobals, appName: AppName): BiAggregationJob {
  const biAnalyticsComp = new BiAnalyticsComponent();
  biAnalyticsComp.init({
    enabled: args.environment !== 'test',
    appName,
    appVersion: '1.0.0',
    platform: 'api',
  });
  ComponentManager.instance.register('BiAnalytics', biAnalyticsComp);

  const biAggregator = new BiAggregator();
  biAggregator.init({});
  return new BiAggregationJob(biAggregator);
}

export function startBiAggregationJob(
  args: ServerGlobals,
  biAggregationJob: BiAggregationJob,
): void {
  if (args.environment !== 'test') {
    biAggregationJob.start();
  }
}

export function setupProcessLifecycle(
  appName: string,
  logger: LifecycleLogger,
  onShutdown: () => void,
): void {
  process.on('uncaughtException', (err) => {
    logger.error(`[${appName}] Uncaught exception:`, err.message);
  });

  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
    logger.warn(`[${appName}] Unhandled rejection:`, msg);
  });

  process.on('SIGINT', () => {
    logger.info(`[${appName}] SIGINT, shutting down`);
    onShutdown();
  });

  process.on('SIGTERM', () => {
    logger.info(`[${appName}] SIGTERM, shutting down`);
    onShutdown();
  });
}
