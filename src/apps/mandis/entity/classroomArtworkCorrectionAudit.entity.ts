import { Schema } from 'mongoose';

export type ClassroomArtworkCorrectionType = 'late_upload' | 'replace';

export interface IClassroomArtworkCorrectionAudit {
  correctionId: string;
  classId: string;
  participantId: string;
  classroomCode: string;
  correctedByTeacherId: string;
  idempotencyKey: string;
  correctionType: ClassroomArtworkCorrectionType;
  reason: string;
  artworkId: string;
  previousImageUrl?: string;
  replacementImageUrl: string;
  previousContentHash?: string;
  replacementContentHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export const ClassroomArtworkCorrectionAuditSchema =
  new Schema<IClassroomArtworkCorrectionAudit>(
    {
      correctionId: { type: String, required: true, unique: true },
      classId: { type: String, required: true, index: true },
      participantId: { type: String, required: true, index: true },
      classroomCode: { type: String, required: true },
      correctedByTeacherId: { type: String, required: true, index: true },
      idempotencyKey: { type: String, required: true },
      correctionType: {
        type: String,
        enum: ['late_upload', 'replace'],
        required: true,
      },
      reason: { type: String, required: true, maxlength: 300 },
      artworkId: { type: String, required: true },
      previousImageUrl: { type: String },
      replacementImageUrl: { type: String, required: true },
      previousContentHash: { type: String },
      replacementContentHash: { type: String, required: true },
    },
    { timestamps: true, collection: 'mandis_classroom_artwork_correction_audits' }
  );

ClassroomArtworkCorrectionAuditSchema.index({ classId: 1, createdAt: -1 });
ClassroomArtworkCorrectionAuditSchema.index({ classId: 1, classroomCode: 1 });
ClassroomArtworkCorrectionAuditSchema.index(
  { classId: 1, idempotencyKey: 1 },
  { unique: true }
);
