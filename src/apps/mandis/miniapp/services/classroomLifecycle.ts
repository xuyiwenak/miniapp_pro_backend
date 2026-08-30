import {
  getClassroomModel,
  getClassroomParticipationModel,
} from '../../../../dbservice/model/GlobalInfoDBModel';
import type { IClassroom } from '../../entity/classroom.entity';

export async function finalizeClassroom(
  classId: string,
  finalizedBy: 'system' | 'teacher',
  finalizedAt: Date = new Date(),
): Promise<boolean> {
  const Classroom = getClassroomModel();
  const result = await Classroom.updateOne(
    { classId, status: 'closing' },
    { $set: { status: 'closed', finalizedAt, finalizedBy } },
  ).exec();
  if (result.modifiedCount === 0) return false;
  const Participation = getClassroomParticipationModel();
  await Participation.updateMany(
    { classId, artworkId: { $exists: false } },
    { $set: { artworkStatus: 'not_provided' } },
  ).exec();
  return true;
}

export async function finalizeClassroomIfExpired(
  classroom: IClassroom,
): Promise<IClassroom> {
  const gracePeriodEndsAt = classroom.gracePeriodEndsAt;
  if (classroom.status !== 'closing' || !gracePeriodEndsAt) return classroom;
  if (gracePeriodEndsAt.getTime() > Date.now()) return classroom;
  const finalizedAt = new Date();
  await finalizeClassroom(classroom.classId, 'system', finalizedAt);
  return { ...classroom, status: 'closed', finalizedAt, finalizedBy: 'system' };
}
