import { createSystemRouter } from '../../../../../shared/routes/systemAdmin';

// begreat admin 路由已由外层 adminJwtAuth 统一鉴权，无需额外 requirePrivileged
export default createSystemRouter(undefined, 'begreat');
