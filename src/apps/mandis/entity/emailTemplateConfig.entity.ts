import { Schema } from 'mongoose';

export interface IEmailTemplateContent {
  subject: string;
  title: string;
  body: string;
  expiryText: string;
  securityText: string;
  footer: string;
}

export interface IEmailTemplateStyle {
  brandColor: string;
  backgroundColor: string;
  codeFontSize: number;
  textAlign: 'left' | 'center';
}

export interface IEmailTemplateConfig {
  templateKey: 'verification-code';
  zhCn: IEmailTemplateContent;
  en: IEmailTemplateContent;
  style: IEmailTemplateStyle;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const EmailTemplateContentSchema = new Schema<IEmailTemplateContent>(
  {
    subject: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    expiryText: { type: String, required: true },
    securityText: { type: String, required: true },
    footer: { type: String, required: true },
  },
  { _id: false },
);

const EmailTemplateStyleSchema = new Schema<IEmailTemplateStyle>(
  {
    brandColor: { type: String, required: true },
    backgroundColor: { type: String, required: true },
    codeFontSize: { type: Number, required: true },
    textAlign: { type: String, enum: ['left', 'center'], required: true },
  },
  { _id: false },
);

export const EmailTemplateConfigSchema = new Schema<IEmailTemplateConfig>(
  {
    templateKey: {
      type: String,
      enum: ['verification-code'],
      required: true,
      unique: true,
      index: true,
    },
    zhCn: { type: EmailTemplateContentSchema, required: true },
    en: { type: EmailTemplateContentSchema, required: true },
    style: { type: EmailTemplateStyleSchema, required: true },
    updatedBy: { type: String, required: true },
  },
  { collection: 'mandis_email_template_configs', timestamps: true },
);
