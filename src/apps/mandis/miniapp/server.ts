import http from 'http';
import path from 'path';
import express from 'express';
import { WebSocketServer } from 'ws';
import { sharedHttpOptions } from '../httpServer';
import { setupChatWs } from './ws/chatServer';
import { authMiddleware } from '../../../shared/miniapp/middleware/auth';
import { setupCommonMiniappApp, setupNotFoundHandler } from '../../../shared/miniapp/server';
import loginRoutes from './routes/login';
import homeRoutes from './routes/home';
import apiRoutes from './routes/api';
import dataCenterRoutes from './routes/dataCenter';
import workRoutes from './routes/work';
import healingRoutes from './routes/healing';
import ossRoutes from './routes/oss';
import adminRoutes from './routes/admin/index';
import appRoutes from './routes/app';
import { gameLogger } from '../../../util/logger';

const staticDir = path.join(process.cwd(), 'static');
// __dirname = dist/miniapp/  →  ../../  = project root
const adminPanelDir = path.join(__dirname, '../../admin-panel');

export function createMiniappApp(): express.Express {
  const app = express();
  setupCommonMiniappApp(app, {
    logger: gameLogger,
    logPrefix: 'miniapp',
    jsonLimit: '10mb',
    cors: sharedHttpOptions.cors
      ? {
        origin: sharedHttpOptions.cors,
        headers: 'Content-Type, Authorization, *',
        maxAge: sharedHttpOptions.corsMaxAge,
      }
      : undefined,
  });

  app.use('/static', express.static(staticDir));
  app.use('/admin-panel', express.static(adminPanelDir));

  app.use('/app', appRoutes);
  app.use('/login', loginRoutes);
  app.use('/home', homeRoutes);
  app.use('/api', apiRoutes);
  app.use('/work', authMiddleware, workRoutes);
  app.use('/oss', authMiddleware, ossRoutes);
  app.use('/dataCenter', dataCenterRoutes);
  app.use('/healing', healingRoutes);
  app.use('/admin', adminRoutes);

  setupNotFoundHandler(app);

  return app;
}

export function startMiniappServer(port: number): Promise<{ app: express.Express; server: http.Server }> {
  const app = createMiniappApp();
  const server = http.createServer(app);
  const logger = sharedHttpOptions.logger;

  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    try {
      const host = request.headers.host ?? '127.0.0.1';
      const pathname = new URL(request.url ?? '/', `http://${host}`).pathname;
      if (pathname === '/chat') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          const url = new URL(request.url ?? '/', `http://${host}`);
          const token = url.searchParams.get('token') ?? undefined;
          setupChatWs(ws, token);
        });
      } else {
        socket.destroy();
      }
    } catch {
      socket.destroy();
    }
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      logger.info('Miniapp REST API + WS /chat on port', port);
      resolve({ app, server });
    });
  });
}
