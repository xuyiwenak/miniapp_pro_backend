import { Schema } from 'mongoose';

export type TipsSourceType = 'image' | 'color' | 'sketch' | 'words';

export interface IUserTips {
  userId: string;
  date: string;            // 'YYYY-MM-DD' in CST (UTC+8)
  content: string;
  sourceWorkId: string;
  sourceType: TipsSourceType;
  status: 'generating' | 'done' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

export const UserTipsSchema = new Schema<IUserTips>(
  {
    userId:       { type: String, required: true },
    date:         { type: String, required: true },  // 'YYYY-MM-DD'
    content:      { type: String, default: '' },
    sourceWorkId: { type: String, required: true },
    sourceType:   {
      type: String,
      enum: ['image', 'color', 'sketch', 'words'],
      required: true,
    },
    status: {
      type: String,
      enum: ['generating', 'done', 'failed'],
      default: 'generating',
      required: true,
    },
  },
  { timestamps: true },
);

// 核心约束：每个用户每天只有一条
UserTipsSchema.index({ userId: 1, date: 1 }, { unique: true });
