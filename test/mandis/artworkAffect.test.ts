import { strict as assert } from 'assert';
import type { IWork } from '../../src/entity/work.entity';
import type { IClassroomParticipation } from '../../src/apps/mandis/entity/classroomParticipation.entity';
import {
  ARTWORK_SELF_REPORT_MAPPINGS,
  buildArtworkAffectAssociations,
  resolveArtworkAffect,
} from '../../src/apps/mandis/miniapp/services/artworkAffect';
import { parseArtworkAnalysisOutput } from '../../src/util/qwenVlAnalyzer';

const DIMENSION_CODES = [
  'joy', 'calm', 'anxiety', 'fear', 'solitude', 'passion', 'social_aversion', 'vitality',
];

function analysisOutput(): Record<string, unknown> {
  return {
    construct: 'perceived_expressed_affect',
    scale_version: 'artwork-affect-v1',
    dimensions: Object.fromEntries(DIMENSION_CODES.map((code, index) => [code, {
      score: 20 + index * 5,
      assessable: true,
      evidence: [`${code} visual evidence`],
    }])),
    vad: {
      valence: 60,
      arousal: 55,
      dominance: 50,
      assessable: true,
      evidence: ['balanced composition'],
      interpretation: '作品呈现中等唤醒和略偏积极的视觉氛围。',
    },
    insight: '作品通过颜色、线条和构图呈现出可观察的情绪表达。',
    color_analysis: { interpretation: '色彩关系稳定。', key_colors: ['柔和蓝', '暖白'] },
    line_analysis: { energy_score: 5, style: '流动', interpretation: '线条节奏平稳。' },
    composition_report: '画面重心稳定，留白适中。',
    suggestion: '可以继续尝试不同材料，观察画面节奏的变化。',
  };
}

function directWork(participantId: string, joy: number): IWork {
  const now = new Date('2026-09-01T08:00:00.000Z');
  const dimensions = Object.fromEntries(DIMENSION_CODES.map((code) => [code, {
    score: code === 'joy' ? joy : 40,
    assessable: true,
    evidence: [`${code} evidence`],
  }]));
  return {
    workId: `work-${participantId}`,
    participantId,
    desc: '',
    images: [],
    tags: [],
    status: 'published',
    createdAt: now,
    updatedAt: now,
    healing: {
      scores: Object.fromEntries(DIMENSION_CODES.map((code) => [code, code === 'joy' ? joy : 40])),
      summary: 'summary',
      colorAnalysis: 'color',
      status: 'success',
      isPublic: false,
      artworkAffect: {
        construct: 'perceived_expressed_affect',
        scoreSource: 'model_direct',
        modelVersion: 'qwen-vl-plus',
        promptVersion: 'artwork-affect-prompt-v2',
        scaleVersion: 'artwork-affect-v1',
        generatedAt: now,
        dimensions,
        vad: {
          valence: 60, arousal: 50, dominance: 50, assessable: true,
          evidence: ['balanced composition'], interpretation: 'balanced',
        },
      },
    },
  };
}

function participant(participantId: string, positiveValue: number): IClassroomParticipation {
  const now = new Date('2026-09-01T08:00:00.000Z');
  const positiveCodes = ['PANAS_ALERT', 'PANAS_INSPIRED', 'PANAS_DETERMINED', 'PANAS_ATTENTIVE', 'PANAS_ACTIVE'];
  const negativeCodes = ['PANAS_UPSET', 'PANAS_HOSTILE', 'PANAS_ASHAMED', 'PANAS_NERVOUS', 'PANAS_AFRAID'];
  return {
    participantId,
    classId: 'class-1',
    classroomCode: participantId.slice(-4).toUpperCase(),
    resumeTokenHash: `hash-${participantId}`,
    source: 'student',
    instrumentVersion: 'sam-vad-ipanas-sf-v1',
    dataSchemaVersion: 'classroom-participation-v1',
    currentStage: 'completed',
    preAssessment: { status: 'submitted', answeredCount: 13 },
    postAssessment: {
      status: 'submitted',
      answeredCount: 13,
      vad: { valence: positiveValue, arousal: positiveValue, dominance: positiveValue },
      panas: Object.fromEntries([
        ...positiveCodes.map((code) => [code, positiveValue]),
        ...negativeCodes.map((code) => [code, 6 - positiveValue]),
      ]),
    },
    artworkStatus: 'student_uploaded',
    participantFlowCompleted: true,
    researchRecordComplete: true,
    syncStatus: 'synced',
    lastActiveAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

describe('artwork affect', () => {
  it('strictly validates every dimension, score range and assessability', () => {
    assert.equal(parseArtworkAnalysisOutput(analysisOutput()).construct, 'perceived_expressed_affect');
    const missingDimension = analysisOutput();
    delete (missingDimension.dimensions as Record<string, unknown>).fear;
    assert.throws(() => parseArtworkAnalysisOutput(missingDimension));
    const invalidRange = analysisOutput();
    const joy = (invalidRange.dimensions as Record<string, Record<string, unknown>>).joy;
    if (joy) joy.score = 101;
    assert.throws(() => parseArtworkAnalysisOutput(invalidRange));
    const notAssessable = analysisOutput();
    const calm = (notAssessable.dimensions as Record<string, Record<string, unknown>>).calm;
    if (calm) Object.assign(calm, { score: null, assessable: false });
    assert.equal(parseArtworkAnalysisOutput(notAssessable).dimensions.calm.score, null);
  });

  it('excludes legacy defaults and keeps versioned direct output eligible', () => {
    const direct = resolveArtworkAffect(directWork('participant-a234', 60));
    assert.equal(direct.researchEligible, true);
    assert.equal(direct.data?.promptVersion, 'artwork-affect-prompt-v2');
    const legacy = directWork('participant-b234', 50);
    if (legacy.healing) {
      legacy.healing.scores = Object.fromEntries(DIMENSION_CODES.map((code) => [code, 50]));
      delete legacy.healing.artworkAffect;
    }
    assert.deepEqual(resolveArtworkAffect(legacy), {
      data: resolveArtworkAffect(legacy).data,
      researchEligible: false,
      exclusionReason: 'default_scores',
    });
  });

  it('does not invent direct PANAS mappings for solitude or social aversion', () => {
    const mappedCodes: string[] = ARTWORK_SELF_REPORT_MAPPINGS.map((mapping) => mapping.dimensionCode);
    assert.equal(mappedCodes.includes('solitude'), false);
    assert.equal(mappedCodes.includes('social_aversion'), false);
  });

  it('computes descriptive associations only from eligible model-direct scores', () => {
    const participants = [participant('participant-a234', 1), participant('participant-b234', 3), participant('participant-c234', 5)];
    const works = [directWork('participant-a234', 20), directWork('participant-b234', 50), directWork('participant-c234', 80)];
    const association = buildArtworkAffectAssociations(participants, works).find(
      (item) => item.dimensionCode === 'joy' && item.targetCode === 'positiveAffect',
    );
    assert.equal(association?.sampleSize, 3);
    assert.equal(association?.correlation, 1);
  });
});
