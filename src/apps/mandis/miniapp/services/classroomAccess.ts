import type { Response } from 'express';
import { getClassroomModel } from '../../../../dbservice/model/GlobalInfoDBModel';
import { sendErr } from '../../../../shared/miniapp/middleware/response';
import type { IClassroom, ClassroomCapability } from '../../entity/classroom.entity';

export function classroomAccessQuery(teacherId: string): Record<string, unknown> {
  return {
    $or: [
      { createdByTeacherId: teacherId },
      { authorizedTeacherIds: teacherId },
    ],
  };
}

export async function findAccessibleClassroom(
  classId: string,
  teacherId: string,
  res: Response
): Promise<IClassroom | null> {
  const Classroom = getClassroomModel();
  const classroom = await Classroom.findOne({
    classId,
    ...classroomAccessQuery(teacherId),
  }).lean().exec();
  if (!classroom) sendErr(res, 'Classroom not found', 404);
  return classroom;
}

export async function findOwnedClassroom(
  classId: string,
  teacherId: string,
  res: Response
): Promise<IClassroom | null> {
  const Classroom = getClassroomModel();
  const classroom = await Classroom.findOne({
    classId,
    createdByTeacherId: teacherId,
  }).lean().exec();
  if (!classroom) sendErr(res, 'Classroom not found', 404);
  return classroom;
}

export function hasClassroomCapability(
  classroom: IClassroom, teacherId: string, capability: ClassroomCapability,
): boolean {
  if (classroom.createdByTeacherId === teacherId) return true;
  if (!classroom.authorizedTeacherIds.includes(teacherId)) return false;
  if (capability === 'summary') return true;
  return Boolean(classroom.capabilityGrants?.find((grant) => grant.teacherId === teacherId)
    ?.capabilities.includes(capability));
}
