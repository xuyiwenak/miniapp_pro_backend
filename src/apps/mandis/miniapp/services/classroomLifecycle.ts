import { withClassroomWrite } from './classroomWriteBoundary';
import {
  getClassroomModel,
  getClassroomParticipationModel,
  getWorkModel, getClassroomArtworkAnalysisModel,
} from '../../../../dbservice/model/GlobalInfoDBModel';
import type { IClassroom } from '../../entity/classroom.entity';

export async function finalizeClassroom(
  classId: string,
  finalizedBy: 'system' | 'teacher',
  finalizedAt: Date = new Date(),
): Promise<boolean> {
  return withClassroomWrite(classId, async () => {
    const Classroom = getClassroomModel();
    const result = await Classroom.updateOne(
      { classId, status: 'closing' },
      { $set: { finalizedAt, finalizedBy } },
    ).exec();
    if (result.modifiedCount === 0) return false;
    const Participation = getClassroomParticipationModel();
    await Participation.updateMany(
      { classId, artworkId: { $exists: false } },
      { $set: { artworkStatus: 'not_provided' } },
    ).exec();
    await getClassroomArtworkAnalysisModel().updateMany({ classroomId: classId, status: 'pending' },
      { $set: { status: 'closed_incomplete', errorCode: 'CLOSED_BEFORE_COMPLETION' } }).exec();
    await getWorkModel().updateMany({ classroomId: classId, 'healing.status': 'pending' },
      { $set: { 'healing.status': 'failed', 'healing.failReason': 'CLOSED_BEFORE_COMPLETION' } }).exec();
    await Classroom.updateOne({ classId, status: 'closing' }, { $set: { status: 'closed' } }).exec();
    return true;
  });
}

export async function finalizeClassroomIfExpired(
  classroom: IClassroom,
): Promise<IClassroom> {
  const gracePeriodEndsAt = classroom.gracePeriodEndsAt;
  if (classroom.status !== 'closing' || !gracePeriodEndsAt) return classroom;
  if (gracePeriodEndsAt.getTime() > Date.now()) return classroom;
  const finalizedAt = new Date();
  await finalizeClassroom(classroom.classId, 'system', finalizedAt);
  return await getClassroomModel().findOne({ classId: classroom.classId }).lean().exec() ?? classroom;
}
