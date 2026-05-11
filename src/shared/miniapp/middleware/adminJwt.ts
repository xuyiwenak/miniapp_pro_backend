import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { Model } from 'mongoose';
import { sendSucc, sendErr } from './response';
import { gameLogger as logger } from '../../../util/logger';

export interface AdminJwtPayload {
  adminId:  string;
  username: string;
  role:     'admin';
}

// Mongoose Model 泛型与各 app 具体 schema 类型不兼容，用 any 统一接口
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAdminModel = Model<any>;

interface AdminAuthRouterOptions {
  secretEnvVar: string;
  logPrefix: string;
  jwtAuth: RequestHandler;
  getModel: () => AnyAdminModel;
  getPayload: (req: Request) => AdminJwtPayload | undefined;
}

const BCRYPT_COST = 12;
const DUMMY_HASH  = '$2b$12$invalidhashfortimingprotectiononly000000000000000000000';

function getSecret(secretEnvVar: string): string {
  const secret = process.env[secretEnvVar];
  if (!secret) throw new Error(`${secretEnvVar} is not set`);
  return secret;
}

/**
 * 创建 JWT 鉴权中间件。
 * setPayload 负责把解析出的 payload 挂到 req 上（各 app 挂到不同属性）。
 */
export function makeAdminJwtAuth(
  secretEnvVar: string,
  setPayload: (req: Request, payload: AdminJwtPayload) => void,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization ?? '';
    const token = header.replace(/^Bearer\s+/i, '');
    if (!token) {
      sendErr(res, 'Unauthorized', 401);
      return;
    }
    try {
      const payload = jwt.verify(token, getSecret(secretEnvVar)) as AdminJwtPayload;
      setPayload(req, payload);
      next();
    } catch {
      sendErr(res, 'Unauthorized', 401);
    }
  };
}

function registerInitAdminRoute(router: Router, options: AdminAuthRouterOptions): void {
  const { logPrefix, getModel } = options;
  router.post('/init-admin', async (req: Request, res: Response) => {
    const { username, password } = req.body ?? {};
    if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
      sendErr(res, 'username and password are required', 400);
      return;
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    // 原子 upsert：空 filter + $setOnInsert 保证并发请求只有第一个能插入
    // new: false → 返回旧文档；若为 null 说明是新插入（集合原本为空）
    const existing = await getModel().findOneAndUpdate(
      {},
      { $setOnInsert: { adminId: randomUUID(), username, passwordHash } },
      { upsert: true, new: false },
    );
    if (existing) {
      sendErr(res, 'Admin already initialized', 409);
      return;
    }
    logger.info(`${logPrefix} admin account initialized`);
    res.status(201).json({ success: true });
  });
}

function registerLoginRoute(router: Router, options: AdminAuthRouterOptions): void {
  const { logPrefix, secretEnvVar, getModel } = options;
  router.post('/login', async (req: Request, res: Response) => {
    const { username, password } = req.body ?? {};
    if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
      sendErr(res, 'Invalid credentials', 401);
      return;
    }
    const admin = await getModel().findOne({ username });
    const match = await bcrypt.compare(password, admin?.passwordHash ?? DUMMY_HASH);
    if (!admin || !match) {
      sendErr(res, 'Invalid credentials', 401);
      return;
    }
    const payload: AdminJwtPayload = { adminId: admin.adminId, username: admin.username, role: 'admin' };
    const token = jwt.sign(payload, getSecret(secretEnvVar), { expiresIn: '24h' });
    logger.info(`${logPrefix} login: ${admin.username}`);
    sendSucc(res, { token });
  });
}

function registerMeRoute(router: Router, options: AdminAuthRouterOptions): void {
  const { jwtAuth, getPayload } = options;
  router.get('/me', jwtAuth, (req: Request, res: Response) => {
    const payload = getPayload(req);
    if (!payload) {
      sendErr(res, 'Unauthorized', 401);
      return;
    }
    sendSucc(res, { adminId: payload.adminId, username: payload.username });
  });
}

function registerChangePasswordRoute(router: Router, options: AdminAuthRouterOptions): void {
  const { logPrefix, jwtAuth, getPayload, getModel } = options;
  router.post('/change-password', jwtAuth, async (req: Request, res: Response) => {
    const payload = getPayload(req);
    if (!payload) { sendErr(res, 'Unauthorized', 401); return; }

    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || typeof currentPassword !== 'string' ||
        !newPassword   || typeof newPassword   !== 'string') {
      sendErr(res, 'currentPassword and newPassword are required', 400);
      return;
    }
    if (newPassword.length < 8) {
      sendErr(res, 'newPassword must be at least 8 characters', 400);
      return;
    }

    const admin = await getModel().findOne({ adminId: payload.adminId });
    if (!admin) { sendErr(res, 'Admin not found', 404); return; }

    const match = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!match) { sendErr(res, 'Current password is incorrect', 401); return; }

    admin.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await admin.save();
    logger.info(`${logPrefix} password changed: ${admin.username}`);
    sendSucc(res, { message: 'Password changed successfully' });
  });
}

/**
 * 创建 admin 鉴权路由（init-admin / login / me / change-password）。
 * getPayload 从 req 上读取当前中间件挂载的 payload。
 */
export function makeAdminAuthRouter(options: AdminAuthRouterOptions): Router {
  const router = Router();
  registerInitAdminRoute(router, options);
  registerLoginRoute(router, options);
  registerMeRoute(router, options);
  registerChangePasswordRoute(router, options);
  return router;
}
