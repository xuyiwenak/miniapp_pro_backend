import { ComponentManager } from '../../common/BaseComponent';
import { ServerGlobals } from '../../common/ServerGlobal';
import { BegreatMongoComponent } from './component/BegreatMongoComponent';
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

  await startRegisteredComponents();

  await startBegreatServer(args.miniappApiPort!);
}

main().catch((err) => {
  console.error('[begreat] Fatal startup error:', err);
  process.exit(1);
});

setupProcessLifecycle('begreat', logger, () => process.exit(0));
