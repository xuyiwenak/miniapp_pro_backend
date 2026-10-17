import { z } from 'zod';
import { LIMITS, type SmartCourseConfig } from '../config';
import { SmartCourseError } from '../errors';
import type { Course, Turn } from '../dbservice/models';

const APPLICATION_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/apps';
const OutputSchema = z.object({
  output: z.object({ text: z.string().trim().min(1).max(20_000) }),
  request_id: z.string().optional(),
});
export interface AgentInput {
  question: string; mode: 'question' | 'create' | 'review'; artworkUrl: string;
  studentStatement: string; contextText: string;
}
export interface AgentAnswer { answer: string; providerRequestId?: string }
export type Agent = (course: Course, input: AgentInput) => Promise<AgentAnswer>;

export function buildContext(turns: Turn[], artworkId?: string): string {
  // Never feed old visual descriptions into another artwork or a no-image turn.
  return turns.filter(turn => turn.status === 'success' && turn.artworkId === artworkId)
    .slice(0, LIMITS.historyTurns).reverse()
    .map(turn => `学生：${turn.question}\n助教：${turn.answer}`).join('\n').slice(-LIMITS.contextChars);
}
export function buildAgentBody(input: AgentInput) {
  return { input: { prompt: input.question, biz_params: {
    mode: input.mode, artworkUrl: input.artworkUrl,
    studentStatement: input.studentStatement, contextText: input.contextText,
  } }, parameters: {} };
}
export function parseAgentAnswer(body: unknown): AgentAnswer {
  const result = OutputSchema.safeParse(body);
  if (!result.success) throw new SmartCourseError(502, 'AGENT_OUTPUT', '助教暂未返回有效回答，请稍后重试');
  return { answer: result.data.output.text, providerRequestId: result.data.request_id };
}
export function createBailianAgent(config: SmartCourseConfig, transport: typeof fetch = fetch): Agent {
  return async (course, input) => {
    if (!config.SMARTCOURSE_BAILIAN_API_KEY || !course.appId) {
      throw new SmartCourseError(503, 'AGENT_NOT_CONFIGURED', '课程助教尚未配置，请联系教师');
    }
    try {
      const response = await transport(`${APPLICATION_ENDPOINT}/${encodeURIComponent(course.appId)}/completion`, {
        method: 'POST', headers: { 'Content-Type': 'application/json',
          Authorization: `Bearer ${config.SMARTCOURSE_BAILIAN_API_KEY}` },
        body: JSON.stringify(buildAgentBody(input)), signal: AbortSignal.timeout(LIMITS.agentTimeoutMs),
        redirect: 'error',
      });
      if (!response.ok) throw new SmartCourseError(502, 'AGENT_UNAVAILABLE', '助教服务暂时不可用，请稍后重试');
      return parseAgentAnswer(await response.json());
    } catch (error) {
      if (error instanceof SmartCourseError) throw error;
      throw new SmartCourseError(502, 'AGENT_UNAVAILABLE', '助教连接未完成，请稍后重试');
    }
  };
}
