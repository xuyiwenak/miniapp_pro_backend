import { Schema } from 'mongoose';

export type TeacherDataExportFormat = 'xlsx' | 'csv';
export const CURRENT_TEACHER_DATA_EXPORT_DATASET_VERSION =
  'classroom-assessment-results-v2' as const;
export type TeacherDataExportDatasetVersion =
  | 'classroom-assessment-results-v1'
  | typeof CURRENT_TEACHER_DATA_EXPORT_DATASET_VERSION;

export interface ITeacherDataExportAudit {
  exportId: string;
  teacherId: string;
  classId: string;
  format: TeacherDataExportFormat;
  datasetVersion: TeacherDataExportDatasetVersion;
  recordCount: number;
  exportedAt: Date;
  fileSha256: string;
  createdAt: Date;
  updatedAt: Date;
}

export const TeacherDataExportAuditSchema = new Schema<ITeacherDataExportAudit>(
  {
    exportId: { type: String, required: true, unique: true },
    teacherId: { type: String, required: true, index: true },
    classId: { type: String, required: true, index: true },
    format: { type: String, enum: ['xlsx', 'csv'], required: true },
    datasetVersion: {
      type: String,
      enum: [
        'classroom-assessment-results-v1',
        CURRENT_TEACHER_DATA_EXPORT_DATASET_VERSION,
      ],
      required: true,
    },
    recordCount: { type: Number, required: true, min: 0 },
    exportedAt: { type: Date, required: true },
    fileSha256: { type: String, required: true },
  },
  { timestamps: true },
);

TeacherDataExportAuditSchema.index({ teacherId: 1, classId: 1, exportedAt: -1 });
