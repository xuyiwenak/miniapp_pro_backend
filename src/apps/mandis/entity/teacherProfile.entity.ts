import { Schema } from 'mongoose';

export interface ITeacherProfile {
  teacherId: string;
  userId: string;
  displayName: string;
  organization?: string;
  status: 'active' | 'suspended';
  createdAt: Date;
  updatedAt: Date;
}

export const TeacherProfileSchema = new Schema<ITeacherProfile>(
  {
    teacherId: { type: String, required: true, unique: true },
    userId: { type: String, required: true, unique: true, index: true },
    displayName: { type: String, required: true, maxlength: 40 },
    organization: { type: String, maxlength: 80 },
    status: {
      type: String,
      enum: ['active', 'suspended'],
      default: 'active',
      index: true,
    },
  },
  { timestamps: true, collection: 'mandis_teacher_profiles' }
);
