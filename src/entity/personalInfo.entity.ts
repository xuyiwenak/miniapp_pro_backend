import { Schema } from 'mongoose';

export interface IPersonalInfo {
  userId: string;
  image?: string;
  /** 微信 CDN 头像链（qlogo/qpic），展示优先于 OSS，省签名与 OSS 下行 */
  wechatAvatarUrl?: string;
  name: string;
  star?: string;
  mbti?: string;
  gender: number;
  birth?: string;
  address: string[];
  brief?: string;
  photos: { url: string; name: string; type: string }[];
  artTags?: string[];
  onboardingStep?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export const PersonalInfoSchema = new Schema<IPersonalInfo>(
  {
    userId: { type: String, required: true, unique: true },
    image: { type: String },
    wechatAvatarUrl: { type: String },
    name: { type: String, required: true },
    star: { type: String },
    mbti: { type: String },
    gender: { type: Number, required: true },
    birth: { type: String },
    address: [{ type: String }],
    brief: { type: String },
    photos: [
      {
        url: { type: String, required: true },
        name: { type: String, required: true },
        type: { type: String, required: true },
      },
    ],
    artTags: [{ type: String }],
    onboardingStep: { type: Number, default: 0 },
  },
  { timestamps: true },
);
