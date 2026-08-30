import { useEffect, useState } from 'react';
import { Button, Spin, Typography } from 'antd';
import { teacherAuthApi, type TeacherProfile } from './api/teacherAuthApi';
import ClassroomsPage from './pages/ClassroomsPage';
import { TeacherAccess } from './TeacherAccess';
import './teacher.css';

export default function App() {
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    void teacherAuthApi
      .profile()
      .then((response) => {
        setProfile(response.data);
        setSignedIn(true);
      })
      .catch((error: unknown) => {
        setSignedIn(
          error instanceof Error && error.message === 'Teacher profile required'
        );
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="teacher-loading">
        <Spin size="large" />
      </div>
    );
  }
  if (!profile) {
    return <TeacherAccess signedIn={signedIn} onReady={setProfile} />;
  }
  return (
    <div className="teacher-app">
      <header className="teacher-app__header">
        <Typography.Title level={4}>原色有感 · 教师课堂</Typography.Title>
        <span>{profile.displayName}</span>
        <Button
          onClick={() => {
            void teacherAuthApi.logout().then(() => location.reload());
          }}
        >
          退出
        </Button>
      </header>
      <ClassroomsPage />
    </div>
  );
}
