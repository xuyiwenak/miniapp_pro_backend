import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TeacherApp } from './teacher/TeacherApp';
import { StudentApp } from './student/StudentApp';
import './styles.css';
function App() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => { const change = () => setHash(location.hash);
    addEventListener('hashchange', change); return () => removeEventListener('hashchange', change); }, []);
  const match = hash.match(/^#\/join\/([a-zA-Z0-9_-]+)$/);
  return match ? <StudentApp key={match[1]} code={match[1]} /> : <TeacherApp />;
}
const root = document.getElementById('root');
if (root) createRoot(root).render(<StrictMode><App /></StrictMode>);
