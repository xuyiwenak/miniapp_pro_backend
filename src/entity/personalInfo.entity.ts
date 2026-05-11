import { Schema } from 'mongoose';

export interface IPersonalInfo {
  userId: string;
  image?: string;
  /** 微信 CDN 头像链（qlogo/qpic），展示优先于 OSS，省签名与 OSS 下行 */
  wechatAvatarUrl?: string;
  name: string;
  star?: string;
  mbti?: string;
  /** 微信性别：0=未知，1=男，2=女 */
  gender: 0 | 1 | 2;
  birth?: Date;
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
    gender: { type: Number, required: true, enum: [0, 1, 2] },
    birth: { type: Date },
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
