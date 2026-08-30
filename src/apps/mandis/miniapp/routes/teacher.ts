import { randomUUID } from 'crypto';
import { Router, type NextFunction, type Response } from 'express';
import { z } from 'zod';
import { getTeacherProfileModel } from '../../../../dbservice/model/GlobalInfoDBModel';
import {
  authMiddleware,
  type MiniappRequest,
} from '../../../../shared/miniapp/middleware/auth';
import { sendErr, sendSucc } from '../../../../shared/miniapp/middleware/response';
import teacherClassroomsRouter from './teacherClassrooms';

const router = Router();
type TeacherRequest = MiniappRequest & { teacherId?: string };
const ActivationSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  organization: z.string().trim().max(80).optional(),
});

async function requireTeacher(
  req: TeacherRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.userId) {
    sendErr(res, 'Unauthorized', 401);
    return;
  }
  const Teacher = getTeacherProfileModel();
  const teacher = await Teacher.findOne({
    userId: req.userId,
    status: 'active',
  })
    .lean()
    .exec();
  if (!teacher) {
    sendErr(res, 'Teacher profile required', 403);
    return;
  }
  req.teacherId = teacher.teacherId;
  next();
}

router.use(authMiddleware);

router.get('/profile', async (req: MiniappRequest, res) => {
  const Teacher = getTeacherProfileModel();
  const teacher = await Teacher.findOne({
    userId: req.userId,
    status: 'active',
  })
    .lean()
    .exec();
  if (!teacher) {
    sendErr(res, 'Teacher profile required', 403);
    return;
  }
  sendSucc(res, teacher);
});

router.post('/profile/activate', async (req: MiniappRequest, res) => {
  if (!req.userId) {
    sendErr(res, 'Unauthorized', 401);
    return;
  }
  const parsed = ActivationSchema.safeParse(req.body);
  if (!parsed.success) {
    sendErr(res, 'Invalid teacher profile', 400);
    return;
  }
  const Teacher = getTeacherProfileModel();
  const teacher = await Teacher.findOneAndUpdate(
    { userId: req.userId },
    {
      $setOnInsert: { teacherId: randomUUID(), userId: req.userId },
      $set: parsed.data,
    },
    { upsert: true, new: true }
  ).lean().exec();
  sendSucc(res, teacher);
});

router.use('/classrooms', requireTeacher, teacherClassroomsRouter);

export default router;
