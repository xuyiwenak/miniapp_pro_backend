/*
 * @Author: lyh
 * @Github:
 * @FilePath: /InstanceServer/src/front.ts
 * @Date: 2024-10-28 16:17:41
 * @LastEditors: lyh
 * @LastEditTime: 2025-01-08 10:06:01
 */

import { ComponentManager, EComName } from '../../common/BaseComponent';

import { ServerGlobals } from '../../common/ServerGlobal';
import { websocketGameServer } from '../../common/WebsocketGameServer';

import { MongoComponent } from '../../component/front/MongoComponent';
import { PlayerComponent } from '../../component/PlayerComponent';
import { BiAnalyticsComponent } from '../../component/BiAnalyticsComponent';
import { BiAggregator } from '../../component/BiAggregator';
import { BiAggregationJob } from '../../jobs/BiAggregationJob';
import {
  registerCoreComponents,
  setupProcessLifecycle,
  startRegisteredComponents,
} from '../shared/bootstrap';

import { envFirst, envNumber, syncEnvForSysConfig } from '../../util/env';
import { gameLogger, gameLogger as logger } from '../../util/logger';
import { stopFrontServer } from '../../util/tool';
import { getMiniappPort, initHttpServer, startHttpServer } from './httpServer';
import { startMiniappServer } from './miniapp/server';
// @ts-expect-error swagger-ui-express 无官方 @types，通过运行时依赖提供类型
import swaggerUi from 'swagger-ui-express';
import express from 'express';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const swaggerFile = (() => { try { return require('../../../docs/app1/openapi.json'); } catch { return {}; } })() as Record<string, unknown>;

// Entry function
async function main() {
  syncEnvForSysConfig();
  const args = buildServerGlobals();
  logger.debug('ServerGlobals----->', args);
  registerCoreComponents(args);
  const biAggregationJob = registerBusinessComponents(args);
  await startRegisteredComponents();
  startBiAggregationJob(args, biAggregationJob);
  await startApiAndMiniappServers(args);
  swaggui();
  await websocketGameServer.init(args);
  await websocketGameServer.start();
}

main();
setupProcessLifecycle('front', logger, stopFrontServer);

if (process.platform === 'win32') {
  process.on('message', (msg) => {
    if (msg === 'shutdown') {
      // PM2 发来的“关机”消息
      gameLogger.log('[pm2] 开始优雅关闭...');
      // 关库、停队列、flush 日志等
      stopFrontServer();
    }
  });
}

function swaggui() {
  const globalVarComp = ComponentManager.instance.getComponent(
    EComName.GlobalVarComponent
  );
  if (globalVarComp.globalVar.environment === 'development') {
    const app = express();
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerFile));
    app.listen(42999, () => {
      logger.info('Swagger UI running on http://localhost:42999/api-docs');
    });
  }
}

function buildServerGlobals(): ServerGlobals {
  const httpPort = envNumber('httpPort', 'HTTP_PORT') ?? 40001;
  const args: ServerGlobals = {
    id: envFirst('id', 'SERVER_ID') ?? 'front_1',
    internalIP: envFirst('internalIP', 'INTERNAL_IP'),
    publicIP: envFirst('publicIP', 'PUBLIC_IP'),
    gameType: envFirst('gameType', 'GAME_TYPE') ?? 'front',
    group: envNumber('group', 'GROUP'),
    environment: envFirst('environment', 'ENV') ?? 'development',
    connectionTickTimeout: envNumber('connectionTickTimeout', 'CONNECTION_TICK_TIMEOUT') ?? 30000,
    port: envNumber('port', 'WS_PORT') ?? 40000,
    httpPort,
    miniappApiPort: envNumber('miniappApiPort', 'MINIAPP_PORT'),
    serverProvide: envFirst('serverProvide', 'SERVER_PROVIDE') ?? '',
  };
  args.miniappApiPort = getMiniappPort(args);
  return args;
}

function registerBusinessComponents(args: ServerGlobals): BiAggregationJob {
  const mongoComp: MongoComponent = new MongoComponent();
  ComponentManager.instance.register('MongoComponent', mongoComp);
  const playerComp: PlayerComponent = new PlayerComponent();
  ComponentManager.instance.register('PlayerComponent', playerComp);
  const biAnalyticsComp: BiAnalyticsComponent = new BiAnalyticsComponent();
  biAnalyticsComp.init({
    enabled: args.environment !== 'test',
    appName: 'mandis',
    appVersion: '1.0.0',
    platform: 'api',
  });
  ComponentManager.instance.register('BiAnalytics', biAnalyticsComp);
  const biAggregator = new BiAggregator();
  biAggregator.init({});
  return new BiAggregationJob(biAggregator);
}

function startBiAggregationJob(args: ServerGlobals, biAggregationJob: BiAggregationJob): void {
  if (args.environment !== 'test') {
    biAggregationJob.start();
  }
}

async function startApiAndMiniappServers(args: ServerGlobals): Promise<void> {
  await initHttpServer(args);
  await startHttpServer();
  await startMiniappServer(args.miniappApiPort ?? 42002);
}
