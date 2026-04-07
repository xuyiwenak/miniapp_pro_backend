import http from "http";
import express from "express";
import { gameLogger as logger } from "../../../util/logger";
import {
  setupCommonMiniappApp,
  setupNotFoundHandler,
  startMiniappHttpServer,
} from "../../../shared/miniapp/server";
import loginRoutes      from "./routes/login";
import assessmentRoutes from "./routes/assessment";
import reportRoutes     from "./routes/report";
import paymentRoutes    from "./routes/payment";

export function createBegreatApp(): express.Express {
  const app = express();
  setupCommonMiniappApp(app, {
    logger,
    logPrefix: "begreat",
    jsonLimit: "2mb",
    cors: {
      origin: "*",
      headers: "Content-Type, Authorization",
      methods: "GET, POST, OPTIONS",
    },
  });

  app.use("/login",      loginRoutes);
  app.use("/assessment", assessmentRoutes);
  app.use("/report",     reportRoutes);
  app.use("/payment",    paymentRoutes);

  setupNotFoundHandler(app);

  return app;
}

export function startBegreatServer(port: number): Promise<{ app: express.Express; server: http.Server }> {
  const app = createBegreatApp();
  return startMiniappHttpServer(app, port, logger, "[begreat] REST API listening on port");
}
