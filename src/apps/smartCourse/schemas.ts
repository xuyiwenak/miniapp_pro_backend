import { z } from 'zod';

export const IdSchema = z.string().uuid();
export const CourseInput = z.object({
  title: z.string().trim().min(1).max(80),
  brief: z.string().trim().min(1).max(2000),
}).strict();
export const LoginInput = z.object({
  username: z.string().trim().min(1).max(80), password: z.string().min(1).max(128),
}).strict();
export const StatusInput = z.object({ status: z.enum(['open', 'closed']) }).strict();
export const JoinInput = z.object({ consent: z.literal(true) }).strict();
export const ChatInput = z.object({
  requestId: IdSchema, question: z.string().trim().min(1).max(2000),
  mode: z.enum(['question', 'create', 'review']), artworkId: IdSchema.optional(),
}).strict();
export type ChatRequest = z.infer<typeof ChatInput>;
export const StatementInput = z.string().trim().max(1000).default('');
export type Session = { role: 'teacher' | 'student'; id: string; courseId?: string };
export const SessionSchema = z.object({
  role: z.enum(['teacher', 'student']), id: IdSchema, courseId: IdSchema.optional(),
});
