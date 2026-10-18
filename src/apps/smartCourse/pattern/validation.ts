import { z } from 'zod';
import { PATTERN_VERSION, sealText } from './contract';
const AssetId = z.union([z.literal(''), z.string().uuid()]);
const RingSchema = z.object({
  source: z.enum(['preset', 'center', 'upload']), assetId: AssetId,
  presetId: z.enum(['leaf', 'flower', 'petal', 'diamond', 'wave']),
  rule: z.enum(['repeat', 'mirror', 'rotate']), count: z.union([z.literal(8), z.literal(12), z.literal(16)]),
  orientation: z.enum(['outward', 'inward', 'tangent']),
}).strict();
export const PatternSchema = z.object({
  version: z.literal(PATTERN_VERSION), centerAssetId: AssetId,
  crop: z.object({ x: z.number().finite().min(-1).max(1), y: z.number().finite().min(-1).max(1),
    zoom: z.number().finite().min(0.25).max(4), rotation: z.number().int().multipleOf(90).min(0).max(270),
    fit: z.enum(['contain', 'cover']) }).strict(),
  removeWhite: z.boolean(), whiteThreshold: z.number().int().min(180).max(250),
  palette: z.enum(['light', 'classic', 'deep']), template: z.enum(['single', 'double']),
  rings: z.tuple([RingSchema, RingSchema]),
  seal: z.object({ enabled: z.boolean(), name: z.string().max(8) }).strict()
    .refine(value => !value.enabled || Boolean(sealText(value.name)), '署名须为 2～4 个汉字'),
  step: z.number().int().min(1).max(4), statement: z.string().trim().max(1000),
}).strict().refine(value => value.step === 1 || value.centerAssetId !== '', '请先上传自己的纹样');
export const SavePatternSchema = z.object({ revision: z.number().int().nonnegative(), state: PatternSchema }).strict();
export const ExportPatternSchema = z.object({ revision: z.number().int().positive() }).strict();
