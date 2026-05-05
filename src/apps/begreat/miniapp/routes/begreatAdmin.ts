import { Router } from 'express';
import authRoutes,        { adminJwtAuth } from './begreatAdmin/auth';
import dashboardRoutes                     from './begreatAdmin/dashboard';
import usersRoutes                         from './begreatAdmin/users';
import sessionsRoutes                      from './begreatAdmin/sessions';
import paymentsRoutes                      from './begreatAdmin/payments';
import invitesRoutes                       from './begreatAdmin/invites';
import configRoutes                        from './begreatAdmin/config';
import occupationsRoutes                   from './begreatAdmin/occupations';

const router = Router();

// 公开接口（无需鉴权）
router.use('/auth', authRoutes);

// 以下所有路由统一走 adminJwtAuth
router.use(adminJwtAuth);
router.use('/dashboard',   dashboardRoutes);
router.use('/users',       usersRoutes);
router.use('/sessions',    sessionsRoutes);
router.use('/payments',    paymentsRoutes);
router.use('/invites',     invitesRoutes);
router.use('/config',      configRoutes);
router.use('/occupations', occupationsRoutes);

export default router;
