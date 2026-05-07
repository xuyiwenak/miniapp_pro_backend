import { ComponentManager } from '../../common/BaseComponent';
import { ServerGlobals } from '../../common/ServerGlobal';
import { BegreatMongoComponent } from './component/BegreatMongoComponent';
import { BiAnalyticsComponent } from '../../component/BiAnalyticsComponent';
import { BiAggregator } from '../../component/BiAggregator';
import { BiAggregationJob } from '../../jobs/BiAggregationJob';
import {
  registerCoreComponents,
  setupProcessLifecycle,
  startRegisteredComponents,
} from '../shared/bootstrap';
import { envFirst, envNumber, syncEnvForSysConfig } from '../../util/env';
import { gameLogger as logger } from '../../util/logger';
import { startBegreatServer } from './miniapp/server';

async function main() {
  syncEnvForSysConfig();

  const args: ServerGlobals = {
    id:                  envFirst('id', 'SERVER_ID') ?? 'begreat_1',
    gameType:            'begreat',
    environment:         envFirst('environment', 'ENV') ?? 'development',
    port:                0,  // no WebSocket
    httpPort:            envNumber('httpPort', 'HTTP_PORT') ?? 41001,
    miniappApiPort:      envNumber('miniappApiPort', 'MINIAPP_PORT') ?? 41002,
    connectionTickTimeout: 30000,
    serverProvide:       envFirst('serverProvide', 'SERVER_PROVIDE') ?? '',
  };

  logger.info('[begreat] starting, env:', args.environment, 'id:', args.id);
  registerCoreComponents(args);

  const mongoComp = new BegreatMongoComponent();
  ComponentManager.instance.register('BegreatMongoComponent', mongoComp);

  // BI 分析组件：事件追踪和数据收集
  const biAnalyticsComp = new BiAnalyticsComponent();
  biAnalyticsComp.init({
    enabled: args.environment !== 'test',
    appName: 'begreat',
    appVersion: '1.0.0',
    platform: 'api',
  });
  ComponentManager.instance.register('BiAnalytics', biAnalyticsComp);

  // BI 聚合引擎和定时任务
  const biAggregator = new BiAggregator();
  biAggregator.init({});
  const biAggregationJob = new BiAggregationJob(biAggregator);

  await startRegisteredComponents();

  // 启动 BI 聚合定时任务（非测试环境）
  if (args.environment !== 'test') {
    biAggregationJob.start();
  }

  await startBegreatServer(args.miniappApiPort ?? 41002);
}

main().catch((err) => {
  console.error('[begreat] Fatal startup error:', err);
  process.exit(1);
});

setupProcessLifecycle('begreat', logger, () => process.exit(0));
