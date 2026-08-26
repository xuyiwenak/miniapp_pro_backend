import DirectMailClient, { SingleSendMailRequest } from '@alicloud/dm20151123';
import { Config as OpenApiConfig } from '@alicloud/openapi-client';
import { z } from 'zod';
import type {
  IEmailTemplateConfig,
  IEmailTemplateContent,
  IEmailTemplateStyle,
} from '../../entity/emailTemplateConfig.entity';
import {
  EmailTemplateConfigDBModel,
  type EmailTemplateConfigInput,
} from '../../../../dbservice/model/EmailTemplateConfigDBModel';
import { gameLogger as logger } from '../../../../util/logger';

export type EmailTemplateLocale = 'en' | 'zh-CN';

export interface EmailTemplateView extends EmailTemplateConfigInput {
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

const TEXT_MAX_LENGTH = 500;
const SUBJECT_MAX_LENGTH = 120;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const CODE_FONT_SIZE_MIN = 28;
const CODE_FONT_SIZE_MAX = 56;
const DEFAULT_FROM_ALIAS = '原色有感';
const DEFAULT_REGION_ID = 'cn-hangzhou';
const DEFAULT_TAG_NAME = 'original-sense-auth';

const EmailContentSchema = z.object({
  subject: z.string().trim().min(1).max(SUBJECT_MAX_LENGTH),
  title: z.string().trim().min(1).max(SUBJECT_MAX_LENGTH),
  body: z.string().trim().min(1).max(TEXT_MAX_LENGTH),
  expiryText: z.string().trim().min(1).max(TEXT_MAX_LENGTH),
  securityText: z.string().trim().min(1).max(TEXT_MAX_LENGTH),
  footer: z.string().trim().min(1).max(TEXT_MAX_LENGTH),
});

export const EmailTemplateConfigInputSchema = z.object({
  zhCn: EmailContentSchema,
  en: EmailContentSchema,
  style: z.object({
    brandColor: z.string().regex(HEX_COLOR_PATTERN),
    backgroundColor: z.string().regex(HEX_COLOR_PATTERN),
    codeFontSize: z.number().int().min(CODE_FONT_SIZE_MIN).max(CODE_FONT_SIZE_MAX),
    textAlign: z.enum(['left', 'center']),
  }),
});

export const DEFAULT_EMAIL_TEMPLATE: EmailTemplateConfigInput = {
  zhCn: {
    subject: '原色有感验证码',
    title: '原色有感 验证码',
    body: '你好！你正在进行身份验证，请在验证页面中输入下方验证码。',
    expiryText: '验证码有效期为 5 分钟，请尽快使用。',
    securityText: '如非本人操作，请忽略此邮件并注意账号安全。',
    footer: '此为系统自动发送的邮件，请勿回复。',
  },
  en: {
    subject: 'Your Original Sense verification code',
    title: 'Original Sense verification code',
    body: 'Hello! Enter the verification code below to continue signing in.',
    expiryText: 'This code expires in 5 minutes. Please use it promptly.',
    securityText: 'If you did not request this code, ignore this email and keep your account secure.',
    footer: 'This is an automated message. Please do not reply.',
  },
  style: {
    brandColor: '#279A97',
    backgroundColor: '#FFF9F2',
    codeFontSize: 42,
    textAlign: 'left',
  },
};

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatText(value: string): string {
  return escapeHtml(value).replaceAll('\n', '<br />');
}

function toView(config: IEmailTemplateConfig | null): EmailTemplateView {
  if (!config) return { ...DEFAULT_EMAIL_TEMPLATE, updatedAt: null, updatedBy: null };
  return {
    zhCn: config.zhCn,
    en: config.en,
    style: config.style,
    updatedAt: config.updatedAt.toISOString(),
    updatedBy: config.updatedBy,
  };
}

function buildEmailFrame(
  content: IEmailTemplateContent,
  style: IEmailTemplateStyle,
  code: string,
  locale: EmailTemplateLocale,
): string {
  const align = style.textAlign;
  return `<!doctype html>
<html lang="${locale}">
<body style="margin:0;padding:0;background:${style.backgroundColor};font-family:Arial,sans-serif;color:#303333;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
        style="max-width:560px;background:#fffdfa;border:1px solid #e8e2da;border-radius:14px;overflow:hidden;">
        <tr><td style="height:7px;background:${style.brandColor};font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:36px 40px;text-align:${align};">
          <div style="font-size:15px;font-weight:700;color:${style.brandColor};margin-bottom:28px;">原色有感</div>
          <h1 style="margin:0 0 18px;font-size:25px;line-height:1.35;color:#252827;">${formatText(content.title)}</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.75;color:#555b59;">${formatText(content.body)}</p>
          <div style="margin:0 0 24px;padding:18px 16px;border-radius:10px;background:${style.backgroundColor};
            color:${style.brandColor};font-size:${style.codeFontSize}px;line-height:1.15;font-weight:700;
            letter-spacing:8px;text-align:center;">${escapeHtml(code)}</div>
          <p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:#555b59;">${formatText(content.expiryText)}</p>
          <p style="margin:0;font-size:14px;line-height:1.65;color:#777d7b;">${formatText(content.securityText)}</p>
          <div style="height:1px;background:#ebe6df;margin:28px 0 20px;"></div>
          <p style="margin:0;font-size:12px;line-height:1.6;color:#8a8f8d;">${formatText(content.footer)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function getEmailTemplateView(): Promise<EmailTemplateView> {
  try {
    return toView(await EmailTemplateConfigDBModel.findVerificationTemplate());
  } catch (error) {
    logger.warn('email template load failed; using defaults', { error: (error as Error).message });
    return toView(null);
  }
}

export async function saveEmailTemplate(
  input: EmailTemplateConfigInput,
  updatedBy: string,
): Promise<EmailTemplateView> {
  const saved = await EmailTemplateConfigDBModel.saveVerificationTemplate(input, updatedBy);
  logger.info('email template updated', { updatedBy, templateKey: saved.templateKey });
  return toView(saved);
}

export async function resetEmailTemplate(updatedBy: string): Promise<EmailTemplateView> {
  return saveEmailTemplate(DEFAULT_EMAIL_TEMPLATE, updatedBy);
}

export async function renderVerificationEmail(
  code: string,
  locale: EmailTemplateLocale,
): Promise<RenderedEmail> {
  const template = await getEmailTemplateView();
  return renderEmailContent(template, code, locale);
}

export function renderEmailContent(
  template: EmailTemplateConfigInput,
  code: string,
  locale: EmailTemplateLocale,
): RenderedEmail {
  const content = locale === 'en' ? template.en : template.zhCn;
  return { subject: content.subject, html: buildEmailFrame(content, template.style, code, locale) };
}

export async function sendVerificationEmail(
  email: string,
  code: string,
  locale: EmailTemplateLocale,
  template?: EmailTemplateConfigInput,
): Promise<void> {
  const content = template
    ? renderEmailContent(template, code, locale)
    : await renderVerificationEmail(code, locale);
  const client = new DirectMailClient(new OpenApiConfig({
    accessKeyId: getRequiredEnv('ALIYUN_DM_ACCESS_KEY_ID'),
    accessKeySecret: getRequiredEnv('ALIYUN_DM_ACCESS_KEY_SECRET'),
    regionId: process.env.ALIYUN_DM_REGION_ID?.trim() || DEFAULT_REGION_ID,
  }));
  await client.singleSendMail(new SingleSendMailRequest({
    accountName: getRequiredEnv('ALIYUN_DM_ACCOUNT_NAME'),
    addressType: 1,
    fromAlias: process.env.ALIYUN_DM_FROM_ALIAS?.trim() || DEFAULT_FROM_ALIAS,
    htmlBody: content.html,
    replyToAddress: false,
    subject: content.subject,
    tagName: process.env.ALIYUN_DM_TAG_NAME?.trim() || DEFAULT_TAG_NAME,
    toAddress: email,
  }));
}

export function getEmailProviderStatus(): Record<string, string | boolean> {
  const accountName = process.env.ALIYUN_DM_ACCOUNT_NAME?.trim() ?? '';
  return {
    configured: Boolean(
      accountName
      && process.env.ALIYUN_DM_ACCESS_KEY_ID?.trim()
      && process.env.ALIYUN_DM_ACCESS_KEY_SECRET?.trim()
    ),
    accountName,
    regionId: process.env.ALIYUN_DM_REGION_ID?.trim() || DEFAULT_REGION_ID,
    fromAlias: process.env.ALIYUN_DM_FROM_ALIAS?.trim() || DEFAULT_FROM_ALIAS,
    tagName: process.env.ALIYUN_DM_TAG_NAME?.trim() || DEFAULT_TAG_NAME,
  };
}
