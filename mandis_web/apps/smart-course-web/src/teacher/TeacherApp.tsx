import { useState } from 'react';
import { useTeacherCourses } from './useTeacherCourses';
import { Brand, Loading, Notice, STATUS_COPY } from '../components';
import { Login } from './Login';
import { CreateCourse } from './CreateCourse';
import { CourseDashboard } from './CourseDashboard';
export function TeacherApp() {
  const { signedIn, courses, selected, setSelected, data, error, agentReady, load, refresh, logout } =
    useTeacherCourses();
  const [creating, setCreating] = useState(false);
  if (signedIn === null) return <Loading />;
  if (!signedIn) return <Login onReady={() => void load()} />;
  return <div className="teacher-layout"><aside className="sidebar"><Brand />
    <button className="primary" onClick={() => setCreating(true)}>新建课程</button>
    <nav aria-label="课程列表">{courses.map(course => <button key={course.courseId}
      className={selected === course.courseId && !creating ? 'selected' : ''}
      onClick={() => { setSelected(course.courseId); setCreating(false); }}>
      <strong>{course.title}</strong><small>{STATUS_COPY[course.status]}</small></button>)}</nav>
    <button onClick={() => void logout()}>退出登录</button></aside>
  <main className="workspace"><div className="toolbar"><span>教学空间</span>
    <button onClick={() => void refresh()}>刷新</button></div>
  <Notice>{error}</Notice>{agentReady === false && <Notice>课程助教尚未配置。可以建课和邀请学生，智能问答暂不可用。</Notice>}
  {creating && <CreateCourse onCancel={() => setCreating(false)} onCreated={course => {
    setSelected(course.courseId); setCreating(false); void load();
  }} />}
  {!creating && data && <CourseDashboard key={data.course.courseId} data={data} onChange={() => void refresh()} />}
  {!creating && !data && selected && <Loading />}
  {!creating && !data && !selected && <section className="panel empty"><p className="eyebrow">从一堂课开始</p>
    <h1>把创作与交流放在一起</h1><p>创建课程，邀请学生，助教会在他们需要时提供帮助。</p></section>}
  </main></div>;
}
