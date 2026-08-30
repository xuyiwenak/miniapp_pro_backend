import { createHash, randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { IClassroom } from '../../entity/classroom.entity';
import type { IClassroomParticipation } from '../../entity/classroomParticipation.entity';

const CLASSROOM_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CLASSROOM_CODE_LENGTH = 4;
const ACCESS_CODE_BYTES = 18;
const RESUME_TOKEN_BYTES = 32;
const ACTIVE_WINDOW_MS = 2 * 60 * 1000;

export const PANAS_ITEM_CODES = [
  'PANAS_UPSET',
  'PANAS_HOSTILE',
  'PANAS_ALERT',
  'PANAS_ASHAMED',
  'PANAS_INSPIRED',
  'PANAS_NERVOUS',
  'PANAS_DETERMINED',
  'PANAS_ATTENTIVE',
  'PANAS_AFRAID',
  'PANAS_ACTIVE',
] as const;

export const VAD_ITEM_CODES = ['valence', 'arousal', 'dominance'] as const;

export function generateClassroomCode(): string {
  const bytes = randomBytes(CLASSROOM_CODE_LENGTH);
  return Array.from(
    bytes,
    (byte) => CLASSROOM_CODE_ALPHABET[byte % CLASSROOM_CODE_ALPHABET.length]
  ).join('');
}

export function generateAccessCode(): string {
  return randomBytes(ACCESS_CODE_BYTES).toString('base64url');
}

export function generateResumeToken(): string {
  return randomBytes(RESUME_TOKEN_BYTES).toString('base64url');
}

export function generateParticipantId(): string {
  return uuidv4();
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function buildScheduledDate(classDate: string, time: string): Date {
  return new Date(`${classDate}T${time}:00+08:00`);
}

export function isResearchRecordComplete(
  participation: IClassroomParticipation
): boolean {
  return (
    participation.preAssessment.status === 'submitted' &&
    participation.postAssessment.status === 'submitted' &&
    Boolean(participation.artworkId) &&
    Boolean(participation.instrumentVersion) &&
    Boolean(participation.dataSchemaVersion)
  );
}

export function isParticipantActive(
  participation: IClassroomParticipation,
  now = new Date()
): boolean {
  return (
    now.getTime() - participation.lastActiveAt.getTime() <= ACTIVE_WINDOW_MS
  );
}

export function isResumeAllowed(
  classroom: IClassroom,
  now = new Date()
): boolean {
  if (classroom.status === 'open') return true;
  if (classroom.status !== 'closing' || !classroom.gracePeriodEndsAt)
    return false;
  return classroom.gracePeriodEndsAt.getTime() > now.getTime();
}

export function countAssessmentAnswers(
  vad: Record<string, number> | undefined,
  panas: Record<string, number> | undefined
): number {
  const vadCount = VAD_ITEM_CODES.filter(
    (code) => vad?.[code] !== undefined
  ).length;
  const panasCount = PANAS_ITEM_CODES.filter(
    (code) => panas?.[code] !== undefined
  ).length;
  return vadCount + panasCount;
}

export function hasCompleteAssessment(
  vad: Record<string, number> | undefined,
  panas: Record<string, number> | undefined
): boolean {
  return (
    countAssessmentAnswers(vad, panas) ===
    VAD_ITEM_CODES.length + PANAS_ITEM_CODES.length
  );
}

export function stripJpegExif(buffer: Buffer): Buffer {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8)
    return buffer;
  const chunks: Buffer[] = [buffer.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= buffer.length && buffer[offset] === 0xff) {
    const marker = buffer[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + length + 2 > buffer.length) return buffer;
    if (marker !== 0xe1)
      chunks.push(buffer.subarray(offset, offset + length + 2));
    offset += length + 2;
  }
  chunks.push(buffer.subarray(offset));
  return Buffer.concat(chunks);
}
