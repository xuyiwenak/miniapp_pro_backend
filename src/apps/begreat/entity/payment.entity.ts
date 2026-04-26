import { Schema } from 'mongoose';

export type PaymentStatus = 'pending' | 'success' | 'failed';

export interface IPaymentRecord {
  /** 微信支付单号（唯一索引） */
  outTradeNo:       string;
  /** 关联的测评报告 sessionId */
  sessionId:        string;
  /** 用户 openId */
  openId:           string;
  /** 支付金额，单位：分 */
  amount:           number;
  status:           PaymentStatus;
  /** 支付成功时间（微信回调写入） */
  paidAt?:          Date;
  createdAt:        Date;
  /** 是否已生成报告长图（每个付费报告仅允许一次） */
  imageGenerated:   boolean;
  imageGeneratedAt?: Date;
}

export const PaymentSchema = new Schema<IPaymentRecord>(
  {
    outTradeNo:       { type: String, required: true, unique: true, index: true },
    sessionId:        { type: String, required: true, index: true },
    openId:           { type: String, required: true, index: true },
    amount:           { type: Number, required: true },
    status:           { type: String, enum: ['pending', 'success', 'failed'], default: 'pending', index: true },
    paidAt:           { type: Date },
    imageGenerated:   { type: Boolean, default: false, index: true },
    imageGeneratedAt: { type: Date },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);
