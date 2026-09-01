import { strict as assert } from 'assert';
import { buildClassroomAssessmentResult } from '../../src/apps/mandis/miniapp/services/classroomAssessmentResults';
import {
  buildClassroomSimulation,
  CLASSROOM_SIMULATION_PANAS_CODES,
} from '../../src/apps/mandis/miniapp/services/classroomSimulation';
import { isResearchRecordComplete } from '../../src/apps/mandis/miniapp/services/classroomResearch';

const PARTICIPANT_COUNT = 24;

function deterministicRandom(): () => number {
  let state = 123456789;
  return () => {
    state = (1103515245 * state + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function simulation() {
  return buildClassroomSimulation({
    teacher: { teacherId: 'teacher-1', displayName: '模拟教师' },
    authorizedTeacherIds: ['teacher-1', 'teacher-2'],
    images: [{ url: 'https://oss.example.test/artwork.jpg', name: 'artwork.jpg', type: 'image/jpeg' }],
    participantCount: PARTICIPANT_COUNT,
    now: new Date('2026-09-01T08:00:00.000Z'),
    random: deterministicRandom(),
  });
}

describe('classroom simulation', () => {
  it('builds a new finalized classroom with complete anonymous records', () => {
    const bundle = simulation();
    assert.equal(bundle.classroom.status, 'closed');
    assert.equal(bundle.classroom.courseName, '艺术疗愈课堂');
    assert.deepEqual(bundle.classroom.authorizedTeacherIds, ['teacher-2']);
    assert.equal(bundle.participants.length, PARTICIPANT_COUNT);
    assert.equal(bundle.works.length, PARTICIPANT_COUNT);
    assert.equal(new Set(bundle.participants.map((item) => item.classroomCode)).size, PARTICIPANT_COUNT);
    bundle.participants.forEach((participant) => {
      assert.ok(participant.profile?.gender === 'male' || participant.profile?.gender === 'female');
      assert.equal(participant.participantFlowCompleted, true);
      assert.equal(isResearchRecordComplete(participant), true);
      assert.equal(participant.preAssessment.answeredCount, 13);
      assert.equal(participant.postAssessment.answeredCount, 13);
      assert.deepEqual(Object.keys(participant.preAssessment.panas ?? {}).sort(), [
        ...CLASSROOM_SIMULATION_PANAS_CODES,
      ].sort());
    });
  });

  it('keeps measurement ranges valid and uses the current artwork affect versions', () => {
    const bundle = simulation();
    bundle.participants.forEach((participant) => {
      Object.values(participant.preAssessment.vad ?? {}).forEach((value) => assert.ok(value >= 1 && value <= 9));
      Object.values(participant.postAssessment.vad ?? {}).forEach((value) => assert.ok(value >= 1 && value <= 9));
      Object.values(participant.preAssessment.panas ?? {}).forEach((value) => assert.ok(value >= 1 && value <= 5));
      Object.values(participant.postAssessment.panas ?? {}).forEach((value) => assert.ok(value >= 1 && value <= 5));
    });
    bundle.works.forEach((work) => {
      assert.equal(work.tags.includes('课堂作品'), true);
      assert.equal(work.healing?.artworkAffect?.modelVersion, 'qwen-vl-plus');
      assert.equal(work.healing?.artworkAffect?.promptVersion, 'artwork-affect-prompt-v2');
      assert.equal(work.healing?.artworkAffect?.scoreSource, 'model_direct');
    });
  });

  it('produces usable report variation without claiming identical scales', () => {
    const bundle = simulation();
    const result = buildClassroomAssessmentResult(bundle.participants, bundle.works);
    const measures = result.instrumentGroups[0]?.measures ?? [];
    const positive = measures.find((measure) => measure.code === 'positiveAffect');
    const negative = measures.find((measure) => measure.code === 'negativeAffect');
    assert.equal(result.researchRecordCompleteCount, PARTICIPANT_COUNT);
    assert.equal(result.artworkAffectSummary.researchEligibleCount, PARTICIPANT_COUNT);
    assert.ok((positive?.delta.mean ?? 0) > 0);
    assert.ok((negative?.delta.mean ?? 0) < 0);
    assert.ok(result.artworkAffectSummary.associations.some(
      (association) => association.sampleSize === PARTICIPANT_COUNT && association.correlation !== null,
    ));
  });

  it('does not reuse classroom or participant identifiers between runs', () => {
    const first = simulation();
    const second = simulation();
    assert.notEqual(first.classroom.classId, second.classroom.classId);
    assert.notEqual(first.classroom.accessCode, second.classroom.accessCode);
    assert.notEqual(first.participants[0]?.participantId, second.participants[0]?.participantId);
  });
});
