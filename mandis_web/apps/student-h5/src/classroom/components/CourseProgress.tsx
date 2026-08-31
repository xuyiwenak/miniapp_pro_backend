import { COURSE_STEPS } from '@mandis/common/classroom-copy';
import type { Locale } from '@mandis/common/classroom-types';

type Props = {
  locale: Locale;
  currentStep: number;
  pendingArtwork?: boolean;
  completed?: boolean;
  failedStep?: number;
};

function statusForStep(
  step: number,
  currentStep: number,
  pendingArtwork: boolean,
  completed: boolean,
  failedStep?: number
): string {
  if (step === failedStep) return 'failed';
  if (step === 3 && pendingArtwork) return 'pending';
  if (completed || step < currentStep) return 'complete';
  if (step === currentStep) return 'current';
  return 'future';
}

export function CourseProgress({ locale, currentStep, pendingArtwork = false, completed = false, failedStep }: Props) {
  return (
    <nav className="course-progress" aria-label={locale === 'zh-CN' ? '课程进度' : 'Course progress'}>
      <p>
        {locale === 'zh-CN' ? `课程进度 · 第 ${currentStep} 步，共 5 步` : `Course progress · Step ${currentStep} of 5`}
      </p>
      <ol>
        {COURSE_STEPS[locale].map((label, index) => {
          const step = index + 1;
          const status = statusForStep(step, currentStep, pendingArtwork, completed, failedStep);
          return (
            <li key={label} data-status={status} aria-current={status === 'current' ? 'step' : undefined}>
              <span>{status === 'complete' ? '✓' : status === 'failed' ? '!' : step}</span>
              <small>{label}</small>
              {status === 'pending' && <em>{locale === 'zh-CN' ? '待补充' : 'Pending'}</em>}
              {status === 'failed' && <em>{locale === 'zh-CN' ? '失败' : 'Failed'}</em>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
