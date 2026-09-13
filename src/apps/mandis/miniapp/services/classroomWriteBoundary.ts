import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { getClassroomModel } from '../../../../dbservice/model/GlobalInfoDBModel';
import { sendErr } from '../../../../shared/miniapp/middleware/response';

const writeContext = new AsyncLocalStorage<{ classId: string; active: boolean }>();
export class ClassroomWriteError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ClassroomWriteError';
  }
}

/** A non-expiring database mutex fails closed if a process dies mid-write.
 * Never expire an active writer: a late writer could otherwise mutate a sealed dataset.
 * Recovery requires an operator to confirm that the owning process has stopped.
 */
export async function withClassroomWrite<T>(classId: string, action: () => Promise<T>): Promise<T> {
  const context = writeContext.getStore();
  if (context?.active && context.classId === classId) return action();
  const Classroom = getClassroomModel();
  const lockId = randomUUID();
  await claimWriteLock(classId, lockId);
  const scope = { classId, active: true };
  try {
    return await writeContext.run(scope, action);
  } finally {
    scope.active = false;
    await Classroom.updateOne({ classId, writeLock: lockId }, { $unset: { writeLock: 1 } },
      { timestamps: false }).exec();
  }
}

export async function assertClassroomWritable(classId: string): Promise<void> {
  const classroom = await getClassroomModel().findOne({ classId }).lean().exec();
  const writable = classroom && (classroom.status === 'open' || (classroom.status === 'closing'
    && classroom.gracePeriodEndsAt && classroom.gracePeriodEndsAt.getTime() > Date.now()));
  if (!writable) throw new ClassroomWriteError('CLASSROOM_READ_ONLY');
}

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => unknown;
export function teacherWrite(handler: AsyncHandler): RequestHandler {
  return async (req, res, next) => {
    try {
      await withClassroomWrite(req.params.classId, async () => { await handler(req, res, next); });
    } catch (error) {
      if (error instanceof ClassroomWriteError) sendErr(res, error.code, 409);
      else next(error);
    }
  };
}

export function outsideClassroomWrite(action: () => void): void {
  writeContext.exit(action);
}

export function asyncClassroomRoute(handler: AsyncHandler): RequestHandler {
  return async (req, res, next) => {
    try { await handler(req, res, next); }
    catch (error) {
      if (error instanceof ClassroomWriteError) sendErr(res, error.code, 409);
      else next(error);
    }
  };
}

const LOCK_ATTEMPTS = 40; // Wait briefly for an active request, never expire its ownership.
const LOCK_RETRY_MS = 100;
async function claimWriteLock(classId: string, lockId: string): Promise<void> {
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    const claimed = await getClassroomModel().updateOne(
      { classId, writeLock: { $exists: false } }, { $set: { writeLock: lockId } }, { timestamps: false },
    ).exec();
    if (claimed.modifiedCount) return;
    await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
  }
  throw new ClassroomWriteError('CLASSROOM_BUSY');
}
