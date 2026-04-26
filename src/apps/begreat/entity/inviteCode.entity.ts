import { Schema } from 'mongoose';

export interface IInviteCode {
  code:      string;   // 6 位大写字母+数字（排除易混淆字符）
  openId:    string;   // 邀请人 openId
  createdAt: Date;
}

export const InviteCodeSchema = new Schema<IInviteCode>(
  {
    code:   { type: String, required: true, unique: true, index: true, uppercase: true },
    openId: { type: String, required: true, unique: true, index: true },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);
