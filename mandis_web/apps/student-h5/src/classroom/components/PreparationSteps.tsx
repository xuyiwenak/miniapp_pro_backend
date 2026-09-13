import { useState } from 'react';
import type {
  ClassroomInfo,
  Locale,
  ParticipantGender,
  ParticipantProfile,
} from '@mandis/common/classroom-types';

type ConsentSectionCopy = { title: string; text: string };

const ZH_CONSENT_SECTIONS: ConsentSectionCopy[] = [
  {
    title: '自愿参与',
    text: '参与完全自愿，与课程成绩、学分、考勤或学习机会无关。' +
      '你可以不同意并关闭页面，也可以在参与过程中随时停止，不会对课程有任何影响。'
  },
  {
    title: '可能风险与收益',
    text: '情绪自评可能引起轻微不适，作品也可能无意包含姓名、签名等识别线索。' +
      '请避免上传可识别信息；如感到不适可停止。参与没有保证的个人收益，' +
      '但可能帮助改进课堂与研究方法。',
  },
  {
    title: '数据与AI处理',
    text: '系统不收集姓名、手机号或学号，并使用匿名课堂编号关联记录。' +
      '获授权的研究人员可访问原始记录；配置的AI服务仅处理作品的颜色、线条和构图' +
      '及可读画内文字，' +
      '不用于心理诊断、评分或学生管理决策。',
  },
  {
    title: '研究使用与公开共享',
    text: '去标识化的量表数值和派生统计可用于论文、会议，' +
      '并存入公开研究资料库。原始作品图片和自由文本不会因此公开；' +
      '本版不提供公开作品展示；敏感文本研究使用需单独授权。' +
      '公开数据一经去标识化发布，通常无法再定位并删除个人记录。',
  },
];

const EN_CONSENT_SECTIONS: ConsentSectionCopy[] = [
  {
    title: 'Voluntary participation',
    text: 'Participation is voluntary and is unrelated to grades, academic credit, attendance or learning ' +
      'opportunities. You may decline by closing this page or stop at any time.',
  },
  {
    title: 'Possible risks and benefits',
    text: 'Self-report questions may cause mild discomfort, and artwork may accidentally contain identifying ' +
      'details such as a name or signature. Please avoid identifiable content and stop if uncomfortable. ' +
      'There is no guaranteed personal benefit, but the study may improve classroom and research methods.',
  },
  {
    title: 'Data and AI processing',
    text: 'The system does not collect your name, phone number or student ID and links records using an anonymous ' +
      'classroom code. Authorised researchers may access raw records. A configured AI service processes colour, ' +
      'line and composition information only; it is not used for diagnosis, grading or student-management decisions.',
  },
  {
    title: 'Research use and public sharing',
    text: 'De-identified questionnaire values and derived statistics may be used in papers and conferences and ' +
      'deposited in a public research repository. Original artwork and free text are not made public ' +
      'under this consent; sensitive text requires separate permission. Use in papers, ' +
      'conferences ' +
      'or teaching displays. Once de-identified data are publicly released, an individual record usually cannot be ' +
      'located and removed.',
  },
];

function ConsentSection({ section }: { section: ConsentSectionCopy }) {
  return (
    <section>
      <h2>{section.title}</h2>
      <p>{section.text}</p>
    </section>
  );
}

function ConsentDetails({ locale, classroom }: { locale: Locale; classroom: ClassroomInfo }) {
  const zh = locale === 'zh-CN';
  const sections = zh ? ZH_CONSENT_SECTIONS : EN_CONSENT_SECTIONS;
  const purpose = zh
    ? '本研究了解艺术课堂中的活动前后感受及作品分析的一致性。' +
      `流程预计在本次课堂（${classroom.startTime}–${classroom.endTime}）内完成，` +
      '包括基础资料、活动前后自评、作品上传和可选体验反馈。'
    : 'This study examines pre- and post-activity feelings and the repeatability of artwork observations. ' +
      `The process takes place during this class (${classroom.startTime}–${classroom.endTime}) and includes basic ` +
      'information, pre- and post-activity self-reports, artwork upload and optional feedback.';
  return (
    <div className="notice-copy">
      <section>
        <h2>{zh ? '研究目的与流程' : 'Purpose and procedures'}</h2>
        <p>{purpose}</p>
      </section>
      {sections.map((section) => <ConsentSection key={section.title} section={section} />)}
    </div>
  );
}

export function ConsentStep({ locale, classroom, saving, onConsent }: {
  locale: Locale;
  classroom: ClassroomInfo;
  saving: boolean;
  onConsent: (ai: boolean, text: boolean) => void;
}) {
  const zh = locale === 'zh-CN';
  const [accepted, setAccepted] = useState(false);
  const [allowAi, setAllowAi] = useState(false);
  const [allowText, setAllowText] = useState(false);
  return (
    <main className="classroom-card preparation-card consent-card">
      <p className="classroom-eyebrow">{zh ? '参与准备' : 'BEFORE YOU BEGIN'}</p>
      <h1>{zh ? '研究参与知情说明' : 'Research participation information'}</h1>
      <p>
        {zh
          ? '请阅读以下内容后自主决定是否参加。'
          : 'Please read this information before deciding whether to participate.'}
      </p>
      <ConsentDetails locale={locale} classroom={classroom} />
      <label className="consent-check">
        <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
        <span>
          {zh
            ? '我确认已满18周岁，已阅读并理解上述说明，自愿参加，' +
              '并同意按上述范围使用和公开共享' +
              '去标识化研究数据。'
            : 'I confirm that I am at least 18 years old, have read and understood the information above, ' +
              'voluntarily agree to participate, and consent to the described use and public sharing of ' +
              'de-identified research data.'}
        </span>
      </label>
      <label className="consent-check"><input type="checkbox" checked={allowAi}
        onChange={(event) => setAllowAi(event.target.checked)} />
        {zh ? '允许私人 AI 分析作品（包括可读的画内文字）；不同意也可继续记录。'
          : 'Allow private AI analysis of my artwork, including readable embedded text (optional).'}</label>
      <label className="consent-check"><input type="checkbox" checked={allowText}
        onChange={(event) => setAllowText(event.target.checked)} />
        {zh ? '允许将我的意图文字和评价评论用于去标识研究（选填）。'
          : 'Allow de-identified research use of my intention text and comments (optional).'}</label>
      <button className="classroom-primary" type="button" disabled={saving || !accepted} onClick={() => onConsent(allowAi, allowText)}>
        {saving
          ? (zh ? '正在记录同意…' : 'Recording consent…')
          : (zh ? '确认同意并开始' : 'I consent and wish to participate')}
      </button>
      <p className="consent-version">{zh ? '知情说明版本' : 'Consent information version'}: 2026-09-13</p>
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
  onSubmit: (profile: ParticipantProfile) => void;
}) {
  const zh = locale === 'zh-CN';
  const [gender, setGender] = useState<ParticipantGender | ''>('');
  const [artExperience, setArtExperience] = useState<ParticipantProfile['artExperience']>('none');
  return (
    <main className="classroom-card preparation-card">
      <p className="classroom-eyebrow">{zh ? '参与准备' : 'BEFORE YOU BEGIN'}</p>
      <h1>{zh ? '基础研究资料' : 'Research information'}</h1>
      <p>
        {zh
          ? '不填写姓名、手机号或学号。请选择最接近的情况。'
          : 'No name, phone number or student ID is collected.'}
      </p>
      <label>
        {zh ? '性别' : 'Gender'}
        <select
          value={gender}
          onChange={(event) => setGender(event.target.value as ParticipantGender)}
        >
          <option value="" disabled>{zh ? '请选择' : 'Select'}</option>
          <option value="female">{zh ? '女' : 'Woman'}</option>
          <option value="male">{zh ? '男' : 'Man'}</option>
        </select>
      </label>
      <label>
        {zh ? '艺术创作经验' : 'Art-making experience'}
        <select
          value={artExperience}
          onChange={(event) => setArtExperience(event.target.value as ParticipantProfile['artExperience'])}
        >
          <option value="none">{zh ? '几乎没有' : 'Little or none'}</option>
          <option value="occasional">{zh ? '偶尔创作' : 'Occasional'}</option>
          <option value="regular">{zh ? '经常创作' : 'Regular'}</option>
        </select>
      </label>
      <button
        className="classroom-primary"
        type="button"
        disabled={saving || !gender}
        onClick={() => {
          if (gender) onSubmit({ gender, artExperience });
        }}
      >
        {zh ? '进入课前测评' : 'Continue to pre-test'}
      </button>
    </main>
  );
}
