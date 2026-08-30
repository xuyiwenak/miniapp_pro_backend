import { strict as assert } from 'assert';
import * as XLSX from 'xlsx';
import type { IClassroom } from '../../src/apps/mandis/entity/classroom.entity';
import type { IClassroomParticipation } from '../../src/apps/mandis/entity/classroomParticipation.entity';
import {
  buildClassroomAssessmentResult,
  describeValues,
} from '../../src/apps/mandis/miniapp/services/classroomAssessmentResults';
import {
  buildAssessmentCsv,
  buildAssessmentWorkbook,
  sanitizeSpreadsheetCell,
} from '../../src/apps/mandis/miniapp/services/classroomAssessmentExport';
import { getAssessmentResultDataStatus } from '../../src/apps/mandis/miniapp/routes/teacherClassroomAssessmentResults';

const POSITIVE_CODES = [
  'PANAS_ALERT', 'PANAS_INSPIRED', 'PANAS_DETERMINED', 'PANAS_ATTENTIVE', 'PANAS_ACTIVE',
];
const NEGATIVE_CODES = [
  'PANAS_UPSET', 'PANAS_HOSTILE', 'PANAS_ASHAMED', 'PANAS_NERVOUS', 'PANAS_AFRAID',
];

function panas(positive: number, negative: number): Record<string, number> {
  return Object.fromEntries([
    ...POSITIVE_CODES.map((code) => [code, positive]),
    ...NEGATIVE_CODES.map((code) => [code, negative]),
  ]);
}

function participation(
  classroomCode: string,
  preValue: number,
  postValue: number,
  instrumentVersion = 'sam-vad-ipanas-sf-v1',
): IClassroomParticipation {
  const now = new Date('2026-08-31T08:00:00.000Z');
  return {
    participantId: `participant-${classroomCode}`,
    classId: 'class-1',
    classroomCode,
    resumeTokenHash: `hash-${classroomCode}`,
    source: 'student',
    instrumentVersion,
    dataSchemaVersion: 'classroom-participation-v1',
    currentStage: 'completed',
    profile: { gender: 'female', artExperience: 'occasional' },
    preAssessment: {
      status: 'submitted', answeredCount: 13,
      vad: { valence: preValue, arousal: preValue, dominance: preValue },
      panas: panas(preValue, 6 - preValue),
    },
    postAssessment: {
      status: 'submitted', answeredCount: 13,
      vad: { valence: postValue, arousal: postValue, dominance: postValue },
      panas: panas(postValue, 6 - postValue),
    },
    artworkStatus: 'student_uploaded',
    artworkId: `artwork-${classroomCode}`,
    participantFlowCompleted: true,
    researchRecordComplete: true,
    syncStatus: 'synced',
    lastActiveAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function classroom(status: IClassroom['status'] = 'closed'): IClassroom {
  const now = new Date('2026-08-31T08:00:00.000Z');
  return {
    classId: 'class-1', createdByTeacherId: 'teacher-1', courseName: '课程', sessionTitle: '课堂',
    activityTheme: '主题', classDate: '2026-08-31', startTime: '08:00', endTime: '10:00',
    timezone: 'Asia/Shanghai', scheduledStartAt: now, scheduledEndAt: now,
    gradeLevel: 'undergraduate_1', teacherDisplayName: '教师', locationText: '教室', status,
    gracePeriodMinutes: 30, consentVersion: 'v1', instrumentVersion: 'sam-vad-ipanas-sf-v1',
    finalizedAt: status === 'closed' ? now : undefined, createdAt: now, updatedAt: now,
  };
}

describe('classroom assessment results', () => {
  it('calculates descriptive sample statistics and preserves exact matches', () => {
    assert.deepEqual(describeValues([1, 3]), {
      count: 2, mean: 2, median: 2, standardDeviation: 1.41,
    });
    const result = buildClassroomAssessmentResult([
      participation('A234', 3, 3),
      participation('B234', 3, 5),
    ]);
    const valence = result.instrumentGroups[0]?.measures.find((measure) => measure.code === 'valence');
    assert.equal(result.assessmentPairedCount, 2);
    assert.equal(valence?.delta.mean, 1);
    assert.deepEqual(valence?.changeCounts, { increased: 1, unchanged: 1, decreased: 0 });
  });

  it('keeps different instrument versions in separate groups', () => {
    const result = buildClassroomAssessmentResult([
      participation('A234', 2, 3, 'version-a'),
      participation('B234', 4, 5, 'version-b'),
    ]);
    assert.deepEqual(result.instrumentGroups.map((group) => group.instrumentVersion), [
      'version-a', 'version-b',
    ]);
  });

  it('distinguishes provisional results from final exportable results', () => {
    assert.equal(getAssessmentResultDataStatus(classroom('open')), null);
    assert.equal(getAssessmentResultDataStatus(classroom('closing')), 'provisional');
    assert.equal(getAssessmentResultDataStatus(classroom('closed')), 'final');
  });

  it('builds the research workbook and protects spreadsheet cells', () => {
    const participant = participation('A234', 2, 4);
    participant.profile = { gender: '=unsafe', artExperience: 'none' };
    const result = buildClassroomAssessmentResult([participant]);
    const buffer = buildAssessmentWorkbook(classroom(), [participant], result);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    assert.deepEqual(workbook.SheetNames, [
      'manifest', 'summary', 'participant_wide', 'responses_long', 'data_dictionary',
    ]);
    assert.equal(sanitizeSpreadsheetCell('+formula'), "'+formula");
    assert.match(buildAssessmentCsv(result).toString('utf8'), /'=unsafe/);
  });
});
