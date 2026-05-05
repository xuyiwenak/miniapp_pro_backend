import { Schema } from 'mongoose';

export interface IAdmin {
  adminId:      string;
  username:     string;
  passwordHash: string;
  createdAt:    Date;
}

export const AdminSchema = new Schema<IAdmin>(
  {
    adminId:      { type: String, required: true, unique: true, index: true },
    username:     { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);
