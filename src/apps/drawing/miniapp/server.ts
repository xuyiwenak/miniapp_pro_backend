import http from "http";
import path from "path";
import express from "express";
import { WebSocketServer } from "ws";
import { sharedHttpOptions } from "../httpServer";
import { setupChatWs } from "./ws/chatServer";
import { authMiddleware } from "./middleware/auth";
import loginRoutes from "./routes/login";
import homeRoutes from "./routes/home";
import apiRoutes from "./routes/api";
import dataCenterRoutes from "./routes/dataCenter";
import workRoutes from "./routes/work";
import healingRoutes from "./routes/healing";
import ossRoutes from "./routes/oss";
import adminRoutes from "./routes/admin/index";
import { gameLogger } from "../../../util/logger";

const staticDir = path.join(process.cwd(), "static");
// __dirname = dist/miniapp/  →  ../../  = project root
const adminPanelDir = path.join(__dirname, "../../admin-panel");

export function createMiniappApp(): express.Express {
  const app = express();
  app.use((req, _res, next) => {
    gameLogger.info(`[miniapp] ${req.method} ${req.path || req.url}`);
    next();
  });
  app.use(express.json({ limit: "10mb" }));
  app.use("/static", express.static(staticDir));
  app.use("/admin-panel", express.static(adminPanelDir));

  if (sharedHttpOptions.cors) {
    app.use((_req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", sharedHttpOptions.cors);
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, *");
      if (sharedHttpOptions.corsMaxAge) {
        res.setHeader("Access-Control-Max-Age", String(sharedHttpOptions.corsMaxAge));
      }
      next();
    });
  }

  app.use("/login", loginRoutes);
  app.use("/home", homeRoutes);
  app.use("/api", apiRoutes);
  app.use("/work", authMiddleware, workRoutes);
  app.use("/oss", authMiddleware, ossRoutes);
  app.use("/dataCenter", dataCenterRoutes);
  app.use("/healing", healingRoutes);
  app.use("/admin", adminRoutes);

  app.use((_req, res) => {
    res.status(200).json({ code: 404, success: false, message: "Not Found" });
  });

  return app;
}

export function startMiniappServer(port: number): Promise<{ app: express.Express; server: http.Server }> {
  const app = createMiniappApp();
  const server = http.createServer(app);
  const logger = sharedHttpOptions.logger;

  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (request, socket, head) => {
    try {
      const host = request.headers.host ?? "127.0.0.1";
      const pathname = new URL(request.url ?? "/", `http://${host}`).pathname;
      if (pathname === "/chat") {
        wss.handleUpgrade(request, socket, head, (ws) => {
          const url = new URL(request.url ?? "/", `http://${host}`);
          const token = url.searchParams.get("token") ?? undefined;
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
      logger.info("Miniapp REST API + WS /chat on port", port);
      resolve({ app, server });
    });
  });
}
