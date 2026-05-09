import { Schema } from 'mongoose';

export interface IMandisAdmin {
  adminId:      string;
  username:     string;
  passwordHash: string;
  createdAt:    Date;
}

export const MandisAdminSchema = new Schema<IMandisAdmin>(
  {
    adminId:      { type: String, required: true, unique: true, index: true },
    username:     { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false }, collection: 'mandis_admins' },
);
