import { useState } from 'react';
import { UserOutlined, PictureOutlined, ExperimentOutlined, RightOutlined } from '@ant-design/icons';
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
      '本版不提供公开作品展示；你的作品意图文字和评价评论可供获授权的研究人员用于去标识研究。' +
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
      'line, composition and readable text within the artwork; it is not used for diagnosis, grading or student-management decisions.',
  },
  {
    title: 'Research use and public sharing',
    text: 'De-identified questionnaire values and derived statistics may be used in papers and conferences and ' +
      'deposited in a public research repository. Original artwork and free text are not made public ' +
      'under this consent. Authorised researchers may use intention text and feedback comments for de-identified ' +
      'research. Once de-identified data are publicly released, an individual record usually cannot be ' +
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
      '包括基础资料、活动前后自评、作品上传、表达意图与回响评价。参与者须已满18周岁。'
    : 'This study examines pre- and post-activity feelings and the repeatability of artwork observations. ' +
      `The process takes place during this class (${classroom.startTime}–${classroom.endTime}) and includes basic ` +
      'information, pre- and post-activity self-reports, artwork, intention and feedback. Participants must be 18 or older.';
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

const CONSENT_OVERVIEW = [
  { Icon: UserOutlined, title: ['匿名参与', 'Anonymous participation'],
    text: ['不填写姓名、学号或手机号', 'No name, student ID or phone number is collected.'] },
  { Icon: PictureOutlined, title: ['AI 作品回响', 'AI artwork reflection'],
    text: ['根据作品图片与画面文字提供解读，不用于心理诊断或课程评分。',
      'Interprets your artwork and its text; not used for diagnosis or grading.'] },
  { Icon: ExperimentOutlined, title: ['研究使用', 'Research use'],
    text: ['参与记录、作品意图与评价将按说明用于研究。',
      'Participation records, intentions and feedback are used for research as described.'] },
];
function ConsentOverview({ zh }: { zh: boolean }) {
  return <div className="consent-overview">{CONSENT_OVERVIEW.map(({ Icon, title, text }) =>
    <section className="consent-overview__row" key={title[1]}>
      <span className="consent-overview__icon"><Icon aria-hidden /></span>
      <div><h2>{title[zh ? 0 : 1]}</h2><p>{text[zh ? 0 : 1]}</p></div>
    </section>)}</div>;
}
export function ConsentStep({ locale, classroom, saving, onConsent }: {
  locale: Locale; classroom: ClassroomInfo; saving: boolean; onConsent: () => void;
}) {
  const zh = locale === 'zh-CN';
  const [accepted, setAccepted] = useState(false);
  return <main className="classroom-card consent-card classroom-redesign">
    <p className="redesign-step">{zh ? '入场准备' : 'Before you begin'}</p>
    <h1>{zh ? '开始前，了解这次课堂' : 'Before we begin'}</h1>
    <p className="redesign-intro">{zh ? '请先阅读本次课堂的参与说明。' : 'Please read the participation information.'}</p>
    <ConsentOverview zh={zh} />
    <details className="consent-details">
      <summary>{zh ? '阅读完整课堂参与说明' : 'Read the full participation information'}<RightOutlined aria-hidden /></summary>
      <ConsentDetails locale={locale} classroom={classroom} />
    </details>
    <label className="consent-check consent-check--single">
      <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
      <span>{zh ? '我已阅读并同意《课堂参与说明》' : 'I have read and agree to the participation information.'}</span>
    </label>
    <button className="classroom-primary" type="button" disabled={saving || !accepted} onClick={onConsent}>
      {saving ? (zh ? '正在记录同意…' : 'Saving…') : (zh ? '确认并进入课堂' : 'Confirm and enter')}
    </button>
  </main>;
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
