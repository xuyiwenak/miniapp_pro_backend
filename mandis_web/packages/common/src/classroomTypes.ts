export type Locale = 'zh-CN' | 'en';

export type ParticipantGender = 'male' | 'female';

export type ParticipantProfile = {
  gender: ParticipantGender;
  artExperience: 'none' | 'occasional' | 'regular';
};

export type ClassroomInfo = {
  courseName: string;
  sessionTitle: string;
  activityTheme: string;
  classDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
  gradeLevel: string;
  teacherDisplayName: string;
  locationText: string;
  status: 'draft' | 'open' | 'closing' | 'closed';
};

export type AssessmentRecord = {
  status: 'not_started' | 'in_progress' | 'submitted';
  currentPage?: 1 | 2 | 3;
  answeredCount: number;
  vad?: Record<string, number>;
  panas?: Record<string, number>;
  locale?: Locale;
  startedAt?: string;
  submittedAt?: string;
};

export type ParticipationState = {
  resumeToken?: string;
  participantId: string;
  classroomCode?: string;
  currentStage: string;
  consented: boolean;
  profileCompleted: boolean;
  preAssessment: AssessmentRecord;
  postAssessment: AssessmentRecord;
  artworkStatus: string;
  artworkId?: string;
  participantFlowCompleted: boolean;
  researchRecordComplete: boolean;
  syncStatus: string;
};

export type AssessmentAnswers = {
  vad: Record<string, number>;
  panas: Record<string, number>;
};

export type EchoResult = {
  status: 'none' | 'pending' | 'success' | 'failed';
  artworkStatus: string;
  classroomCode?: string;
  coverUrl?: string;
  summary?: string;
  colorAnalysis?: string;
  compositionReport?: string;
  suggestion?: string;
};

export type ClassroomStatus = 'draft' | 'open' | 'closing' | 'closed';

export type ClassroomRecord = ClassroomInfo & {
  classId: string;
  createdByTeacherId: string;
  authorizedTeacherIds: string[];
  accessCode?: string;
  timezone: 'Asia/Shanghai';
  status: ClassroomStatus;
  gracePeriodMinutes: number;
  gracePeriodEndsAt?: string;
  createdAt: string;
};

export type ClassroomInput = Omit<
  ClassroomRecord,
  | 'classId'
  | 'createdByTeacherId'
  | 'authorizedTeacherIds'
  | 'accessCode'
  | 'status'
  | 'gracePeriodEndsAt'
  | 'createdAt'
>;

export type ClassroomCollaborator = {
  teacherId: string;
  displayName: string;
  organization?: string;
};

export type ArtworkCorrectionAudit = {
  correctionId: string;
  classroomCode: string;
  correctedByTeacherId: string;
  correctionType: 'late_upload' | 'replace';
  reason: string;
  artworkId: string;
  createdAt: string;
};

export type AssessmentCounts = {
  notStarted: number;
  inProgress: number;
  page1: number;
  page2: number;
  page3: number;
  submitted: number;
  answeredTotal: number;
};

export type ClassroomProgress = {
  generatedAt: string;
  classStatus: ClassroomStatus;
  gracePeriodEndsAt?: string;
  joinedTotal: number;
  activeNow: number;
  completedTotal: number;
  currentStageCounts: Record<string, number>;
  preAssessmentCounts: AssessmentCounts;
  postAssessmentCounts: AssessmentCounts;
  artworkCounts: Record<'studentUploaded' | 'teacherPending' | 'teacherUploaded' | 'notProvided', number>;
  issueCounts: Record<'pendingSync' | 'failedSync' | 'aiFailed' | 'missingPre' | 'missingPost' | 'artworkOnly', number>;
  researchCounts: { completePairs: number; missingArtwork: number };
};

export type PendingArtwork = {
  classroomCode: string;
  currentStage: string;
  preSubmitted: boolean;
  postSubmitted: boolean;
  artworkStatus: string;
  joinedAt: string;
  lastActiveAt: string;
};

export type DescriptiveStatistics = {
  count: number;
  mean: number | null;
  median: number | null;
  standardDeviation: number | null;
};

export type AssessmentMeasureCode =
  | 'valence'
  | 'arousal'
  | 'dominance'
  | 'positiveAffect'
  | 'negativeAffect';

export type AssessmentMeasureSummary = {
  code: AssessmentMeasureCode;
  label: string;
  scaleMin: number;
  scaleMax: number;
  pre: DescriptiveStatistics;
  post: DescriptiveStatistics;
  delta: DescriptiveStatistics;
  changeCounts: { increased: number; unchanged: number; decreased: number };
};

export type InstrumentResultGroup = {
  instrumentVersion: string;
  participantCount: number;
  assessmentPairedCount: number;
  measures: AssessmentMeasureSummary[];
  narrative: string;
};

export type ClassroomAssessmentSummary = {
  generatedAt: string;
  dataStatus: 'provisional' | 'final';
  classStatus: 'closing' | 'closed';
  finalizedAt?: string;
  datasetVersion: 'classroom-assessment-results-v2';
  missingValuePolicy: 'not_imputed';
  disclaimer: string;
  participantCount: number;
  preSubmittedCount: number;
  postSubmittedCount: number;
  assessmentPairedCount: number;
  researchRecordCompleteCount: number;
  instrumentGroups: InstrumentResultGroup[];
  artworkAffectSummary: ArtworkAffectSummary;
};

export type ArtworkAffectScoreSource =
  | 'model_direct'
  | 'derived_from_energy'
  | 'default'
  | 'legacy_unverified';

export type ArtworkAffectExclusionReason =
  | 'missing'
  | 'analysis_incomplete'
  | 'default_scores'
  | 'derived_scores'
  | 'legacy_unverified'
  | 'insufficient_evidence';

export type ArtworkAffectDimension = {
  score: number | null;
  assessable: boolean;
  evidence: string[];
};

export type ArtworkAffect = {
  construct: 'perceived_expressed_affect';
  scoreSource: ArtworkAffectScoreSource;
  modelVersion: string;
  promptVersion: string;
  scaleVersion: string;
  generatedAt: string;
  dimensions: Record<string, ArtworkAffectDimension>;
  vad: {
    valence: number | null;
    arousal: number | null;
    dominance: number | null;
    assessable: boolean;
    evidence: string[];
    interpretation: string;
  };
};

export type ArtworkAffectAssociation = {
  dimensionCode: string;
  dimensionLabel: string;
  targetCode: string;
  targetLabel: string;
  strength: 'strong' | 'moderate' | 'limited';
  direction: 'same' | 'inverse';
  sampleSize: number;
  correlation: number | null;
};

export type ArtworkAffectSummary = {
  analysisSuccessCount: number;
  researchEligibleCount: number;
  excludedCount: number;
  missingCount: number;
  dimensions: Array<{
    code: string;
    label: string;
    count: number;
    mean: number | null;
    dominantCount: number;
  }>;
  associations: ArtworkAffectAssociation[];
  feedbackCounts: Record<'mostly' | 'partly' | 'not_really' | 'unsure', number>;
};

export type AssessmentParticipantRow = {
  classroomCode: string;
  instrumentVersion: string;
  dataSchemaVersion: string;
  consentVersion: string | null;
  source: 'student' | 'artwork_only';
  gender: ParticipantGender | null;
  artExperience: string | null;
  preSubmitted: boolean;
  postSubmitted: boolean;
  assessmentPaired: boolean;
  researchRecordComplete: boolean;
  scores: Record<string, number | null>;
  artworkStatus: string;
  uploaderRole: 'student' | 'teacher' | null;
  aiStatus: 'none' | 'pending' | 'success' | 'failed';
  artworkAffectScoreSource: ArtworkAffectScoreSource | null;
  artworkAffectResearchEligible: boolean;
  artworkAffectExclusionReason: ArtworkAffectExclusionReason | null;
  feedbackFit: 'mostly' | 'partly' | 'not_really' | 'unsure' | null;
  uploadReason: string | null;
  preDurationMs: number | null;
  postDurationMs: number | null;
  preClientRecovered: boolean;
  postClientRecovered: boolean;
};

export type AssessmentParticipantPage = {
  list: AssessmentParticipantRow[];
  total: number;
  page: number;
  pageSize: number;
  dataStatus: 'provisional' | 'final';
};
