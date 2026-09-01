import { createHash, randomUUID } from 'crypto';
import type { IWork } from '../../../../entity/work.entity';
import type { IClassroom } from '../../entity/classroom.entity';
import type {
  IAssessmentRecord,
  IClassroomParticipantProfile,
  IClassroomParticipation,
} from '../../entity/classroomParticipation.entity';
import {
  generateAccessCode,
  generateClassroomCode,
  generateParticipantId,
  generateResumeToken,
  hashToken,
  PANAS_ITEM_CODES,
} from './classroomResearch';

const PARTICIPATION_SCHEMA_VERSION = 'classroom-participation-v1';
const INSTRUMENT_VERSION = 'sam-vad-ipanas-sf-v1';
const CONSENT_VERSION = 'classroom-consent-v1';
const ARTWORK_MODEL_VERSION = 'qwen-vl-plus';
const ARTWORK_PROMPT_VERSION = 'artwork-affect-prompt-v2';
const ARTWORK_AFFECT_SCALE_VERSION = 'artwork-affect-v1';
const ASSESSMENT_ANSWER_COUNT = 13;
const MIN_VAD_SCORE = 1;
const MAX_VAD_SCORE = 9;
const MIN_PANAS_SCORE = 1;
const MAX_PANAS_SCORE = 5;
const MIN_AFFECT_SCORE = 0;
const MAX_AFFECT_SCORE = 100;
const CLASS_DURATION_MINUTES = 120;
const PRE_ASSESSMENT_OFFSET_MINUTES = 10;
const ACTIVITY_OFFSET_MINUTES = 25;
const ACTIVITY_DURATION_MINUTES = 55;
const POST_ASSESSMENT_OFFSET_MINUTES = 85;
const FEEDBACK_OFFSET_MINUTES = 100;
const MINUTE_MS = 60 * 1000;

const POSITIVE_PANAS_CODES = [
  'PANAS_ALERT',
  'PANAS_INSPIRED',
  'PANAS_DETERMINED',
  'PANAS_ATTENTIVE',
  'PANAS_ACTIVE',
] as const;
const NEGATIVE_PANAS_CODES = [
  'PANAS_UPSET',
  'PANAS_HOSTILE',
  'PANAS_ASHAMED',
  'PANAS_NERVOUS',
  'PANAS_AFRAID',
] as const;
const DIMENSION_CODES = [
  'joy',
  'calm',
  'anxiety',
  'fear',
  'solitude',
  'passion',
  'social_aversion',
  'vitality',
] as const;

type RandomSource = () => number;
type VadScores = Record<'valence' | 'arousal' | 'dominance', number>;
type SimulationTeacher = { teacherId: string; displayName: string };
export type UserFacingArtworkAnalysis = Pick<
  NonNullable<IWork['healing']>,
  'summary' | 'colorAnalysis' | 'compositionReport' | 'lineAnalysis' | 'suggestion' | 'keyColors'
>;
export type SimulationImage = {
  url: string;
  name: string;
  type: string;
  userFacingAnalysis: UserFacingArtworkAnalysis;
};
type ParticipantState = {
  preVad: VadScores;
  postVad: VadScores;
  prePanas: Record<string, number>;
  postPanas: Record<string, number>;
};
type ParticipationTiming = {
  createdAt: Date;
  preStartedAt: Date;
  activityStartedAt: Date;
  activityCompletedAt: Date;
  postStartedAt: Date;
  completedAt: Date;
};
type ParticipationInput = {
  classId: string;
  classroomCode: string;
  state: ParticipantState;
  classStart: Date;
  index: number;
  random: RandomSource;
};

export type ClassroomSimulationInput = {
  teacher: SimulationTeacher;
  authorizedTeacherIds: string[];
  images: SimulationImage[];
  participantCount: number;
  now?: Date;
  random?: RandomSource;
};

export type ClassroomSimulationBundle = {
  classroom: IClassroom;
  participants: IClassroomParticipation[];
  works: IWork[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundedScore(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}

function normal(random: RandomSource): number {
  const first = Math.max(Number.EPSILON, random());
  const second = random();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function dateAt(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * MINUTE_MS);
}

function shanghaiDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function shanghaiTime(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function buildPanas(
  positiveMean: number,
  negativeMean: number,
  random: RandomSource,
): Record<string, number> {
  const positive = Object.fromEntries(POSITIVE_PANAS_CODES.map((code) => [
    code,
    roundedScore(positiveMean + normal(random) * 0.55, MIN_PANAS_SCORE, MAX_PANAS_SCORE),
  ]));
  const negative = Object.fromEntries(NEGATIVE_PANAS_CODES.map((code) => [
    code,
    roundedScore(negativeMean + normal(random) * 0.5, MIN_PANAS_SCORE, MAX_PANAS_SCORE),
  ]));
  return { ...positive, ...negative };
}

function buildParticipantState(random: RandomSource): ParticipantState {
  const wellbeing = normal(random);
  const activation = normal(random);
  const agency = normal(random);
  const preVad = {
    valence: roundedScore(4.7 + wellbeing * 1.15 + normal(random) * 0.65, MIN_VAD_SCORE, MAX_VAD_SCORE),
    arousal: roundedScore(5 + activation * 1.25 + normal(random) * 0.7, MIN_VAD_SCORE, MAX_VAD_SCORE),
    dominance: roundedScore(4.8 + agency + wellbeing * 0.35 + normal(random) * 0.65, MIN_VAD_SCORE, MAX_VAD_SCORE),
  };
  const postVad = {
    valence: roundedScore(preVad.valence + 0.9 + normal(random) * 0.75, MIN_VAD_SCORE, MAX_VAD_SCORE),
    arousal: roundedScore(
      preVad.arousal + (5 - preVad.arousal) * 0.3 + normal(random) * 0.65,
      MIN_VAD_SCORE,
      MAX_VAD_SCORE,
    ),
    dominance: roundedScore(preVad.dominance + 0.65 + normal(random) * 0.7, MIN_VAD_SCORE, MAX_VAD_SCORE),
  };
  const prePositive = 2.8 + (preVad.valence - 5) * 0.28 + normal(random) * 0.25;
  const preNegative = 2.5 + (5 - preVad.valence) * 0.25 + Math.max(0, preVad.arousal - 5) * 0.12;
  return {
    preVad,
    postVad,
    prePanas: buildPanas(prePositive, preNegative, random),
    postPanas: buildPanas(prePositive + 0.55, preNegative - 0.45, random),
  };
}

function assessment(
  vad: VadScores,
  panas: Record<string, number>,
  startedAt: Date,
  submittedAt: Date,
  random: RandomSource,
): IAssessmentRecord {
  return {
    status: 'submitted',
    currentPage: 3,
    answeredCount: ASSESSMENT_ANSWER_COUNT,
    vad,
    panas,
    locale: 'zh-CN',
    startedAt,
    submittedAt,
    durationMs: roundedScore(210000 + normal(random) * 45000, 90000, 420000),
    clientRecovered: random() < 0.08,
    submitIdempotencyKey: randomUUID(),
  };
}

function uniqueClassroomCodes(count: number): string[] {
  const codes = new Set<string>();
  while (codes.size < count) codes.add(generateClassroomCode());
  return [...codes];
}

function profile(index: number, random: RandomSource): IClassroomParticipantProfile {
  const genders: IClassroomParticipantProfile['gender'][] = ['female', 'male'];
  const experience: NonNullable<IClassroomParticipantProfile['artExperience']>[] = [
    'none',
    'occasional',
    'regular',
  ];
  const genderIndex = Math.min(genders.length - 1, Math.floor(random() * genders.length));
  const experienceIndex = Math.min(experience.length - 1, Math.floor(random() * experience.length));
  return {
    gender: genders[genderIndex] ?? 'female',
    artExperience: experience[experienceIndex] ?? 'none',
    ageGroup: index % 5 === 0 ? '25-34' : '18-24',
  };
}

function feedbackFit(random: RandomSource): 'mostly' | 'partly' | 'not_really' | 'unsure' {
  const value = random();
  if (value < 0.55) return 'mostly';
  if (value < 0.84) return 'partly';
  if (value < 0.94) return 'not_really';
  return 'unsure';
}

function participationTiming(classStart: Date, index: number): ParticipationTiming {
  const activityStartedAt = dateAt(classStart, ACTIVITY_OFFSET_MINUTES + index % 5);
  return {
    createdAt: dateAt(classStart, index % 8),
    preStartedAt: dateAt(classStart, PRE_ASSESSMENT_OFFSET_MINUTES + index % 6),
    activityStartedAt,
    activityCompletedAt: dateAt(activityStartedAt, ACTIVITY_DURATION_MINUTES + index % 9),
    postStartedAt: dateAt(classStart, POST_ASSESSMENT_OFFSET_MINUTES + index % 7),
    completedAt: dateAt(classStart, FEEDBACK_OFFSET_MINUTES + index % 10),
  };
}

function participationAssessments(
  state: ParticipantState,
  timing: ParticipationTiming,
  random: RandomSource,
): Pick<IClassroomParticipation, 'preAssessment' | 'postAssessment'> {
  return {
    preAssessment: assessment(
      state.preVad,
      state.prePanas,
      timing.preStartedAt,
      dateAt(timing.preStartedAt, 4),
      random,
    ),
    postAssessment: assessment(
      state.postVad,
      state.postPanas,
      timing.postStartedAt,
      dateAt(timing.postStartedAt, 4),
      random,
    ),
  };
}

function participationFeedback(random: RandomSource): NonNullable<IClassroomParticipation['feedback']> {
  return {
    fit: feedbackFit(random),
    comment: '作品回响与我当下的感受有不同程度的贴合。',
    allowCommentUse: random() < 0.7,
    allowArtworkUse: random() < 0.8,
  };
}

function buildParticipation(input: ParticipationInput): IClassroomParticipation {
  const { classId, classroomCode, state, classStart, index, random } = input;
  const teacherUpload = random() < 0.18;
  const timing = participationTiming(classStart, index);
  return {
    participantId: generateParticipantId(),
    classId,
    classroomCode,
    resumeTokenHash: hashToken(generateResumeToken()),
    joinIdempotencyKey: randomUUID(),
    source: 'student',
    instrumentVersion: INSTRUMENT_VERSION,
    dataSchemaVersion: PARTICIPATION_SCHEMA_VERSION,
    currentStage: 'completed',
    consentedAt: dateAt(timing.createdAt, 1),
    consentVersion: CONSENT_VERSION,
    consentIdempotencyKey: randomUUID(),
    profile: profile(index, random),
    profileIdempotencyKey: randomUUID(),
    ...participationAssessments(state, timing, random),
    activityStartedAt: timing.activityStartedAt,
    activityCompletedAt: timing.activityCompletedAt,
    activityIdempotencyKey: randomUUID(),
    artworkStatus: teacherUpload ? 'teacher_uploaded' : 'student_uploaded',
    artworkId: randomUUID(),
    uploadReason: teacherUpload ? 'student_upload_unavailable' : undefined,
    uploadIdempotencyKey: randomUUID(),
    feedback: participationFeedback(random),
    feedbackIdempotencyKey: randomUUID(),
    completionIdempotencyKey: randomUUID(),
    participantFlowCompleted: true,
    researchRecordComplete: true,
    syncStatus: 'synced',
    lastActiveAt: timing.completedAt,
    createdAt: timing.createdAt,
    updatedAt: timing.completedAt,
  };
}

function panasMean(panas: Record<string, number>, codes: readonly string[]): number {
  return codes.reduce((sum, code) => sum + (panas[code] ?? 0), 0) / codes.length;
}

function affectScore(value: number, random: RandomSource, noise = 10): number {
  return roundedScore(value + normal(random) * noise, MIN_AFFECT_SCORE, MAX_AFFECT_SCORE);
}

function buildDimensionScores(state: ParticipantState, random: RandomSource): Record<string, number> {
  const positive = panasMean(state.postPanas, POSITIVE_PANAS_CODES);
  const negative = panasMean(state.postPanas, NEGATIVE_PANAS_CODES);
  return {
    joy: affectScore(8 + state.postVad.valence * 9, random),
    calm: affectScore(88 - state.postVad.arousal * 7 + state.postVad.valence * 3, random),
    anxiety: affectScore(5 + negative * 17 + Math.max(0, state.postVad.arousal - 5) * 3, random),
    fear: affectScore(4 + (state.postPanas.PANAS_AFRAID ?? negative) * 17, random, 12),
    solitude: affectScore(48 + negative * 7 - positive * 6, random, 14),
    passion: affectScore(5 + panasMean(state.postPanas, ['PANAS_INSPIRED', 'PANAS_DETERMINED', 'PANAS_ACTIVE']) * 19, random),
    social_aversion: affectScore(38 + (state.postPanas.PANAS_HOSTILE ?? negative) * 9 - positive * 5, random, 13),
    vitality: affectScore(5 + panasMean(state.postPanas, ['PANAS_ACTIVE', 'PANAS_ALERT']) * 19, random),
  };
}

function evidence(code: string): string[] {
  const values: Record<string, string> = {
    joy: '明亮色块与向外展开的构图形成轻快感。',
    calm: '留白、低对比区域与平缓线条形成稳定节奏。',
    anxiety: '局部密集线条和方向冲突带来紧张感。',
    fear: '暗部聚集和收缩形态形成警觉感。',
    solitude: '主体与周围空间分离，呈现独处氛围。',
    passion: '高饱和色彩与强方向笔触形成投入感。',
    social_aversion: '边界阻隔和封闭形态呈现距离感。',
    vitality: '重复节奏和上扬线条形成动势。',
  };
  return [values[code] ?? '画面包含可观察的形式线索。'];
}

function buildArtworkAffect(state: ParticipantState, generatedAt: Date, random: RandomSource) {
  const scores = buildDimensionScores(state, random);
  const dimensions = Object.fromEntries(DIMENSION_CODES.map((code) => [code, {
    score: scores[code] ?? null,
    assessable: true,
    evidence: evidence(code),
  }]));
  const vad = {
    valence: affectScore(8 + state.postVad.valence * 10, random, 9),
    arousal: affectScore(8 + state.postVad.arousal * 10, random, 10),
    dominance: affectScore(8 + state.postVad.dominance * 10, random, 10),
    assessable: true,
    evidence: ['综合色彩、线条方向与画面重心生成作品表达标注。'],
    interpretation: '作品表达呈现混合的愉悦度、唤醒度与掌控感线索。',
  };
  return {
    scores,
    artworkAffect: {
      construct: 'perceived_expressed_affect' as const,
      scoreSource: 'model_direct' as const,
      modelVersion: ARTWORK_MODEL_VERSION,
      promptVersion: ARTWORK_PROMPT_VERSION,
      scaleVersion: ARTWORK_AFFECT_SCALE_VERSION,
      generatedAt,
      dimensions,
      vad,
    },
  };
}

function buildHealing(
  state: ParticipantState,
  participant: IClassroomParticipation,
  image: SimulationImage,
  generatedAt: Date,
  random: RandomSource,
): NonNullable<IWork['healing']> {
  const affect = buildArtworkAffect(state, generatedAt, random);
  const source = image.userFacingAnalysis;
  return {
    scores: affect.scores,
    summary: source.summary,
    colorAnalysis: source.colorAnalysis,
    status: 'success',
    isPublic: false,
    submittedAt: participant.activityCompletedAt,
    analyzedAt: generatedAt,
    compositionReport: source.compositionReport,
    lineAnalysis: source.lineAnalysis,
    suggestion: source.suggestion,
    keyColors: source.keyColors,
    vad: {
      valence: affect.artworkAffect.vad.valence,
      arousal: affect.artworkAffect.vad.arousal,
      dominance: affect.artworkAffect.vad.dominance,
      quadrant: 'mixed_affect',
      interpretation: affect.artworkAffect.vad.interpretation,
    },
    artworkAffect: affect.artworkAffect,
  };
}

function buildWork(
  classroom: IClassroom,
  participant: IClassroomParticipation,
  state: ParticipantState,
  image: SimulationImage,
  random: RandomSource,
): IWork {
  const generatedAt = dateAt(participant.postAssessment.submittedAt ?? classroom.scheduledEndAt, 2);
  const uploaderRole = participant.artworkStatus === 'teacher_uploaded' ? 'teacher' : 'student';
  const { userFacingAnalysis: _userFacingAnalysis, ...imageData } = image;
  return {
    workId: participant.artworkId ?? randomUUID(),
    authorId: null,
    desc: '自由绘画课堂作品。',
    images: [imageData],
    tags: ['自由绘画', '情绪表达', '课堂作品'],
    location: classroom.locationText,
    status: 'published',
    featured: false,
    onWall: false,
    classroomId: classroom.classId,
    participantId: participant.participantId,
    uploaderRole,
    uploadReason: participant.uploadReason,
    contentHash: createHash('sha256').update(`${classroom.classId}:${participant.participantId}`).digest('hex'),
    healing: buildHealing(state, participant, image, generatedAt, random),
    createdAt: participant.activityCompletedAt ?? classroom.scheduledEndAt,
    updatedAt: generatedAt,
  };
}

function buildClassroom(input: ClassroomSimulationInput, classStart: Date): IClassroom {
  const classEnd = dateAt(classStart, CLASS_DURATION_MINUTES);
  const finalizedAt = dateAt(classEnd, 15);
  return {
    classId: randomUUID(),
    accessCode: generateAccessCode(),
    createdByTeacherId: input.teacher.teacherId,
    authorizedTeacherIds: [...new Set(input.authorizedTeacherIds)].filter(
      (teacherId) => teacherId !== input.teacher.teacherId,
    ),
    courseName: '艺术疗愈课堂',
    sessionTitle: `色彩与当下情绪 · ${shanghaiDate(classStart)}`,
    activityTheme: '通过自由绘画观察情绪在色彩、线条与空间中的表达',
    classDate: shanghaiDate(classStart),
    startTime: shanghaiTime(classStart),
    endTime: shanghaiTime(classEnd),
    timezone: 'Asia/Shanghai',
    scheduledStartAt: classStart,
    scheduledEndAt: classEnd,
    gradeLevel: 'mixed_adult',
    teacherDisplayName: input.teacher.displayName,
    locationText: '艺术教室',
    status: 'closed',
    gracePeriodMinutes: 30,
    consentVersion: CONSENT_VERSION,
    instrumentVersion: INSTRUMENT_VERSION,
    openedAt: classStart,
    closedByTeacherAt: classEnd,
    gracePeriodEndsAt: classEnd,
    finalizedAt,
    finalizedBy: 'teacher',
    createdAt: dateAt(classStart, -60),
    updatedAt: finalizedAt,
  };
}

export function buildClassroomSimulation(input: ClassroomSimulationInput): ClassroomSimulationBundle {
  if (input.participantCount < 3) throw new Error('Participant count must be at least 3');
  if (input.images.length === 0) throw new Error('At least one reusable artwork image is required');
  const random = input.random ?? Math.random;
  const now = input.now ?? new Date();
  const classStart = dateAt(now, -(24 * 60 + CLASS_DURATION_MINUTES));
  const classroom = buildClassroom(input, classStart);
  const codes = uniqueClassroomCodes(input.participantCount);
  const states = Array.from({ length: input.participantCount }, () => buildParticipantState(random));
  const participants = states.map((state, index) => buildParticipation({
    classId: classroom.classId,
    classroomCode: codes[index] ?? generateClassroomCode(),
    state,
    classStart,
    index,
    random,
  }));
  const works = participants.map((participant, index) => buildWork(
    classroom,
    participant,
    states[index] ?? buildParticipantState(random),
    input.images[index % input.images.length] as SimulationImage,
    random,
  ));
  return { classroom, participants, works };
}

export const CLASSROOM_SIMULATION_PANAS_CODES = PANAS_ITEM_CODES;
