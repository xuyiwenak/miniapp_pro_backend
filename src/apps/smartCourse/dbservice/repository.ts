import { randomUUID, randomBytes } from 'crypto';
import type { Models, Course, Turn } from './models';
import { LIMITS } from '../config';
import { patternRepository } from './patternRepository';

export function createRepository(models: Models) {
  return {
    ...patternRepository(models),
    teacher: (username: string) => models.teachers.findOne({ username }).lean().exec(),
    courses: (teacherId: string) => models.courses.find({ teacherId }).sort({ createdAt: -1 })
      .limit(LIMITS.pageSize).lean().exec(),
    course: (courseId: string) => models.courses.findOne({ courseId }).lean().exec(),
    courseByCode: (joinCode: string) => models.courses.findOne({ joinCode }).lean().exec(),
    createCourse: (data: Pick<Course, 'teacherId' | 'title' | 'brief' | 'appId' | 'agentVersion' | 'courseTemplateVersion'>) =>
      models.courses.create({ ...data, courseId: randomUUID(), joinCode: randomBytes(18).toString('base64url') }),
    setStatus: (courseId: string, teacherId: string, status: string, previous: string) =>
      models.courses.findOneAndUpdate({ courseId, teacherId, status: previous },
        { status }, { new: true }).lean().exec(),
    join: (courseId: string) => models.participants.create({ courseId, participantId: randomUUID() }),
    participant: (participantId: string, courseId: string) =>
      models.participants.findOne({ participantId, courseId }).lean().exec(),
    participants: (courseId: string) => models.participants.find({ courseId }).sort({ createdAt: -1 })
      .limit(LIMITS.pageSize).lean().exec(),
    complete: (participantId: string, courseId: string) =>
      models.participants.updateOne({ participantId, courseId }, { completed: true }).exec(),
    artworks: (courseId: string, participantId?: string) => models.artworks
      .find({ courseId, ...(participantId ? { participantId } : {}) }).sort({ createdAt: -1 })
      .limit(LIMITS.pageSize).lean().exec(),
    artwork: (artworkId: string, courseId: string, participantId: string) =>
      models.artworks.findOne({ artworkId, courseId, participantId }).lean().exec(),
    addArtwork: (data: { courseId: string; participantId: string; objectKey: string; statement: string }) =>
      models.artworks.create({ ...data, artworkId: randomUUID() }),
    turns: (courseId: string, participantId: string) => models.turns.find({ courseId, participantId })
      .sort({ createdAt: -1 }).limit(LIMITS.pageSize).lean().exec(),
    turn: (courseId: string, participantId: string, requestId: string) =>
      models.turns.findOne({ courseId, participantId, requestId }).lean().exec(),
    addTurn: (data: Omit<Turn, 'turnId' | 'createdAt'>) => models.turns.create({ ...data, turnId: randomUUID() }),
    finishTurn: (turnId: string, data: Partial<Pick<Turn,
      'status' | 'answer' | 'errorCode' | 'providerRequestId'>>) =>
      models.turns.findOneAndUpdate({ turnId }, data, { new: true }).lean().exec(),
  };
}
export type Repository = ReturnType<typeof createRepository>;
