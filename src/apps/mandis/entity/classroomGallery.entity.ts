import { Schema } from 'mongoose';
import type { ModuleCode, IFeedbackEvaluation } from './classroomReflection.entity';

export const GALLERY_VERSION = 'classroom-gallery-v1';
export interface IGalleryWork {
  galleryId: string; classId: string; participantId: string; workId: string; sourceHash: string;
  imageKey: string; contentHash: string;
  status: 'preparing' | 'review' | 'approved' | 'rejected' | 'failed' | 'withdrawn';
  imageApproved?: boolean;
  analysisRunId?: string; reportJson?: string; shownModules: ModuleCode[];
  reviewerId?: string; reviewedAt?: Date; modelVersion?: string; errorCode?: string;
  promptVersion?: string; scaleVersion?: string;
}
export interface IPeerAnswers {
  valence?: number; arousal?: number; dominance?: number; emotions: string[];
  otherEmotion?: string; confidence?: number; comment?: string;
}
export interface IPeerReview {
  assignmentId: string; classId: string; galleryId: string; participantId: string;
  instrumentVersion: string; consentVersion: string; consentedAt: Date;
  independent?: IPeerAnswers; independentSubmittedAt?: Date; independentHash?: string;
  moduleResponses?: IFeedbackEvaluation['moduleResponses']; feedbackSubmittedAt?: Date;
  feedbackHash?: string; analysisRunId?: string; reportViewedAt?: Date;
  feedbackHistory: Array<{ moduleResponses: IFeedbackEvaluation['moduleResponses']; submittedAt: Date;
    analysisRunId?: string; hash?: string }>;
  requestReceipts: Array<{ key: string; hash: string }>;
}
const schemaOptions = { timestamps: true, versionKey: false } as const;
export const GalleryWorkSchema = new Schema<IGalleryWork>({
  galleryId: { type: String, required: true, unique: true }, classId: { type: String, required: true },
  participantId: { type: String, required: true }, workId: { type: String, required: true },
  sourceHash: { type: String, required: true }, imageKey: { type: String, required: true },
  contentHash: { type: String, required: true },
  status: { type: String, enum: ['preparing', 'review', 'approved', 'rejected', 'failed', 'withdrawn'], required: true },
  imageApproved: { type: Boolean, default: false },
  analysisRunId: String, reportJson: String, shownModules: [String], reviewerId: String,
  reviewedAt: Date, modelVersion: String, errorCode: String, promptVersion: String, scaleVersion: String,
}, schemaOptions);
GalleryWorkSchema.index({ classId: 1, status: 1, galleryId: 1 });
GalleryWorkSchema.index({ workId: 1, sourceHash: 1 });
const AnswerSchema = new Schema<IPeerAnswers>({
  valence: Number, arousal: Number, dominance: Number, emotions: [String], otherEmotion: String,
  confidence: Number, comment: String,
}, { _id: false });
export const PeerReviewSchema = new Schema<IPeerReview>({
  assignmentId: { type: String, required: true, unique: true }, classId: { type: String, required: true },
  galleryId: { type: String, required: true }, participantId: { type: String, required: true },
  instrumentVersion: { type: String, required: true }, consentVersion: { type: String, required: true },
  consentedAt: { type: Date, required: true }, independent: AnswerSchema,
  independentSubmittedAt: Date, independentHash: String, moduleResponses: Schema.Types.Mixed,
  feedbackSubmittedAt: Date, feedbackHash: String, analysisRunId: String, reportViewedAt: Date,
  feedbackHistory: { type: [new Schema({ moduleResponses: Schema.Types.Mixed, submittedAt: Date,
    analysisRunId: String, hash: String }, { _id: false })], default: [] },
  requestReceipts: { type: [new Schema({ key: String, hash: String }, { _id: false })], default: [] },
}, schemaOptions);
PeerReviewSchema.index({ classId: 1, participantId: 1, galleryId: 1 }, { unique: true });
PeerReviewSchema.index({ classId: 1, galleryId: 1, independentSubmittedAt: 1 });
