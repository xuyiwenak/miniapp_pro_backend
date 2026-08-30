import { useState } from 'react';
import type { Locale } from '@mandis/common/classroom-types';

export function ConsentStep({ locale, saving, onConsent }: { locale: Locale; saving: boolean; onConsent: () => void }) {
  const zh = locale === 'zh-CN';
  return (
    <main className="classroom-card preparation-card">
      <p className="classroom-eyebrow">{zh ? '参与准备' : 'BEFORE YOU BEGIN'}</p>
      <h1>{zh ? '用户须知' : 'Participant notice'}</h1>
      <div className="notice-copy">
        <p>
          {zh
            ? '本次课堂会记录你的课前与课后状态、作品和使用体验，用于课堂反馈与去标识化研究统计。'
            : 'This session records pre- and post-activity states, artwork and experience for classroom feedback and de-identified research.'}
        </p>
        <p>
          {zh
            ? '作品会由合规的AI服务辅助整理颜色、线条和构图信息。AI不用于心理诊断，也不参与课程评分。'
            : 'A compliant AI service helps organise colour, line and composition observations. It does not diagnose or grade you.'}
        </p>
        <p>
          {zh
            ? '作品图片或自愿感受用于论文、会议或教学展示时，将在最后一步单独征求你的授权。'
            : 'Separate optional permission for publication or teaching display is requested at the final step.'}
        </p>
      </div>
      <button className="classroom-primary" type="button" disabled={saving} onClick={onConsent}>
        {zh ? '我已阅读并同意，开始参与' : 'I have read and agree to participate'}
      </button>
    </main>
  );
}

export function ProfileStep({
  locale,
  saving,
  onSubmit,
}: {
  locale: Locale;
  saving: boolean;
  onSubmit: (profile: Record<string, string>) => void;
}) {
  const zh = locale === 'zh-CN';
  const [gender, setGender] = useState('prefer_not');
  const [artExperience, setArtExperience] = useState('none');
  return (
    <main className="classroom-card preparation-card">
      <p className="classroom-eyebrow">{zh ? '参与准备' : 'BEFORE YOU BEGIN'}</p>
      <h1>{zh ? '基础研究资料' : 'Research information'}</h1>
      <p>
        {zh ? '不填写姓名、手机号或学号。请选择最接近的情况。' : 'No name, phone number or student ID is collected.'}
      </p>
      <label>
        {zh ? '性别' : 'Gender'}
        <select value={gender} onChange={(event) => setGender(event.target.value)}>
          <option value="female">{zh ? '女' : 'Woman'}</option>
          <option value="male">{zh ? '男' : 'Man'}</option>
          <option value="other">{zh ? '其他' : 'Other'}</option>
          <option value="prefer_not">{zh ? '不愿透露' : 'Prefer not to say'}</option>
        </select>
      </label>
      <label>
        {zh ? '艺术创作经验' : 'Art-making experience'}
        <select value={artExperience} onChange={(event) => setArtExperience(event.target.value)}>
          <option value="none">{zh ? '几乎没有' : 'Little or none'}</option>
          <option value="occasional">{zh ? '偶尔创作' : 'Occasional'}</option>
          <option value="regular">{zh ? '经常创作' : 'Regular'}</option>
        </select>
      </label>
      <button
        className="classroom-primary"
        type="button"
        disabled={saving}
        onClick={() => onSubmit({ gender, artExperience })}
      >
        {zh ? '进入课前测评' : 'Continue to pre-test'}
      </button>
    </main>
  );
}
