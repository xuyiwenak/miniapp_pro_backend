import { Connection, Schema } from 'mongoose';
import { createCeramicModel } from './ceramicModels';
import { createPatternModels } from './patternModels';

export interface Teacher { teacherId: string; username: string; passwordHash: string }
export interface Course {
  courseId: string; teacherId: string; title: string; brief: string; joinCode: string;
  courseTemplateVersion?: string; status: 'draft' | 'open' | 'closed'; appId: string; agentVersion: string; createdAt: Date;
}
export interface Participant {
  participantId: string; courseId: string; completed: boolean; createdAt: Date;
}
export interface Artwork {
  artworkId: string; courseId: string; participantId: string; objectKey: string;
  statement: string; createdAt: Date;
}
export interface Turn {
  turnId: string; courseId: string; participantId: string; requestId: string;
  question: string; mode: 'question' | 'create' | 'review'; artworkId?: string;
  status: 'pending' | 'success' | 'failed'; answer: string; errorCode?: string;
  providerRequestId?: string; appId: string; agentVersion: string; createdAt: Date;
}
const OPTIONS = { timestamps: true, versionKey: false } as const;
export function createModels(connection: Connection) {
  return {
    ...createPatternModels(connection),
    ceramicJobs: createCeramicModel(connection),
    teachers: connection.model('SmartTeacher', teacherSchema()),
    courses: connection.model('SmartCourse', courseSchema()),
    participants: connection.model('SmartParticipant', participantSchema()),
    artworks: connection.model('SmartArtwork', artworkSchema()),
    turns: connection.model('SmartTurn', turnSchema()),
  };
}
function teacherSchema() {
  return new Schema<Teacher>({ teacherId: { type: String, unique: true, required: true },
    username: { type: String, unique: true, required: true },
    passwordHash: { type: String, required: true } }, OPTIONS);
}
function courseSchema() {
  const schema = new Schema<Course>({ courseId: { type: String, unique: true, required: true },
    teacherId: { type: String, required: true }, title: String, brief: String,
    joinCode: { type: String, unique: true, required: true },
    status: { type: String, enum: ['draft', 'open', 'closed'], default: 'draft' },
    courseTemplateVersion: String, appId: String, agentVersion: String }, OPTIONS);
  schema.index({ teacherId: 1, createdAt: -1 });
  return schema;
}
function participantSchema() {
  const schema = new Schema<Participant>({ participantId: { type: String, unique: true, required: true },
    courseId: { type: String, required: true }, completed: { type: Boolean, default: false } }, OPTIONS);
  schema.index({ courseId: 1, createdAt: -1 });
  return schema;
}
function artworkSchema() {
  const schema = new Schema<Artwork>({ artworkId: { type: String, unique: true, required: true },
    courseId: { type: String, required: true }, participantId: { type: String, required: true },
    objectKey: { type: String, required: true }, statement: String }, OPTIONS);
  schema.index({ courseId: 1, participantId: 1, createdAt: -1 });
  return schema;
}
function turnSchema() {
  const schema = new Schema<Turn>({ turnId: { type: String, unique: true, required: true },
    courseId: String, participantId: String, requestId: String, question: String,
    mode: { type: String, enum: ['question', 'create', 'review'] }, artworkId: String,
    status: { type: String, enum: ['pending', 'success', 'failed'] }, answer: String,
    errorCode: String, providerRequestId: String, appId: String, agentVersion: String }, OPTIONS);
  schema.index({ courseId: 1, participantId: 1, requestId: 1 }, { unique: true });
  schema.index({ courseId: 1, participantId: 1, createdAt: -1 });
  return schema;
}
export type Models = ReturnType<typeof createModels>;
