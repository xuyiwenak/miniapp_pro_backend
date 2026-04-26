import { WsClient } from 'tsrpc';
import { serviceProto, ServiceType } from '../protocols/serviceProto';

async function main() {
  const client = new WsClient<ServiceType>(
    serviceProto,
    {
      server: 'ws://127.0.0.1:41001',  // 换成你实际的前端服 ws 地址
    }
  );

  // 连接（可选，callApi 会自动连，但单测里显式连更清晰）
  const connRet = await client.connect();
  if (!connRet.isSucc) {
    console.error('connect failed:', connRet.errMsg);
    return;
  }

  // 测试账号配置
  const TEST_ACCOUNT = process.env.TEST_ACCOUNT || 'test_account_1';
  const TEST_PASSWORD = process.env.TEST_PASSWORD || 'test123456';

  // 调用 Register 协议
  const ret = await client.callApi('Register', {
    account: TEST_ACCOUNT,
    password: TEST_PASSWORD,
  });

  if (ret.isSucc) {
    console.log('Register succ, userId =', ret.res.userId);
  } else {
    console.error('Register failed:', ret.err.message);
  }

  await client.disconnect();
}

main().catch(console.error);
