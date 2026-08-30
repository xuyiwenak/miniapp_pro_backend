import { useState } from 'react';
import type { ClassroomInfo, Locale } from '@mandis/common/classroom-types';
import { CourseProgress } from './CourseProgress';

export function ActivityStep({
  locale,
  classroom,
  saving,
  onComplete,
}: {
  locale: Locale;
  classroom: ClassroomInfo;
  saving: boolean;
  onComplete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const zh = locale === 'zh-CN';
  return (
    <main className="course-step-screen">
      <CourseProgress locale={locale} currentStep={2} />
      <section className="classroom-card activity-card">
        <p className="classroom-eyebrow">{zh ? '第 2 步 · 线下创作' : 'STEP 2 · CREATE'}</p>
        <h1>{zh ? '课前测评已经完成' : 'Your pre-test is complete'}</h1>
        <p>
          {zh
            ? '请跟随教师完成本次线下艺术创作。你可以关闭这个页面，完成后重新扫码继续。'
            : 'Follow your teacher for the offline art activity. You may close this page and scan again when finished.'}
        </p>
        <div className="activity-theme-card">
          <span>{zh ? '本次活动主题' : 'Activity theme'}</span>
          <strong>{classroom.activityTheme}</strong>
        </div>
        {!confirming ? (
          <button className="classroom-primary" type="button" onClick={() => setConfirming(true)}>
            {zh ? '我已完成创作，继续' : 'I have finished creating'}
          </button>
        ) : (
          <div className="inline-confirm" role="alertdialog" aria-label={zh ? '确认完成创作' : 'Confirm completion'}>
            <p>
              {zh
                ? '请确认你已经完成本次课堂创作。继续后将进入作品上传和课后测评。'
                : 'Confirm that you finished creating. Next you will upload and complete the post-test.'}
            </p>
            <div>
              <button className="classroom-secondary" type="button" onClick={() => setConfirming(false)}>
                {zh ? '返回上课中' : 'Go back'}
              </button>
              <button className="classroom-primary" type="button" disabled={saving} onClick={onComplete}>
                {zh ? '确认继续' : 'Confirm'}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
