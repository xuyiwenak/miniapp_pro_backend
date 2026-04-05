import http from "http";
import express from "express";
import { gameLogger as logger } from "../../../util/logger";
import loginRoutes      from "./routes/login";
import assessmentRoutes from "./routes/assessment";
import reportRoutes     from "./routes/report";
import paymentRoutes    from "./routes/payment";

export function createBegreatApp(): express.Express {
  const app = express();

  app.use((req, _res, next) => {
    logger.info(`[begreat] ${req.method} ${req.path ?? req.url}`);
    next();
  });
  app.use(express.json({ limit: "2mb" }));

  // CORS
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    next();
  });

  app.use("/login",      loginRoutes);
  app.use("/assessment", assessmentRoutes);
  app.use("/report",     reportRoutes);
  app.use("/payment",    paymentRoutes);

  app.use((_req, res) => {
    res.status(200).json({ code: 404, success: false, message: "Not Found" });
  });

  return app;
}

export function startBegreatServer(port: number): Promise<{ app: express.Express; server: http.Server }> {
  const app    = createBegreatApp();
  const server = http.createServer(app);

  return new Promise((resolve) => {
    server.listen(port, () => {
      logger.info("[begreat] REST API listening on port", port);
      resolve({ app, server });
    });
  });
}
