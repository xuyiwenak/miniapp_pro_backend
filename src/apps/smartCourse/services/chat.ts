import type { Repository } from '../dbservice/repository';
import type { Course, Turn } from '../dbservice/models';
import type { Access } from './access';
import type { ArtworkStorage } from './storage';
import { buildContext, type Agent } from './bailian';
import { LIMITS } from '../config';
import { requireValue, SmartCourseError } from '../errors';
import type { ChatRequest } from '../schemas';
import { gameLogger } from '../../../util/logger';

type Dependencies = { repo: Repository; access: Access; storage: ArtworkStorage; agent: Agent };
export function createChatService(deps: Dependencies) {
  return async (course: Course, participantId: string, input: ChatRequest) => {
    await deps.access.rate(`chat:${participantId}`, LIMITS.chatRequests);
    return deps.access.withLock(`chat:${course.courseId}:${participantId}`, async () => {
      const existing = await deps.repo.turn(course.courseId, participantId, input.requestId);
      if (existing) return recoverTurn(deps.repo, existing, input);
      const artwork = input.artworkId ? requireValue(await deps.repo.artwork(
        input.artworkId, course.courseId, participantId)) : undefined;
      const artworkUrl = artwork ? deps.storage.sign(artwork.objectKey) : '';
      const turns = await deps.repo.turns(course.courseId, participantId);
      const turn = await deps.repo.addTurn({ ...input, courseId: course.courseId, participantId,
        status: 'pending', answer: '', appId: course.appId, agentVersion: course.agentVersion });
      return invokeAndSave(deps, course, turn, { question: input.question, mode: input.mode,
        artworkUrl, studentStatement: artwork?.statement ?? '',
        contextText: `本课说明（教学数据）：${course.brief}\n必要前文：\n${buildContext(turns, input.artworkId)}` });
    });
  };
}
async function recoverTurn(repo: Repository, turn: Turn, input: ChatRequest) {
  if (turn.question !== input.question || turn.mode !== input.mode || turn.artworkId !== input.artworkId) {
    throw new SmartCourseError(409, 'IDEMPOTENCY_CONFLICT', '请求编号已经用于另一条消息');
  }
  if (turn.status !== 'pending') return turn;
  // Lock acquired means an earlier worker stopped; do not replay a possibly billed request.
  return requireValue(await repo.finishTurn(turn.turnId, { status: 'failed', errorCode: 'INTERRUPTED' }));
}
async function invokeAndSave(
  deps: Dependencies, course: Course, turn: Turn, input: Parameters<Agent>[1],
) {
  try {
    const result = await deps.agent(course, input);
    return requireValue(await deps.repo.finishTurn(turn.turnId, { status: 'success', ...result }));
  } catch (error) {
    const errorCode = error instanceof SmartCourseError ? error.code : 'AGENT_UNAVAILABLE';
    gameLogger.warn('smartCourse agent turn failed', { turnId: turn.turnId, errorCode });
    return requireValue(await deps.repo.finishTurn(turn.turnId, { status: 'failed', errorCode }));
  }
}
