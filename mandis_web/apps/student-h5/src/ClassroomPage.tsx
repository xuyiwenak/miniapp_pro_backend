import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ClassroomShell } from './classroom/components/ClassroomShell';
import { ClassroomConfirm } from './classroom/components/ClassroomConfirm';
import { ConsentStep, ProfileStep } from './classroom/components/PreparationSteps';
import { AssessmentStep } from './classroom/components/AssessmentStep';
import { ActivityStep } from './classroom/components/ActivityStep';
import { ArtworkStep } from './classroom/components/ArtworkStep';
import { EchoStep } from './classroom/components/EchoStep';
import { useClassroomFlow } from './classroom/useClassroomFlow';
import { HomeOutlined, AppstoreOutlined } from '@ant-design/icons';
import { ClassroomGallery } from './classroom/components/ClassroomGallery';
import { GallerySharing } from './classroom/components/GallerySharing';
import './classroom/gallery.css';

export function ClassroomPage() {
  const { accessCode = '' } = useParams();
  const flow = useClassroomFlow(accessCode);
  const [revisitingArtwork, setRevisitingArtwork] = useState(false);
  const [view, setView] = useState<'classroom' | 'gallery'>('classroom');
  const zh = flow.locale === 'zh-CN';

  if (flow.loading) return <div className="classroom-loading">{zh ? '正在读取课堂…' : 'Loading classroom…'}</div>;
  if (!flow.classroom)
    return <div className="classroom-loading">{flow.error || (zh ? '课堂不存在' : 'Classroom not found')}</div>;

  let content;
  if (!flow.participation) {
    content = (
      <ClassroomConfirm
        locale={flow.locale}
        classroom={flow.classroom}
        starting={flow.saving}
        onConfirm={() => {
          void flow.start();
        }}
      />
    );
  } else if (!flow.participation.readOnly && !flow.participation.consented) {
    content = (
      <ConsentStep
        locale={flow.locale}
        classroom={flow.classroom}
        saving={flow.saving}
        onConsent={() => {
          void flow.consent();
        }}
      />
    );
  } else if (!flow.participation.readOnly && (!flow.participation.profileCompleted)) {
    content = (
      <ProfileStep
        locale={flow.locale}
        saving={flow.saving}
        onSubmit={(profile) => {
          void flow.saveProfile(profile);
        }}
      />
    );
  } else if (!flow.participation.readOnly && (flow.participation.currentStage === 'pre_assessment')) {
    content = (
      <AssessmentStep
        accessCode={accessCode}
        locale={flow.locale}
        timepoint="pre"
        saved={flow.participation.preAssessment}
        onDraft={(page, answers, recovered) => flow.saveDraft('pre', page, answers, recovered)}
        onSubmit={(page, answers, duration, recovered) =>
          flow.submitAssessment('pre', page, answers, duration, recovered)
        }
      />
    );
  } else if (!flow.participation.readOnly && (flow.participation.currentStage === 'activity_in_progress')) {
    content = (
      <ActivityStep
        locale={flow.locale}
        classroom={flow.classroom}
        saving={flow.saving}
        onComplete={() => {
          void flow.completeActivity();
        }}
      />
    );
  } else if (!flow.participation.readOnly && (flow.participation.currentStage === 'artwork_upload' || revisitingArtwork)) {
    content = (
      <ArtworkStep
        locale={flow.locale}
        saving={flow.saving}
        classroomCode={revisitingArtwork ? undefined : flow.teacherUploadConfirmation?.classroomCode}
        revisiting={revisitingArtwork}
        sharing={<GallerySharing token={flow.token} locale={flow.locale} />}
        onUpload={async (dataUrl) => {
          await flow.uploadArtwork(dataUrl);
          setRevisitingArtwork(false);
        }}
        onTeacherUpload={flow.requestTeacherUpload}
        onConfirmTeacherUpload={flow.confirmTeacherUpload}
        onCancel={() => setRevisitingArtwork(false)}
      />
    );
  } else if (!flow.participation.readOnly && (flow.participation.currentStage === 'post_assessment')) {
    content = (
      <AssessmentStep
        accessCode={accessCode}
        locale={flow.locale}
        timepoint="post"
        saved={flow.participation.postAssessment}
        pendingArtwork={flow.participation.artworkStatus === 'teacher_upload_pending'}
        onDraft={(page, answers, recovered) => flow.saveDraft('post', page, answers, recovered)}
        onSubmit={(page, answers, duration, recovered) =>
          flow.submitAssessment('post', page, answers, duration, recovered)
        }
      />
    );
  } else {
    content = (
      <EchoStep
        locale={flow.locale}
        classroom={flow.classroom}
        participation={flow.participation}
        completed={flow.participation.currentStage === 'completed'}
        loadEcho={flow.loadEcho}
        loadArtwork={flow.loadArtwork}
        onReviseArtwork={() => setRevisitingArtwork(true)}
        onComplete={flow.completeWithoutEcho}
        onFeedback={flow.submitFeedback}
        onIntention={flow.saveIntention}
        onDraft={flow.saveEvaluationDraft}
        onViewed={flow.markViewed}
        onRecovery={flow.createRecovery}
      />
    );
  }

  return (
    <ClassroomShell locale={flow.locale} onLocaleChange={flow.changeLocale}>
      {flow.error && (
        <p className="classroom-global-error" role="alert">
          {flow.error}
        </p>
      )}
      {view === 'gallery' && flow.participation?.consented
        ? <ClassroomGallery token={flow.token} locale={flow.locale} /> : content}
      {flow.participation?.consented && <nav className="gallery-navigation" aria-label={zh ? '课堂导航' : 'Classroom navigation'}>
        <button aria-current={view === 'classroom' ? 'page' : undefined} onClick={() => setView('classroom')}>
          <HomeOutlined /><span>{zh ? '我的课堂' : 'My classroom'}</span></button>
        <button aria-current={view === 'gallery' ? 'page' : undefined} onClick={() => setView('gallery')}>
          <AppstoreOutlined /><span>{zh ? '课堂作品' : 'Classroom artworks'}</span></button>
      </nav>}
    </ClassroomShell>
  );
}
