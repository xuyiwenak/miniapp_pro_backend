import { Schema } from 'mongoose';

export type ParticipationStage =
  | 'preparation'
  | 'pre_assessment'
  | 'activity_in_progress'
  | 'artwork_upload'
  | 'post_assessment'
  | 'ai_echo'
  | 'completed';

export type ArtworkSubmissionStatus =
  | 'not_started'
  | 'student_uploading'
  | 'student_uploaded'
  | 'teacher_upload_pending'
  | 'teacher_uploaded'
  | 'not_provided';

export type ClassroomGender = 'male' | 'female';

export interface IClassroomParticipantProfile {
  gender: ClassroomGender;
  artExperience?: 'none' | 'occasional' | 'regular';
  ageGroup?: string;
}

export interface IAssessmentRecord {
  status: 'not_started' | 'in_progress' | 'submitted';
  currentPage?: 1 | 2 | 3;
  answeredCount: number;
  vad?: Record<string, number>;
  panas?: Record<string, number>;
  locale?: 'zh-CN' | 'en';
  startedAt?: Date;
  submittedAt?: Date;
  durationMs?: number;
  clientRecovered?: boolean;
  submitIdempotencyKey?: string;
}

export interface IClassroomParticipation {
  participantId: string;
  classId: string;
  classroomCode: string;
  resumeTokenHash: string;
  joinIdempotencyKey?: string;
  source: 'student' | 'artwork_only';
  instrumentVersion: string;
  dataSchemaVersion: string;
  currentStage: ParticipationStage;
  consentedAt?: Date;
  consentVersion?: string;
  consentIdempotencyKey?: string;
  profile?: IClassroomParticipantProfile;
  profileIdempotencyKey?: string;
  preAssessment: IAssessmentRecord;
  postAssessment: IAssessmentRecord;
  activityStartedAt?: Date;
  activityCompletedAt?: Date;
  activityIdempotencyKey?: string;
  artworkStatus: ArtworkSubmissionStatus;
  artworkId?: string;
  uploadReason?: string;
  uploadIdempotencyKey?: string;
  teacherUploadAudit?: {
    participantId: string;
    classroomCode: string;
    artworkId: string;
    uploaderRole: 'teacher';
    uploaderTeacherId: string;
    reason: string;
    uploadedAt: Date;
    idempotencyKey: string;
  };
  feedback?: {
    fit: 'mostly' | 'partly' | 'not_really' | 'unsure';
    comment?: string;
    allowCommentUse: boolean;
    allowArtworkUse: boolean;
  };
  feedbackIdempotencyKey?: string;
  completionIdempotencyKey?: string;
  participantFlowCompleted: boolean;
  researchRecordComplete: boolean;
  syncStatus: 'synced' | 'pending' | 'failed';
  lastActiveAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AssessmentSchema = new Schema<IAssessmentRecord>(
  {
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'submitted'],
      default: 'not_started',
    },
    currentPage: { type: Number, min: 1, max: 3 },
    answeredCount: { type: Number, default: 0 },
    vad: { type: Schema.Types.Mixed },
    panas: { type: Schema.Types.Mixed },
    locale: { type: String, enum: ['zh-CN', 'en'] },
    startedAt: { type: Date },
    submittedAt: { type: Date },
    durationMs: { type: Number },
    clientRecovered: { type: Boolean },
    submitIdempotencyKey: { type: String },
  },
  { _id: false }
);

export const ClassroomParticipationSchema = new Schema<IClassroomParticipation>(
  {
    participantId: { type: String, required: true, unique: true },
    classId: { type: String, required: true, index: true },
    classroomCode: { type: String, required: true },
    resumeTokenHash: { type: String, required: true, unique: true },
    joinIdempotencyKey: { type: String },
    source: {
      type: String,
      enum: ['student', 'artwork_only'],
      default: 'student',
    },
    instrumentVersion: {
      type: String,
      required: true,
      default: 'sam-vad-ipanas-sf-v1',
    },
    dataSchemaVersion: {
      type: String,
      required: true,
      default: 'classroom-participation-v1',
    },
    currentStage: {
      type: String,
      required: true,
      default: 'preparation',
      index: true,
    },
    consentedAt: { type: Date },
    consentVersion: { type: String },
    consentIdempotencyKey: { type: String },
    profile: { type: Schema.Types.Mixed },
    profileIdempotencyKey: { type: String },
    preAssessment: {
      type: AssessmentSchema,
      default: () => ({ status: 'not_started', answeredCount: 0 }),
    },
    postAssessment: {
      type: AssessmentSchema,
      default: () => ({ status: 'not_started', answeredCount: 0 }),
    },
    activityStartedAt: { type: Date },
    activityCompletedAt: { type: Date },
    activityIdempotencyKey: { type: String },
    artworkStatus: {
      type: String,
      enum: [
        'not_started',
        'student_uploading',
        'student_uploaded',
        'teacher_upload_pending',
        'teacher_uploaded',
        'not_provided',
      ],
      default: 'not_started',
      index: true,
    },
    artworkId: { type: String },
    uploadReason: { type: String },
    uploadIdempotencyKey: { type: String },
    teacherUploadAudit: {
      type: new Schema(
        {
          participantId: { type: String, required: true },
          classroomCode: { type: String, required: true },
          artworkId: { type: String, required: true },
          uploaderRole: { type: String, enum: ['teacher'], required: true },
          uploaderTeacherId: { type: String, required: true },
          reason: { type: String, required: true },
          uploadedAt: { type: Date, required: true },
          idempotencyKey: { type: String, required: true },
        },
        { _id: false }
      ),
    },
    feedback: {
      type: new Schema(
        {
          fit: {
            type: String,
            enum: ['mostly', 'partly', 'not_really', 'unsure'],
            required: true,
          },
          comment: { type: String, maxlength: 300 },
          allowCommentUse: { type: Boolean, required: true, default: false },
          allowArtworkUse: { type: Boolean, required: true, default: false },
        },
        { _id: false }
      ),
    },
    feedbackIdempotencyKey: { type: String },
    completionIdempotencyKey: { type: String },
    participantFlowCompleted: { type: Boolean, default: false, index: true },
    researchRecordComplete: { type: Boolean, default: false, index: true },
    syncStatus: {
      type: String,
      enum: ['synced', 'pending', 'failed'],
      default: 'synced',
    },
    lastActiveAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

ClassroomParticipationSchema.index({ classId: 1, classroomCode: 1 }, { unique: true });
ClassroomParticipationSchema.index({ classId: 1, joinIdempotencyKey: 1 }, { unique: true, sparse: true });
ClassroomParticipationSchema.index({ classId: 1, currentStage: 1 });
ClassroomParticipationSchema.index({ classId: 1, artworkStatus: 1 });
