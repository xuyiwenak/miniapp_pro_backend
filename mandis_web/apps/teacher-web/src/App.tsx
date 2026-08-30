import { useEffect, useState } from 'react';
import { Spin } from 'antd';
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
      <ClassroomsPage
        teacherDisplayName={profile.displayName}
        onLogout={() => {
          void teacherAuthApi.logout().then(() => location.reload());
        }}
      />
    </div>
  );
}
