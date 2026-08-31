import { strict as assert } from 'assert';
import type { IClassroom } from '../../src/apps/mandis/entity/classroom.entity';
import type { IClassroomParticipation } from '../../src/apps/mandis/entity/classroomParticipation.entity';
import {
  countAssessmentAnswers,
  generateClassroomCode,
  getStageAfterArtworkUpload,
  hasCompleteAssessment,
  hashToken,
  isResearchRecordComplete,
  isResumeAllowed,
  PANAS_ITEM_CODES,
  stripJpegExif,
  VAD_ITEM_CODES,
} from '../../src/apps/mandis/miniapp/services/classroomResearch';

function assessmentAnswers(): {
  vad: Record<string, number>;
  panas: Record<string, number>;
} {
  return {
    vad: Object.fromEntries(VAD_ITEM_CODES.map((code) => [code, 5])),
    panas: Object.fromEntries(PANAS_ITEM_CODES.map((code) => [code, 3])),
  };
}

describe('classroom research helpers', () => {
  it('generates short codes without ambiguous characters', () => {
    const codes = Array.from({ length: 100 }, generateClassroomCode);
    codes.forEach((code) => assert.match(code, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/));
  });

  it('hashes resume tokens deterministically without storing the source value', () => {
    const token = 'local-resume-token';
    assert.equal(hashToken(token), hashToken(token));
    assert.notEqual(hashToken(token), token);
  });

  it('requires all VAD and PANAS answers for a complete assessment', () => {
    const answers = assessmentAnswers();
    assert.equal(countAssessmentAnswers(answers.vad, answers.panas), 13);
    assert.equal(hasCompleteAssessment(answers.vad, answers.panas), true);
    delete answers.panas[PANAS_ITEM_CODES[0]];
    assert.equal(hasCompleteAssessment(answers.vad, answers.panas), false);
  });

  it('marks only paired assessments with an artwork as research complete', () => {
    const participant = {
      preAssessment: { status: 'submitted' },
      postAssessment: { status: 'submitted' },
      artworkId: 'artwork-id',
      instrumentVersion: 'sam-vad-ipanas-sf-v1',
      dataSchemaVersion: 'classroom-participation-v1',
    } as IClassroomParticipation;
    assert.equal(isResearchRecordComplete(participant), true);
    participant.artworkId = undefined;
    assert.equal(isResearchRecordComplete(participant), false);
  });

  it('returns to reflection after a late artwork upload without repeating the post assessment', () => {
    const participant = {
      participantFlowCompleted: false,
      postAssessment: { status: 'submitted' },
    } as IClassroomParticipation;
    assert.equal(getStageAfterArtworkUpload(participant), 'ai_echo');
    participant.participantFlowCompleted = true;
    assert.equal(getStageAfterArtworkUpload(participant), 'completed');
  });

  it('allows resume only while open or before the closing grace deadline', () => {
    const now = new Date('2026-08-30T10:00:00.000Z');
    const classroom = {
      status: 'closing',
      gracePeriodEndsAt: new Date('2026-08-30T10:01:00.000Z'),
    } as IClassroom;
    assert.equal(isResumeAllowed(classroom, now), true);
    classroom.gracePeriodEndsAt = new Date('2026-08-30T09:59:00.000Z');
    assert.equal(isResumeAllowed(classroom, now), false);
  });

  it('removes JPEG APP1 metadata while retaining image content', () => {
    const start = Buffer.from([0xff, 0xd8]);
    const exif = Buffer.from([0xff, 0xe1, 0x00, 0x06, 0x45, 0x78, 0x69, 0x66]);
    const scan = Buffer.from([0xff, 0xda, 0x00, 0x02, 0x12, 0x34, 0xff, 0xd9]);
    const cleaned = stripJpegExif(Buffer.concat([start, exif, scan]));
    assert.deepEqual(cleaned, Buffer.concat([start, scan]));
  });
});
