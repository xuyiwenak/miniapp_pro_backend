import { Schema } from "mongoose";

export interface IFeedback {
  userId: string;
  title: string;
  content: string;
  status: "pending" | "processing" | "resolved";
  reply?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const FeedbackSchema = new Schema<IFeedback>(
  {
    userId: { type: String, required: true, index: true },
    title: { type: String, required: true, maxlength: 30 },
    content: { type: String, required: true, maxlength: 300 },
    status: {
      type: String,
      enum: ["pending", "processing", "resolved"],
      default: "pending",
      required: true,
      index: true,
    },
    reply: { type: String },
  },
  { timestamps: true },
);

