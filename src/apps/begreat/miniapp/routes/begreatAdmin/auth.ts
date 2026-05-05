import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getAdminModel } from '../../../dbservice/BegreatDBModel';
import { sendSucc, sendErr } from '../../../../../shared/miniapp/middleware/response';
import { gameLogger as logger } from '../../../../../util/logger';

const router = Router();

const BCRYPT_COST = 12;

function getJwtSecret(): string {
  const secret = process.env['BEGREAT_ADMIN_JWT_SECRET'];
  if (!secret) throw new Error('BEGREAT_ADMIN_JWT_SECRET is not set');
  return secret;
}

export interface AdminJwtPayload {
  adminId:  string;
  username: string;
  role:     'admin';
}

declare module 'express' {
  interface Request {
    admin?: AdminJwtPayload;
  }
}

// ── 一次性初始化（仅 admins 集合为空时可用）────────────────────────────────────
router.post('/init-admin', async (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};
  if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
    sendErr(res, 'username and password are required', 400);
    return;
  }

  const AdminModel = getAdminModel();
  const count = await AdminModel.countDocuments();
  if (count > 0) {
    sendErr(res, 'Admin already initialized', 409);
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  await AdminModel.create({ adminId: randomUUID(), username, passwordHash });
  logger.info('[begreat-admin/auth] admin account initialized');
  res.status(201).json({ success: true });
});

// ── 登录 ─────────────────────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};
  if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
    sendErr(res, 'Invalid credentials', 401);
    return;
  }

  const admin = await getAdminModel().findOne({ username });
  // 无论账号存不存在都做 bcrypt 比较，防止时序攻击暴露账号
  const dummyHash = '$2b$12$invalidhashfortimingprotectiononly000000000000000000000';
  const match = await bcrypt.compare(password, admin?.passwordHash ?? dummyHash);
  if (!admin || !match) {
    sendErr(res, 'Invalid credentials', 401);
    return;
  }

  const payload: AdminJwtPayload = { adminId: admin.adminId, username: admin.username, role: 'admin' };
  const token = jwt.sign(payload, getJwtSecret(), { expiresIn: '24h' });
  logger.info(`[begreat-admin/auth] login: ${admin.username}`);
  sendSucc(res, { token });
});

// ── 当前管理员信息 ─────────────────────────────────────────────────────────────
router.get('/me', adminJwtAuth, (req: Request, res: Response) => {
  if (!req.admin) {
    sendErr(res, 'Unauthorized', 401);
    return;
  }
  sendSucc(res, { adminId: req.admin.adminId, username: req.admin.username });
});

export default router;

// ── adminJwtAuth 中间件（export 供主路由使用）────────────────────────────────
export function adminJwtAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) {
    sendErr(res, 'Unauthorized', 401);
    return;
  }
  try {
    const payload = jwt.verify(token, getJwtSecret()) as AdminJwtPayload;
    req.admin = payload;
    next();
  } catch {
    sendErr(res, 'Unauthorized', 401);
  }
}
