import { Schema, type Connection } from 'mongoose';
export interface CeramicJob {
  courseId: string; participantId: string; revision: number;
  status: 'submitting' | 'pending' | 'success' | 'failed' | 'unknown';
  taskId?: string; objectKey?: string; model: string; promptVersion: string; createdAt: Date; startedAt: Date;
}
export function createCeramicModel(connection: Connection) {
  const schema = new Schema<CeramicJob>({
    courseId: { type: String, required: true }, participantId: { type: String, required: true },
    revision: { type: Number, required: true },
    status: { type: String, enum: ['submitting', 'pending', 'success', 'failed', 'unknown'], required: true },
    startedAt: { type: Date, required: true }, taskId: String, objectKey: String, model: String, promptVersion: String,
  }, { timestamps: true, versionKey: false });
  schema.index({ courseId: 1, participantId: 1, revision: 1 }, { unique: true });
  schema.index({ status: 1, updatedAt: 1 });
  return connection.model('SmartCeramicJob', schema);
}
