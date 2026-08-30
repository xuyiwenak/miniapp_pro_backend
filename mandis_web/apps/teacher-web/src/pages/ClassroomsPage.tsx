import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Empty, List, message, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import {
  classroomApi,
  type ClassroomInput,
  type ClassroomRecord,
} from '@/api/classroomApi';
import { ClassroomCreateModal } from './classrooms/ClassroomCreateModal';
import { ClassroomDashboard } from './classrooms/ClassroomDashboard';
import './classrooms/ClassroomsPage.css';

const { Text, Title } = Typography;

export default function ClassroomsPage() {
  const [classrooms, setClassrooms] = useState<ClassroomRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadClassrooms = useCallback(
    async (preferredId?: string): Promise<void> => {
      try {
        const response = await classroomApi.list();
        setClassrooms(response.data.list);
        setSelectedId((currentId) => {
          const nextId =
            preferredId ?? currentId ?? response.data.list[0]?.classId ?? '';
          return response.data.list.some((item) => item.classId === nextId)
            ? nextId
            : response.data.list[0]?.classId ?? '';
        });
        setError('');
      } catch (nextError) {
        setError(
          nextError instanceof Error ? nextError.message : '课堂读取失败'
        );
      }
    },
    []
  );

  useEffect(() => {
    // Data loading is the external synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadClassrooms();
  }, [loadClassrooms]);

  async function createClassroom(input: ClassroomInput): Promise<void> {
    setSaving(true);
    try {
      const response = await classroomApi.create(input);
      setCreateOpen(false);
      await loadClassrooms(response.data.classId);
      void message.success('课堂草稿已创建');
    } finally {
      setSaving(false);
    }
  }

  const selected = classrooms.find((item) => item.classId === selectedId);
  return (
    <main className="classrooms-page">
      <aside className="classrooms-page__list">
        <header>
          <div>
            <Title level={4}>教育课堂</Title>
            <Text type="secondary">配置、开放与实时进度</Text>
          </div>
          <Button
            type="primary"
            shape="circle"
            icon={<PlusOutlined />}
            aria-label="创建课堂"
            onClick={() => setCreateOpen(true)}
          />
        </header>
        {error && <Alert type="error" message={error} />}
        <List
          dataSource={classrooms}
          locale={{ emptyText: <Empty description="尚未创建课堂" /> }}
          renderItem={(item) => (
            <List.Item
              className={selectedId === item.classId ? 'is-selected' : ''}
              onClick={() => setSelectedId(item.classId)}
            >
              <div>
                <strong>{item.sessionTitle}</strong>
                <span>{item.courseName}</span>
                <small>
                  {item.classDate} · {item.status}
                </small>
              </div>
            </List.Item>
          )}
        />
      </aside>
      <section className="classrooms-page__detail">
        {selected ? (
          <ClassroomDashboard
            classroom={selected}
            onChanged={() => {
              void loadClassrooms(selected.classId);
            }}
          />
        ) : (
          <Empty description="创建或选择一个课堂" />
        )}
      </section>
      <ClassroomCreateModal
        open={createOpen}
        saving={saving}
        onCancel={() => setCreateOpen(false)}
        onSubmit={createClassroom}
      />
    </main>
  );
}
