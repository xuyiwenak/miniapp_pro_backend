import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Empty, List, message, Tooltip, Typography } from 'antd';
import {
  BookOutlined,
  DoubleLeftOutlined,
  DoubleRightOutlined,
  LogoutOutlined,
  PlusOutlined,
  ReadOutlined,
} from '@ant-design/icons';
import {
  classroomApi,
  type ClassroomInput,
  type ClassroomRecord,
} from '@/api/classroomApi';
import { ClassroomCreateModal } from './classrooms/ClassroomCreateModal';
import { ClassroomDashboard } from './classrooms/ClassroomDashboard';
import './classrooms/ClassroomsPage.css';

const { Title } = Typography;

type Props = {
  teacherId: string;
  teacherDisplayName: string;
  onLogout: () => void;
};

export default function ClassroomsPage({ teacherId, teacherDisplayName, onLogout }: Props) {
  const [classrooms, setClassrooms] = useState<ClassroomRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ClassroomRecord | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

  async function saveClassroom(input: ClassroomInput): Promise<void> {
    if (!editing) {
      await createClassroom(input);
      return;
    }
    setSaving(true);
    try {
      await classroomApi.update(editing.classId, input);
      setCreateOpen(false);
      setEditing(undefined);
      await loadClassrooms(editing.classId);
      void message.success('课堂草稿已更新');
    } finally {
      setSaving(false);
    }
  }

  const selected = classrooms.find((item) => item.classId === selectedId);
  return (
    <main className={`classrooms-page${sidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}>
      <aside className="classrooms-page__list">
        <header>
          <div className="classrooms-page__brand">
            <ReadOutlined />
            <Title level={4}>教育课堂</Title>
          </div>
          <Tooltip title="创建课堂">
            <Button
              type="primary"
              shape="circle"
              icon={<PlusOutlined />}
              aria-label="创建课堂"
              onClick={() => setCreateOpen(true)}
            />
          </Tooltip>
        </header>
        {error && <Alert type="error" message={error} />}
        <List
          dataSource={classrooms}
          locale={{ emptyText: <Empty description="尚未创建课堂" /> }}
          renderItem={(item) => (
            <List.Item className={selectedId === item.classId ? 'is-selected' : ''}>
              <Tooltip
                placement="right"
                title={sidebarCollapsed ? `${item.sessionTitle} · ${item.classDate}` : undefined}
              >
                <button
                  type="button"
                  className="classrooms-page__classroom-button"
                  aria-current={selectedId === item.classId ? 'page' : undefined}
                  aria-label={`打开课堂：${item.sessionTitle}`}
                  onClick={() => setSelectedId(item.classId)}
                >
                  <span className="classrooms-page__classroom-icon" aria-hidden="true">
                    <BookOutlined />
                    <i />
                  </span>
                  <span className="classrooms-page__classroom-copy">
                    <strong>{item.sessionTitle}</strong>
                    <small>
                      {item.classDate} · {item.status}
                    </small>
                  </span>
                </button>
              </Tooltip>
            </List.Item>
          )}
        />
        <footer>
          <Tooltip title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}>
            <Button
              type="text"
              aria-label={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
              icon={sidebarCollapsed ? <DoubleRightOutlined /> : <DoubleLeftOutlined />}
              onClick={() => setSidebarCollapsed((current) => !current)}
            />
          </Tooltip>
          {!sidebarCollapsed && <span>{teacherDisplayName}</span>}
          <Tooltip title="退出">
            <Button type="text" aria-label="退出" icon={<LogoutOutlined />} onClick={onLogout} />
          </Tooltip>
        </footer>
      </aside>
      <section className="classrooms-page__detail">
        {selected ? (
          <ClassroomDashboard
            classroom={selected}
            teacherId={teacherId}
            onEdit={() => {
              setEditing(selected);
              setCreateOpen(true);
            }}
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
        classroom={editing}
        onCancel={() => {
          setCreateOpen(false);
          setEditing(undefined);
        }}
        onSubmit={saveClassroom}
      />
    </main>
  );
}
