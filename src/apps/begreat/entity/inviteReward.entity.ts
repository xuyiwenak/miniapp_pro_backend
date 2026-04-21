import { Schema } from "mongoose";

export interface IInviteReward {
  openId:             string;
  freeUnlockCredits:  number;  // 当前可用次数
  totalInvited:       number;  // 累计邀请成功人数
  createdAt:          Date;
  updatedAt:          Date;
}

export const InviteRewardSchema = new Schema<IInviteReward>(
  {
    openId:            { type: String, required: true, unique: true, index: true },
    freeUnlockCredits: { type: Number, default: 0, min: 0 },
    totalInvited:      { type: Number, default: 0, min: 0 },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);
