import type { Repository } from '../dbservice/repository';
import type { Course, Artwork, Turn } from '../dbservice/models';
import { requireValue, SmartCourseError } from '../errors';
import type { Session } from '../schemas';

export function courseView(course: Course, teacher = false) {
  const { courseId, title, brief, status, createdAt, agentVersion } = course;
  return { courseId, title, brief, status, createdAt, agentVersion,
    ...(teacher ? { joinCode: course.joinCode } : {}) };
}
export function artworkView(artwork: Artwork, sign: (key: string) => string) {
  const { artworkId, statement, participantId, createdAt } = artwork;
  return { artworkId, statement, participantId, createdAt, imageUrl: sign(artwork.objectKey) };
}
export function turnView(turn: Turn) {
  const { requestId, question, answer, mode, artworkId, status, createdAt, errorCode } = turn;
  return { requestId, question, answer, mode, artworkId, status, createdAt, errorCode };
}
export function assertOpen(course: Course) {
  if (course.status !== 'open') throw new SmartCourseError(409, 'COURSE_CLOSED', '课程尚未开放或已经结束');
}
export async function ownedCourse(repo: Repository, courseId: string, teacherId: string) {
  const course = requireValue(await repo.course(courseId));
  if (course.teacherId !== teacherId) throw new SmartCourseError(404, 'NOT_FOUND', '课程不存在');
  return course;
}
export async function studentCourse(repo: Repository, courseId: string, session: Session) {
  if (session.courseId !== courseId) throw new SmartCourseError(403, 'FORBIDDEN', '无法访问其他课程');
  const participant = requireValue(await repo.participant(session.id, courseId));
  const course = requireValue(await repo.course(courseId));
  return { course, participant };
}
