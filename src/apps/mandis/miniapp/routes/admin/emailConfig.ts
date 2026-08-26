import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendErr, sendSucc } from '../../../../../shared/miniapp/middleware/response';
import { gameLogger as logger } from '../../../../../util/logger';
import {
  EmailTemplateConfigInputSchema,
  getEmailProviderStatus,
  getEmailTemplateView,
  resetEmailTemplate,
  saveEmailTemplate,
  sendVerificationEmail,
} from '../../services/emailTemplate';

const router = Router();
const TEST_VERIFICATION_CODE = '275168';

const TestEmailSchema = z.object({
  email: z.string().trim().email(),
  locale: z.enum(['zh-CN', 'en']),
  template: EmailTemplateConfigInputSchema,
});

function getAdminName(req: Request): string {
  return req.mandisAdmin?.username ?? 'unknown-admin';
}

/** GET /mandis-admin/email-config — 读取模板和非敏感发信状态 */
router.get('/', async (_req: Request, res: Response) => {
  const template = await getEmailTemplateView();
  sendSucc(res, { template, provider: getEmailProviderStatus() });
});

/** PUT /mandis-admin/email-config — 保存模板并立即生效 */
router.put('/', async (req: Request, res: Response) => {
  const parsed = EmailTemplateConfigInputSchema.safeParse(req.body);
  if (!parsed.success) {
    sendErr(res, parsed.error.issues.map((issue) => issue.message).join('; '), 400);
    return;
  }
  try {
    const template = await saveEmailTemplate(parsed.data, getAdminName(req));
    sendSucc(res, { template });
  } catch (error) {
    logger.error('admin email template save failed', { error: (error as Error).message });
    sendErr(res, '邮件模板保存失败', 500);
  }
});

/** POST /mandis-admin/email-config/reset — 恢复默认模板 */
router.post('/reset', async (req: Request, res: Response) => {
  try {
    const template = await resetEmailTemplate(getAdminName(req));
    sendSucc(res, { template });
  } catch (error) {
    logger.error('admin email template reset failed', { error: (error as Error).message });
    sendErr(res, '默认模板恢复失败', 500);
  }
});

/** POST /mandis-admin/email-config/test — 向指定邮箱发送预览邮件 */
router.post('/test', async (req: Request, res: Response) => {
  const parsed = TestEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    sendErr(res, '请输入有效的测试邮箱和语言', 400);
    return;
  }
  try {
    await sendVerificationEmail(
      parsed.data.email,
      TEST_VERIFICATION_CODE,
      parsed.data.locale,
      parsed.data.template,
    );
    logger.info('admin email template test sent', {
      admin: getAdminName(req),
      locale: parsed.data.locale,
    });
    sendSucc(res, { sent: true });
  } catch (error) {
    logger.error('admin email template test failed', { error: (error as Error).message });
    sendErr(res, '测试邮件发送失败，请检查发信配置和邮件标签', 503);
  }
});

export default router;
