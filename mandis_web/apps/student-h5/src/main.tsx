import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ClassroomPage } from './ClassroomPage';
import './student.css';
import './classroom/classroom.css';

function StudentApp() {
  return (
    <BrowserRouter basename="/classroom">
      <Routes>
        <Route path="/:accessCode" element={<ClassroomPage />} />
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StudentApp />
  </StrictMode>
);
