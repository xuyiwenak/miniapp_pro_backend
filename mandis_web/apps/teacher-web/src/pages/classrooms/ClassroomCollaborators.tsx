import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Input, List, Modal, Popconfirm, Space, Typography, message } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { classroomApi, type ClassroomCollaborator } from '@/api/classroomApi';

type Props = {
  classId: string;
  teacherId: string;
  open: boolean;
  onCancel: () => void;
};

export function ClassroomCollaborators({ classId, teacherId, open, onCancel }: Props) {
  const [list, setList] = useState<ClassroomCollaborator[]>([]);
  const [candidateId, setCandidateId] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const response = await classroomApi.collaborators(classId);
    setList(response.data.list);
  }, [classId]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  async function add(): Promise<void> {
    const nextId = candidateId.trim();
    if (!nextId) return;
    setSaving(true);
    try {
      await classroomApi.addCollaborator(classId, nextId);
      setCandidateId('');
      await load();
      void message.success('已授权协作教师');
    } finally {
      setSaving(false);
    }
  }

  async function remove(collaboratorId: string): Promise<void> {
    await classroomApi.removeCollaborator(classId, collaboratorId);
    await load();
  }

  return (
    <Modal open={open} title="课堂协作权限" footer={null} onCancel={onCancel} destroyOnHidden>
      <Alert
        type="info"
        showIcon
        message="协作教师可查看进度、测评汇总和处理作品，但不能开放、关闭或编辑课堂。"
      />
      <Typography.Paragraph copyable={{ text: teacherId }} style={{ marginTop: 16 }}>
        我的教师 ID：{teacherId}
      </Typography.Paragraph>
      <Space.Compact style={{ width: '100%', marginBottom: 18 }}>
        <Input
          value={candidateId}
          placeholder="输入对方的教师 ID"
          onChange={(event) => setCandidateId(event.target.value)}
        />
        <Button type="primary" icon={<PlusOutlined />} loading={saving} onClick={() => void add()}>
          授权
        </Button>
      </Space.Compact>
      <List
        dataSource={list}
        locale={{ emptyText: '尚未授权其他教师' }}
        renderItem={(item) => (
          <List.Item
            actions={[
              <Popconfirm
                key="remove"
                title="移除这位协作教师？"
                onConfirm={() => void remove(item.teacherId)}
              >
                <Button type="text" danger icon={<DeleteOutlined />}>移除</Button>
              </Popconfirm>,
            ]}
          >
            <List.Item.Meta title={item.displayName} description={item.organization || item.teacherId} />
          </List.Item>
        )}
      />
    </Modal>
  );
}
