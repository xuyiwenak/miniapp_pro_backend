import { Schema } from "mongoose";

export interface IWork {
  workId: string;
  authorId?: string | null;
  desc: string;
  images: { url: string; name: string; type: string }[];
  tags: string[];
  location?: string;
  status: "draft" | "published";
  createdAt: Date;
  updatedAt: Date;
}

export const WorkSchema = new Schema<IWork>(
  {
    workId: { type: String, required: true, unique: true },
    authorId: { type: String },
    desc: { type: String, required: false },
    images: [
      {
        url: { type: String, required: true },
        name: { type: String, required: true },
        type: { type: String, required: true },
      },
    ],
    tags: [{ type: String }],
    location: { type: String },
    status: {
      type: String,
      enum: ["draft", "published"],
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

