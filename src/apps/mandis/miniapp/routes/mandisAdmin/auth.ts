import { Request } from 'express';
import { getMandisAdminModel } from '../../../../../dbservice/model/GlobalInfoDBModel';
import { makeAdminJwtAuth, makeAdminAuthRouter, type AdminJwtPayload } from '../../../../../shared/miniapp/middleware/adminJwt';

declare module 'express' {
  interface Request {
    mandisAdmin?: AdminJwtPayload;
  }
}

export const mandisAdminJwtAuth = makeAdminJwtAuth(
  'MANDIS_ADMIN_JWT_SECRET',
  (req, payload) => { req.mandisAdmin = payload; },
);

export default makeAdminAuthRouter({
  secretEnvVar: 'MANDIS_ADMIN_JWT_SECRET',
  logPrefix:    '[mandis-admin/auth]',
  jwtAuth:      mandisAdminJwtAuth,
  getModel:     getMandisAdminModel,
  getPayload:   (req: Request) => req.mandisAdmin,
});
