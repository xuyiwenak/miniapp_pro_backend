import http from "http";
import path from "path";
import express from "express";
import { sharedHttpOptions } from "../httpServer";
import { authMiddleware } from "./middleware/auth";
import loginRoutes from "./routes/login";
import homeRoutes from "./routes/home";
import apiRoutes from "./routes/api";
import dataCenterRoutes from "./routes/dataCenter";
import workRoutes from "./routes/work";
import healingRoutes from "./routes/healing";
import ossRoutes from "./routes/oss";

const staticDir = path.join(process.cwd(), "static");

export function createMiniappApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use("/static", express.static(staticDir));

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

  app.use((_req, res) => {
    res.status(200).json({ code: 404, success: false, message: "Not Found" });
  });

  return app;
}

export function startMiniappServer(port: number): Promise<{ app: express.Express; server: http.Server }> {
  const app = createMiniappApp();
  const server = http.createServer(app);
  const logger = sharedHttpOptions.logger;
  return new Promise((resolve) => {
    server.listen(port, () => {
      logger.info("Miniapp REST API and WebSocket /chat started at port", port);
      resolve({ app, server });
    });
  });
}
