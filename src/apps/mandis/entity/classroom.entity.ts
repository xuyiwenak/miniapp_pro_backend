import { Schema } from 'mongoose';

export type ClassroomStatus = 'draft' | 'open' | 'closing' | 'closed';

export type ClassroomGradeLevel =
  | 'undergraduate_1'
  | 'undergraduate_2'
  | 'undergraduate_3'
  | 'undergraduate_4'
  | 'postgraduate'
  | 'continuing_education'
  | 'mixed_adult'
  | 'other_adult';

export interface IClassroom {
  classId: string;
  accessCode?: string;
  createdByTeacherId: string;
  courseName: string;
  sessionTitle: string;
  activityTheme: string;
  classDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  gradeLevel: ClassroomGradeLevel;
  teacherDisplayName: string;
  locationText: string;
  status: ClassroomStatus;
  gracePeriodMinutes: number;
  consentVersion: string;
  instrumentVersion: string;
  openedAt?: Date;
  closedByTeacherAt?: Date;
  gracePeriodEndsAt?: Date;
  finalizedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const ClassroomSchema = new Schema<IClassroom>(
  {
    classId: { type: String, required: true, unique: true },
    accessCode: { type: String, unique: true, sparse: true },
    createdByTeacherId: { type: String, required: true, index: true },
    courseName: { type: String, required: true, maxlength: 80 },
    sessionTitle: { type: String, required: true, maxlength: 80 },
    activityTheme: { type: String, required: true, maxlength: 120 },
    classDate: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    timezone: { type: String, required: true, default: 'Asia/Shanghai' },
    scheduledStartAt: { type: Date, required: true, index: true },
    scheduledEndAt: { type: Date, required: true },
    gradeLevel: { type: String, required: true },
    teacherDisplayName: { type: String, required: true, maxlength: 40 },
    locationText: { type: String, required: true, maxlength: 80 },
    status: {
      type: String,
      enum: ['draft', 'open', 'closing', 'closed'],
      default: 'draft',
      required: true,
      index: true,
    },
    gracePeriodMinutes: { type: Number, required: true, default: 30 },
    consentVersion: {
      type: String,
      required: true,
      default: 'classroom-consent-v1',
    },
    instrumentVersion: {
      type: String,
      required: true,
      default: 'sam-vad-ipanas-sf-v1',
    },
    openedAt: { type: Date },
    closedByTeacherAt: { type: Date },
    gracePeriodEndsAt: { type: Date },
    finalizedAt: { type: Date },
  },
  { timestamps: true }
);

ClassroomSchema.index({ createdByTeacherId: 1, createdAt: -1 });
ClassroomSchema.index({ status: 1, gracePeriodEndsAt: 1 });
