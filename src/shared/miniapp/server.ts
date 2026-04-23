import http from "http";
import express from "express";

type CommonMiniappAppOptions = {
  logger: { info: (...args: unknown[]) => void; debug: (...args: unknown[]) => void };
  logPrefix: string;
  jsonLimit: string;
  cors?: {
    origin: string;
    headers?: string;
    methods?: string;
    maxAge?: number;
  };
};

export function setupCommonMiniappApp(
  app: express.Express,
  options: CommonMiniappAppOptions,
): void {
  app.use((req, _res, next) => {
    options.logger.debug(`[${options.logPrefix}] ${req.method} ${req.path ?? req.url}`);
    next();
  });

  app.use(express.json({ limit: options.jsonLimit }));

  if (options.cors) {
    app.use((_req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", options.cors!.origin);
      res.setHeader(
        "Access-Control-Allow-Headers",
        options.cors!.headers ?? "Content-Type, Authorization",
      );
      if (options.cors!.methods) {
        res.setHeader("Access-Control-Allow-Methods", options.cors!.methods);
      }
      if (options.cors!.maxAge) {
        res.setHeader("Access-Control-Max-Age", String(options.cors!.maxAge));
      }
      next();
    });
  }
}

export function setupNotFoundHandler(app: express.Express): void {
  app.use((_req, res) => {
    res.status(200).json({ code: 404, success: false, message: "Not Found" });
  });
}

export function startMiniappHttpServer(
  app: express.Express,
  port: number,
  logger: { info: (...args: unknown[]) => void },
  message: string,
): Promise<{ app: express.Express; server: http.Server }> {
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(port, () => {
      logger.info(message, port);
      resolve({ app, server });
    });
  });
}
