import { COURSE_STEPS, GRADE_LABELS } from '@mandis/common/classroom-copy';
import type { ClassroomInfo, Locale } from '@mandis/common/classroom-types';

type Props = { locale: Locale; classroom: ClassroomInfo; starting: boolean; onConfirm: () => void };

export function ClassroomConfirm({ locale, classroom, starting, onConfirm }: Props) {
  const zh = locale === 'zh-CN';
  const canJoin = classroom.status === 'open';
  return (
    <main className="classroom-card classroom-confirm">
      <span className="classroom-status" data-status={classroom.status}>
        {canJoin ? (zh ? '课堂开放中' : 'CLASSROOM OPEN') : zh ? '课堂暂不可加入' : 'NOT ACCEPTING PARTICIPANTS'}
      </span>
      <p className="classroom-confirm__label">{zh ? '课程' : 'COURSE'}</p>
      <h1>{classroom.courseName}</h1>
      <p className="classroom-confirm__label">{zh ? '本次课堂' : 'SESSION'}</p>
      <h2>{classroom.sessionTitle}</h2>
      <p className="classroom-theme">{classroom.activityTheme}</p>
      <dl className="classroom-details">
        <div>
          <dt>{zh ? '日期' : 'Date'}</dt>
          <dd>{classroom.classDate}</dd>
        </div>
        <div>
          <dt>{zh ? '时间' : 'Time'}</dt>
          <dd>
            {classroom.startTime}–{classroom.endTime}
          </dd>
        </div>
        <div>
          <dt>{zh ? '年级' : 'Level'}</dt>
          <dd>{GRADE_LABELS[locale][classroom.gradeLevel]}</dd>
        </div>
        <div>
          <dt>{zh ? '教师' : 'Teacher'}</dt>
          <dd>{classroom.teacherDisplayName}</dd>
        </div>
        <div>
          <dt>{zh ? '地点' : 'Location'}</dt>
          <dd>{classroom.locationText}</dd>
        </div>
      </dl>
      <section className="flow-preview">
        <h3>{zh ? '本次课程共 5 步' : 'Your five-step session'}</h3>
        <ol>
          {COURSE_STEPS[locale].map((step, index) => (
            <li key={step}>
              <span>{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </section>
      <p className="same-device-note">
        {zh
          ? '完成全部流程前，请尽量使用同一手机和浏览器。'
          : 'Please use the same phone and browser until you finish.'}
      </p>
      <button className="classroom-primary" type="button" disabled={!canJoin || starting} onClick={onConfirm}>
        {starting ? (zh ? '正在进入…' : 'Joining…') : zh ? '确认课堂，查看用户须知' : 'Confirm class and view notice'}
      </button>
    </main>
  );
}
