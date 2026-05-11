/**
 * 常模文档
 *
 * normVersion 格式：
 *   参考常模：  "ref_<来源>_<YYYYMMDD>"      如 "ref_zhang2021_20260411"
 *   经验常模：  "empirical_<YYYYMMDD>"       如 "empirical_20261201"
 *
 * 每次重算常模写入一批新文档（同一 normVersion），旧版本保留不删除，
 * session 的 normVersion 字段永远指向计算时的版本，报告可追溯。
 */
import { Schema } from 'mongoose';
import type { Gender } from './session.entity';

export type AgeGroup = '18-24' | '25-34' | '35-44' | '45+';
export type NormGender = Gender | 'all';

export interface INormEntry {
  /** 版本标识，时间戳格式，如 ref_zhang2021_20260411 */
  normVersion:   string;
  /** 数据来源说明，如 "Zhang et al. Assessment 2021" */
  source:        string;
  /** 量表版本，如 BFI2_CN_60 */
  instrument:    string;
  /** 测评模型，BIG5 或 RIASEC */
  modelType:     'BIG5' | 'RIASEC';
  /** 维度代码，O / C / E / A / N（BIG5）或 R / I / A / S / E / C（RIASEC） */
  dimension:     string;
  gender:        NormGender;
  ageGroup:      AgeGroup;
  mean:          number;
  sd:            number;
  /** 参与计算的样本量，参考常模可填 null */
  sampleSize:    number | null;
  /** true = 当前生效版本（每次重算后更新） */
  isActive:      boolean;
  createdAt:     Date;
}

export const NormSchema = new Schema<INormEntry>(
  {
    normVersion: { type: String, required: true, index: true },
    source:      { type: String, required: true },
    instrument:  { type: String, required: true },
    modelType:   { type: String, required: true, enum: ['BIG5', 'RIASEC'] },
    dimension:   { type: String, required: true },
    gender:      { type: String, required: true, enum: ['male', 'female', 'all'] },
    ageGroup:    { type: String, required: true, enum: ['18-24', '25-34', '35-44', '45+'] },
    mean:        { type: Number, required: true },
    sd:          { type: Number, required: true },
    sampleSize:  { type: Number, default: null },
    isActive:    { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

// 查询常模的主要路径：按版本+维度+性别+年龄段定位唯一一条
NormSchema.index({ normVersion: 1, modelType: 1, dimension: 1, gender: 1, ageGroup: 1 }, { unique: true });
// 快速获取当前激活版本
NormSchema.index({ isActive: 1, modelType: 1, dimension: 1 });
