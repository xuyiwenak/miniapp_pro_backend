import http from 'http';
import express from 'express';
import { gameLogger as logger } from '../../../util/logger';
import {
  setupCommonMiniappApp,
  setupNotFoundHandler,
  startMiniappHttpServer,
} from '../../../shared/miniapp/server';
import { biTrackingMiddleware } from '../../../shared/miniapp/middleware/biTracking';
import loginRoutes        from './routes/login';
import assessmentRoutes   from './routes/assessment';
import reportRoutes       from './routes/report';
import paymentRoutes      from './routes/payment';
import inviteRoutes       from './routes/invite';
import adminRoutes        from './routes/admin';
import begreatAdminRoutes from './routes/begreatAdmin';
import appRoutes          from './routes/app';
import { initRuntimeConfig } from '../config/BegreatRuntimeConfig';

export function createBegreatApp(): express.Express {
  initRuntimeConfig();

  const app = express();
  setupCommonMiniappApp(app, {
    logger,
    logPrefix: 'begreat',
    jsonLimit: '2mb',
    cors: {
      origin: '*',
      headers: 'Content-Type, Authorization',
      methods: 'GET, POST, OPTIONS',
    },
  });

  // BI 追踪中间件：记录所有 API 请求
  app.use(biTrackingMiddleware);

  app.use('/app',            appRoutes);
  app.use('/login',          loginRoutes);
  app.use('/assessment',     assessmentRoutes);
  app.use('/report',         reportRoutes);
  app.use('/payment',        paymentRoutes);
  app.use('/invite',         inviteRoutes);
  app.use('/admin',          adminRoutes);
  app.use('/begreat-admin',  begreatAdminRoutes);

  setupNotFoundHandler(app);

  return app;
}

export function startBegreatServer(port: number): Promise<{ app: express.Express; server: http.Server }> {
  const app = createBegreatApp();
  return startMiniappHttpServer(app, port, logger, '[begreat] REST API listening on port');
}
