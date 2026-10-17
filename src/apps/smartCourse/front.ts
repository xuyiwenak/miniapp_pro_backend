import Redis from 'ioredis';
import { loadConfig } from './config';
import { SmartCourseMongoComponent } from './component/SmartCourseMongoComponent';
import { createRepository } from './dbservice/repository';
import { createAccess } from './services/access';
import { createBailianAgent } from './services/bailian';
import { createArtworkStorage } from './services/storage';
import { createSmartCourseApp } from './server';
import { requireValue } from './errors';
import { gameLogger } from '../../util/logger';
import { startMiniappHttpServer } from '../../shared/miniapp/server';

async function main() {
  const config = loadConfig();
  const mongo = new SmartCourseMongoComponent(config);
  await mongo.start();
  const redis = new Redis(config.SMARTCOURSE_REDIS_URL, { maxRetriesPerRequest: 1 });
  redis.on('error', () => gameLogger.warn('smartCourse Redis connection failed'));
  await redis.ping();
  const app = createSmartCourseApp({ config, repo: createRepository(requireValue(mongo.models)),
    access: createAccess(redis), agent: createBailianAgent(config), storage: createArtworkStorage(config) });
  const { server } = await startMiniappHttpServer(app, config.SMARTCOURSE_PORT, gameLogger, 'smartCourse listening');
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    server.close(() => { void Promise.all([mongo.stop(), redis.quit()]).finally(() => process.exit(0)); });
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
main().catch(() => { gameLogger.error('smartCourse startup failed; check service configuration'); process.exit(1); });
