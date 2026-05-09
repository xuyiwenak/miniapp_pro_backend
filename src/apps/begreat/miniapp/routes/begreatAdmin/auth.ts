import { Request } from 'express';
import { getAdminModel } from '../../../dbservice/BegreatDBModel';
import { makeAdminJwtAuth, makeAdminAuthRouter, type AdminJwtPayload } from '../../../../../shared/miniapp/middleware/adminJwt';

declare module 'express' {
  interface Request {
    admin?: AdminJwtPayload;
  }
}

export type { AdminJwtPayload };

export const adminJwtAuth = makeAdminJwtAuth(
  'BEGREAT_ADMIN_JWT_SECRET',
  (req, payload) => { req.admin = payload; },
);

export default makeAdminAuthRouter({
  secretEnvVar: 'BEGREAT_ADMIN_JWT_SECRET',
  logPrefix:    '[begreat-admin/auth]',
  jwtAuth:      adminJwtAuth,
  getModel:     getAdminModel,
  getPayload:   (req: Request) => req.admin,
});
