// pm2 本地开发配置
// 用法：pm2 start ecosystem.config.js
// 生产环境由 docker-compose 管理，无需此文件

module.exports = {
  apps: [
    {
      name: 'mandis',
      script: 'src/apps/mandis/front.ts',
      interpreter: './node_modules/.bin/ts-node',
      interpreter_args: '--project tsconfig.json',
      cwd: __dirname,
      watch: false,
      // 敏感值（JWT_SECRET 等）放在 .env，不进 git
      env_file: '.env',
      env: {
        // 运行环境（对应 src/apps/mandis/sysconfig/development/）
        ENV: 'development',
        environment: 'development',

        // 端口（本地与生产错开，避免冲突）
        WS_PORT: '42000',
        HTTP_PORT: '42001',
        MINIAPP_PORT: '42002',

        // 服务标识（GAME_TYPE 决定 sysconfig 路径：src/apps/{GAME_TYPE}/sysconfig/）
        SERVER_ID: 'mandis_1',
        GAME_TYPE: 'mandis',
        gameType: 'mandis',
      },
    },
    {
      name: 'begreat',
      script: 'src/apps/begreat/front.ts',
      interpreter: './node_modules/.bin/ts-node',
      interpreter_args: '--project tsconfig.json',
      cwd: __dirname,
      watch: false,
      env_file: '.env',
      env: {
        ENV: 'development',
        environment: 'development',
      },
    },
  ],
};
