import { Router, type Request, type Response } from 'express';
import authRoutes,        { adminJwtAuth } from './begreatAdmin/auth';
import dashboardRoutes                     from './begreatAdmin/dashboard';
import usersRoutes                         from './begreatAdmin/users';
import sessionsRoutes                      from './begreatAdmin/sessions';
import paymentsRoutes                      from './begreatAdmin/payments';
import invitesRoutes                       from './begreatAdmin/invites';
import configRoutes                        from './begreatAdmin/config';
import occupationsRoutes                   from './begreatAdmin/occupations';
import questionsRoutes                     from './begreatAdmin/questions';
import normsRoutes                         from './begreatAdmin/norms';
import systemRoutes                        from './begreatAdmin/system';
import { issueToken }                      from '../../../../shared/miniapp/tokenStore';
import { getRuntimeConfig }                from '../../config/BegreatRuntimeConfig';
import { sendSucc, sendErr }               from '../../../../shared/miniapp/middleware/response';

const router = Router();

// 公开接口（无需鉴权）
router.use('/auth', authRoutes);

// 以下所有路由统一走 adminJwtAuth
router.use(adminJwtAuth);

// 为 commander 测试页签发一次性小程序测试 Token
// 只签发给 devOpenids 里配置的第一个账号，生产环境无 devOpenids 则拒绝
router.get('/dev/test-token', async (_req: Request, res: Response) => {
  const { devOpenids } = getRuntimeConfig();
  if (devOpenids.length === 0) {
    sendErr(res, '未配置 devOpenids，请在运行时配置中添加测试账号 openId', 400);
    return;
  }
  const openId = devOpenids[0];
  const token = await issueToken(openId);
  sendSucc(res, { token, openId });
});
router.use('/dashboard',   dashboardRoutes);
router.use('/users',       usersRoutes);
router.use('/sessions',    sessionsRoutes);
router.use('/payments',    paymentsRoutes);
router.use('/invites',     invitesRoutes);
router.use('/config',      configRoutes);
router.use('/occupations', occupationsRoutes);
router.use('/questions',   questionsRoutes);
router.use('/norms',       normsRoutes);
router.use('/system',      systemRoutes);

export default router;
