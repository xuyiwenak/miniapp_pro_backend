import { Schema } from 'mongoose';
import { AccountLevel } from '../shared/enum/AccountLevel';

export interface IPlayer {
  userId: string;
  account: string;
  password?: string;
  nickname?: string;
  zoneId?: string;
  openId?: string;
  /** 账号等级：1 超级管理员，2 普通管理员，3 普通用户 */
  level: AccountLevel;
  createdAt: Date;
  updatedAt: Date;
}

export const PlayerSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true },
    account: { type: String, required: true, index: true },
    password: { type: String, required: false },
    nickname: { type: String },
    zoneId: { type: String },
    openId: { type: String, index: true, sparse: true },
    level: { type: Number, required: true, default: AccountLevel.User },
  },
  { timestamps: true },
);