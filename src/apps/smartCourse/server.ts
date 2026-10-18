import express from 'express';
import { setupCommonMiniappApp } from '../../shared/miniapp/server';
import { gameLogger } from '../../util/logger';
import { API_PREFIX } from './config';
import { type Dependencies, errorResponse } from './http';
import { teacherRoutes } from './routes/teacher';
import { ceramicRoutes } from './routes/ceramic';
import { designRoutes } from './routes/design';
import { studentRoutes } from './routes/student';

export function createSmartCourseApp(deps: Dependencies) {
  const app = express();
  app.disable('x-powered-by');
  // Production API is reachable only through the single Nginx hop.
  app.set('trust proxy', 1);
  app.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  setupCommonMiniappApp(app, { logger: { info: gameLogger.info.bind(gameLogger), debug: () => undefined },
    logPrefix: 'smartCourse', jsonLimit: '32kb' });
  app.use((req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== deps.config.SMARTCOURSE_ORIGIN) {
      res.status(403).json({ error: 'ORIGIN', message: '请求来源不正确' });
      return;
    }
    next();
  });
  app.get(`${API_PREFIX}/health`, (_req, res) => res.json({ status: 'ok', app: 'smartCourse' }));
  app.use(`${API_PREFIX}/teacher`, teacherRoutes(deps));
  app.use(API_PREFIX, studentRoutes(deps));
  app.use(API_PREFIX, designRoutes(deps));
  app.use(API_PREFIX, ceramicRoutes(deps));
  app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND', message: '接口不存在' }));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    errorResponse(error, res);
  });
  return app;
}
