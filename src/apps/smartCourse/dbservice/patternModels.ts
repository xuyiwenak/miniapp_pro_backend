import { Schema, type Connection } from 'mongoose';
export interface PatternAsset {
  assetId: string; courseId: string; participantId: string; objectKey: string;
  width: number; height: number; createdAt: Date;
}
export interface PatternExport { revision: number; objectKey: string; artworkId: string; createdAt: Date;
  stateJson: string; renderVersion: string }
export interface PatternDesign {
  courseId: string; participantId: string; revision: number; stateJson: string; exports: PatternExport[];
}
export function createPatternModels(connection: Connection) {
  const assetSchema = new Schema<PatternAsset>({
    assetId: { type: String, unique: true, required: true }, courseId: { type: String, required: true },
    participantId: { type: String, required: true }, objectKey: { type: String, required: true },
    width: { type: Number, required: true }, height: { type: Number, required: true },
  }, { timestamps: true, versionKey: false });
  assetSchema.index({ courseId: 1, participantId: 1, createdAt: -1 });
  const exportSchema = new Schema<PatternExport>({ revision: Number, objectKey: String,
    artworkId: String, createdAt: Date, stateJson: String, renderVersion: String }, { _id: false });
  const designSchema = new Schema<PatternDesign>({ courseId: { type: String, required: true },
    participantId: { type: String, required: true }, revision: { type: Number, required: true },
    // Validated, versioned JSON avoids duplicating the Zod contract in a second mutable schema.
    stateJson: { type: String, required: true }, exports: { type: [exportSchema], default: [] },
  }, { timestamps: true, versionKey: false });
  designSchema.index({ courseId: 1, participantId: 1 }, { unique: true });
  return { patternAssets: connection.model('SmartPatternAsset', assetSchema),
    patternDesigns: connection.model('SmartPatternDesign', designSchema) };
}
