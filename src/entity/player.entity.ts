import { Schema } from 'mongoose';
import { AccountLevel } from '../shared/enum/AccountLevel';

export interface IPlayer {
  userId: string;
  account: string;
  password?: string;
  nickname?: string;
  zoneId?: string;
  openId?: string;
  /** 微信开放平台 UnionID，用于小程序与网页账号关联 */
  unionId?: string;
  /** 微信开放平台网站应用 OpenID */
  webOpenId?: string;
  /** 绑定的手机号，跨平台登录凭证 */
  phone?: string;
  /** 绑定的邮箱，跨平台登录凭证，统一按小写保存 */
  email?: string;
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
    unionId: { type: String, unique: true, sparse: true },
    webOpenId: { type: String, unique: true, sparse: true },
    phone: { type: String, index: true, sparse: true },
    email: { type: String, unique: true, sparse: true },
    level: { type: Number, required: true, default: AccountLevel.User },
  },
  { timestamps: true }
);
