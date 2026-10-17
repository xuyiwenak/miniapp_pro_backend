import type { Request, Response, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { TEACHER_COOKIE, type SmartCourseConfig } from './config';
import { SmartCourseError } from './errors';
import type { Session } from './schemas';
import type { Access } from './services/access';
import type { Repository } from './dbservice/repository';
import type { Agent } from './services/bailian';
import type { ArtworkStorage } from './services/storage';
import { gameLogger } from '../../util/logger';

export type Dependencies = {
  config: SmartCourseConfig; repo: Repository; access: Access; agent: Agent; storage: ArtworkStorage;
};
export function teacherToken(req: Request): string {
  return req.headers.cookie?.split(';').map(value => value.trim())
    .find(value => value.startsWith(`${TEACHER_COOKIE}=`))?.slice(TEACHER_COOKIE.length + 1) ?? '';
}
export function handle(action: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next) => { void action(req, res).catch(next); };
}
export function authenticated(
  deps: Dependencies, role: Session['role'],
  action: (req: Request, res: Response, session: Session) => Promise<unknown>,
): RequestHandler {
  return handle(async (req, res) => {
    const token = role === 'teacher' ? teacherToken(req) : req.headers.authorization?.replace(/^Bearer /, '') ?? '';
    const session = await deps.access.authenticate(token, role);
    return action(req, res, session);
  });
}
export function errorResponse(error: unknown, res: Response) {
  if (error instanceof ZodError) return res.status(400).json({ error: 'VALIDATION', message: '请检查填写的内容' });
  if (error instanceof SmartCourseError) {
    return res.status(error.status).json({ error: error.code, message: error.message });
  }
  if (error instanceof Error && error.name === 'MulterError') {
    return res.status(400).json({ error: 'UPLOAD', message: '上传未完成，图片不能超过 10 MB' });
  }
  gameLogger.error('smartCourse request failed', { type: error instanceof Error ? error.name : 'unknown' });
  return res.status(500).json({ error: 'INTERNAL', message: '服务暂时不可用，请稍后重试' });
}
