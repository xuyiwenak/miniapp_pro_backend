import { Schema } from 'mongoose';
import type { IArtworkAffectDimension, IArtworkAffectVad } from '../../../entity/work.entity';

export type ClassroomArtworkTextLegibility = 'high' | 'medium' | 'low' | 'none';
export type ClassroomArtworkTextCompleteness = 'complete' | 'partial' | 'unreadable' | 'none';
export type ClassroomArtworkTextRelation = 'reinforces' | 'contrasts' | 'independent' | 'unclear';

export interface IClassroomArtworkDimensions {
  joy: IArtworkAffectDimension;
  calm: IArtworkAffectDimension;
  anxiety: IArtworkAffectDimension;
  fear: IArtworkAffectDimension;
  solitude: IArtworkAffectDimension;
  passion: IArtworkAffectDimension;
  social_aversion: IArtworkAffectDimension;
  vitality: IArtworkAffectDimension;
}

export interface IClassroomArtworkEmbeddedText {
  detected: boolean;
  legibility: ClassroomArtworkTextLegibility;
  completeness: ClassroomArtworkTextCompleteness;
  affectCues: string[];
  containsPotentialPii: boolean;
}

export interface IClassroomArtworkAnalysis {
  analysisId: string;
  workId: string;
  classroomId: string;
  participantId?: string;
  contentHash?: string;
  modelVersion: string;
  promptVersion: string;
  scaleVersion: string;
  generatedAt: Date;
  visualDimensions: IClassroomArtworkDimensions;
  visualVad: IArtworkAffectVad;
  embeddedText: IClassroomArtworkEmbeddedText;
  relation: ClassroomArtworkTextRelation;
  fusedDimensions: IClassroomArtworkDimensions;
  fusedVad: IArtworkAffectVad;
  createdAt: Date;
  updatedAt: Date;
}

export type NewClassroomArtworkAnalysis = Omit<IClassroomArtworkAnalysis, 'createdAt' | 'updatedAt'>;

const ArtworkAffectDimensionSchema = new Schema<IArtworkAffectDimension>({
  score: { type: Number, default: null, min: 0, max: 100 },
  assessable: { type: Boolean, required: true },
  evidence: [{ type: String, required: true }],
}, { _id: false });

const ArtworkDimensionsSchema = new Schema<IClassroomArtworkDimensions>({
  joy: { type: ArtworkAffectDimensionSchema, required: true },
  calm: { type: ArtworkAffectDimensionSchema, required: true },
  anxiety: { type: ArtworkAffectDimensionSchema, required: true },
  fear: { type: ArtworkAffectDimensionSchema, required: true },
  solitude: { type: ArtworkAffectDimensionSchema, required: true },
  passion: { type: ArtworkAffectDimensionSchema, required: true },
  social_aversion: { type: ArtworkAffectDimensionSchema, required: true },
  vitality: { type: ArtworkAffectDimensionSchema, required: true },
}, { _id: false });

const ArtworkVadSchema = new Schema<IArtworkAffectVad>({
  valence: { type: Number, default: null, min: 0, max: 100 },
  arousal: { type: Number, default: null, min: 0, max: 100 },
  dominance: { type: Number, default: null, min: 0, max: 100 },
  assessable: { type: Boolean, required: true },
  evidence: [{ type: String, required: true }],
  interpretation: { type: String, required: true },
}, { _id: false });

const EmbeddedTextSchema = new Schema<IClassroomArtworkEmbeddedText>({
  detected: { type: Boolean, required: true },
  legibility: { type: String, enum: ['high', 'medium', 'low', 'none'], required: true },
  completeness: { type: String, enum: ['complete', 'partial', 'unreadable', 'none'], required: true },
  affectCues: [{ type: String, required: true }],
  containsPotentialPii: { type: Boolean, required: true },
}, { _id: false });

export const ClassroomArtworkAnalysisSchema = new Schema<IClassroomArtworkAnalysis>({
  analysisId: { type: String, required: true, unique: true },
  workId: { type: String, required: true, index: true },
  classroomId: { type: String, required: true, index: true },
  participantId: { type: String, index: true },
  contentHash: { type: String },
  modelVersion: { type: String, required: true },
  promptVersion: { type: String, required: true },
  scaleVersion: { type: String, required: true },
  generatedAt: { type: Date, required: true },
  visualDimensions: { type: ArtworkDimensionsSchema, required: true },
  visualVad: { type: ArtworkVadSchema, required: true },
  embeddedText: { type: EmbeddedTextSchema, required: true },
  relation: {
    type: String,
    enum: ['reinforces', 'contrasts', 'independent', 'unclear'],
    required: true,
  },
  fusedDimensions: { type: ArtworkDimensionsSchema, required: true },
  fusedVad: { type: ArtworkVadSchema, required: true },
}, { timestamps: true, collection: 'mandis_classroom_artwork_analyses' });

ClassroomArtworkAnalysisSchema.index({ classroomId: 1, createdAt: -1 });
ClassroomArtworkAnalysisSchema.index({ workId: 1, generatedAt: -1 });
