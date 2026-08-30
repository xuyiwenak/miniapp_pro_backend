import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Segmented,
  Space,
  Typography,
  message,
} from 'antd';
import { teacherAuthApi, type TeacherProfile } from './api/teacherAuthApi';

type Props = { signedIn: boolean; onReady: (profile: TeacherProfile) => void };

export function TeacherAccess({ signedIn, onReady }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>(signedIn ? 'register' : 'login');
  const [hasSession, setHasSession] = useState(signedIn);
  const [loading, setLoading] = useState(false);

  async function submit(values: Record<string, string>): Promise<void> {
    setLoading(true);
    try {
      if (!hasSession && mode === 'login') {
        await teacherAuthApi.login(values.email, values.password);
        setHasSession(true);
        try {
          const profile = await teacherAuthApi.profile();
          onReady(profile.data);
        } catch {
          void message.info('首次登录，请补充教师资料');
        }
        return;
      }
      if (!hasSession && mode === 'register') {
        await teacherAuthApi.register(values.email, values.password, values.emailCode);
      }
      const response = await teacherAuthApi.activate(values.displayName, values.organization);
      onReady(response.data);
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '操作失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  async function sendCode(email?: string): Promise<void> {
    if (!email) {
      void message.warning('请先填写邮箱');
      return;
    }
    try {
      await teacherAuthApi.sendRegistrationCode(email);
      void message.success('验证码已发送');
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '验证码发送失败');
    }
  }

  return (
    <main className="teacher-access">
      <Card className="teacher-access__card">
        <Typography.Title level={2}>原色有感 · 教师端</Typography.Title>
        <Alert
          message="教师端使用独立入口，管理员账号不能登录这里。"
          type="info"
          showIcon
        />
        {!hasSession && (
          <Segmented
            block
            value={mode}
            options={[
              { label: '登录', value: 'login' },
              { label: '注册', value: 'register' },
            ]}
            onChange={setMode}
          />
        )}
        <Form
          layout="vertical"
          onFinish={(values) => {
            void submit(values);
          }}
        >
          {!hasSession && (
            <Form.Item
              name="email"
              label="邮箱"
              rules={[{ required: true, type: 'email' }]}
            >
              <Input />
            </Form.Item>
          )}
          {!hasSession && (
            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, min: 8 }]}
            >
              <Input.Password />
            </Form.Item>
          )}
          {!hasSession && mode === 'register' && (
            <Form.Item label="邮箱验证码" required>
              <Space.Compact block>
                <Form.Item
                  name="emailCode"
                  noStyle
                  rules={[{ required: true }]}
                >
                  <Input maxLength={6} />
                </Form.Item>
                <Form.Item noStyle shouldUpdate>
                  {({ getFieldValue }) => (
                    <Button
                      onClick={() => {
                        void sendCode(getFieldValue('email'));
                      }}
                    >
                      发送验证码
                    </Button>
                  )}
                </Form.Item>
              </Space.Compact>
            </Form.Item>
          )}
          {(hasSession || mode === 'register') && (
            <Form.Item
              name="displayName"
              label="教师显示名"
              rules={[{ required: true }]}
            >
              <Input maxLength={40} />
            </Form.Item>
          )}
          {(hasSession || mode === 'register') && (
            <Form.Item name="organization" label="学校或机构（选填）">
              <Input maxLength={80} />
            </Form.Item>
          )}
          <Button block type="primary" htmlType="submit" loading={loading}>
            {hasSession
              ? '开通教师空间'
              : mode === 'login'
                ? '登录'
                : '注册并开通'}
          </Button>
        </Form>
      </Card>
    </main>
  );
}
