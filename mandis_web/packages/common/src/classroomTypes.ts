export type Locale = 'zh-CN' | 'en';

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
  accessCode?: string;
  timezone: 'Asia/Shanghai';
  status: ClassroomStatus;
  gracePeriodMinutes: number;
  gracePeriodEndsAt?: string;
  createdAt: string;
};

export type ClassroomInput = Omit<
  ClassroomRecord,
  'classId' | 'accessCode' | 'status' | 'gracePeriodEndsAt' | 'createdAt'
>;

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
