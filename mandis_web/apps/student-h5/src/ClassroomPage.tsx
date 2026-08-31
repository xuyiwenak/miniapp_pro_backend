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

export function ClassroomPage() {
  const { accessCode = '' } = useParams();
  const flow = useClassroomFlow(accessCode);
  const [revisitingArtwork, setRevisitingArtwork] = useState(false);
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
  } else if (!flow.participation.consented) {
    content = (
      <ConsentStep
        locale={flow.locale}
        saving={flow.saving}
        onConsent={() => {
          void flow.consent();
        }}
      />
    );
  } else if (!flow.participation.profileCompleted) {
    content = (
      <ProfileStep
        locale={flow.locale}
        saving={flow.saving}
        onSubmit={(profile) => {
          void flow.saveProfile(profile);
        }}
      />
    );
  } else if (flow.participation.currentStage === 'pre_assessment') {
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
  } else if (flow.participation.currentStage === 'activity_in_progress') {
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
  } else if (flow.participation.currentStage === 'artwork_upload' || revisitingArtwork) {
    content = (
      <ArtworkStep
        locale={flow.locale}
        saving={flow.saving}
        classroomCode={revisitingArtwork ? undefined : flow.teacherUploadConfirmation?.classroomCode}
        revisiting={revisitingArtwork}
        onUpload={async (dataUrl) => {
          await flow.uploadArtwork(dataUrl);
          setRevisitingArtwork(false);
        }}
        onTeacherUpload={flow.requestTeacherUpload}
        onConfirmTeacherUpload={flow.confirmTeacherUpload}
        onCancel={() => setRevisitingArtwork(false)}
      />
    );
  } else if (flow.participation.currentStage === 'post_assessment') {
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
        onReviseArtwork={() => setRevisitingArtwork(true)}
        onComplete={flow.completeWithoutEcho}
        onFeedback={flow.submitFeedback}
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
      {content}
    </ClassroomShell>
  );
}
