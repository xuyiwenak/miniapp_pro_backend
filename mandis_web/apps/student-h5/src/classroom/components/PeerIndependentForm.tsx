import { useState } from 'react';
import { CheckOutlined, LockOutlined, SmileOutlined, CoffeeOutlined, ThunderboltOutlined,
  ExclamationCircleOutlined, UserOutlined, FireOutlined, RocketOutlined, MoreOutlined } from '@ant-design/icons';
import { EMOTION_OPTIONS, type PeerAnswers } from '@mandis/common/classroom-types';
import { VAD_ASSETS } from './vadAssets';
import { ScoreChoice } from './ReflectionInputs';

const ICONS = [SmileOutlined, CoffeeOutlined, ThunderboltOutlined, ExclamationCircleOutlined,
  UserOutlined, FireOutlined, LockOutlined, RocketOutlined, MoreOutlined];
const DIMENSIONS = [
  ['valence', '愉悦程度', 'Pleasantness'], ['arousal', '激活程度', 'Activation'],
  ['dominance', '掌控程度', 'Control'],
] as const;
export function PeerIndependentForm({ zh, saved, busy, consentGranted, onSave }: {
  zh: boolean; saved?: PeerAnswers; busy: boolean; consentGranted?: boolean;
  onSave: (answers: PeerAnswers, submit: boolean, consent: boolean) => Promise<void>;
}) {
  const [input, setInput] = useState<PeerAnswers>(saved ?? { emotions: [] });
  const [page, setPage] = useState(0);
  const [consent, setConsent] = useState(Boolean(consentGranted));
  const [error, setError] = useState('');
  const update = (patch: Partial<PeerAnswers>) => setInput({ ...input, ...patch });
  function next() {
    const emotionsReady = input.emotions.length > 0
      && (!input.emotions.includes('other') || Boolean(input.otherEmotion?.trim()));
    const ready = page === 0 ? emotionsReady && consent : page === 1
      ? DIMENSIONS.every(([field]) => input[field] !== undefined) : input.confidence !== undefined;
    if (!ready) {
      setError(zh ? '请完成本步选择后继续。' : 'Please complete the choices on this step.');
      return;
    }
    setError('');
    if (page < 2) setPage(page + 1); else void onSave(input, true, consent);
  }
  return <div className="peer-independent">
    <fieldset className="peer-ai-fields" disabled={busy}>
    {!consentGranted && <label className="peer-consent"><input type="checkbox" checked={consent}
      onChange={(e) => setConsent(e.target.checked)} />
      {zh ? '我同意本次匿名评价用于课堂研究' : 'I agree to use this anonymous review for classroom research'}</label>}
    {page === 0 && <>
      <h2>{zh ? '你从画面中感受到什么？' : 'What do you feel from this artwork?'}</h2>
      <p>{zh ? '选 1–3 个最接近的感觉' : 'Choose 1–3 feelings'}</p>
      <div className="emotion-choice__grid">{EMOTION_OPTIONS.map(([code, cn, en], index) => {
        const Icon = ICONS[index]; const selected = input.emotions.includes(code);
        return <label key={code} className={selected ? 'is-selected' : ''}>
          <input type="checkbox" checked={selected} disabled={busy || (!selected && input.emotions.length >= 3)}
            onChange={() => update({ emotions: selected ? input.emotions.filter((e) => e !== code)
              : [...input.emotions, code] })} /><Icon /><span>{zh ? cn : en}</span>
          {selected && <CheckOutlined className="choice-check" />}</label>;
      })}</div>
      {input.emotions.includes('other') && <label>{zh ? '其他感觉' : 'Other feeling'}
        <input maxLength={50} value={input.otherEmotion ?? ''}
          onChange={(e) => update({ otherEmotion: e.target.value })} /></label>}
    </>}
    {page === 1 && <><h2>{zh ? '画面带给你的感受' : 'Your impression of the artwork'}</h2>
      <p>{zh ? '这里评价的是作品，不是你现在的心情。' : 'Rate the artwork, rather than your current mood.'}</p>
      {DIMENSIONS.map(([field, cn, en]) => <fieldset className="visual-vad" key={field}>
        <legend>{zh ? cn : en}</legend><div className="visual-vad__grid">
          {VAD_ASSETS[field].map((src, index) => <label key={src} className={input[field] === index + 1 ? 'is-selected' : ''}>
            <input type="radio" name={`peer-${field}`} checked={input[field] === index + 1}
              onChange={() => update({ [field]: index + 1 })} aria-label={`${zh ? cn : en} ${index + 1}`} />
            <img src={src} alt="" /><span>{index + 1}</span>
          </label>)}
        </div></fieldset>)}
    </>}
    {page === 2 && <>
      <ScoreChoice label={zh ? '你对自己的判断有多大把握？' : 'How confident are you in your judgement?'}
        anchors={zh ? '1 完全没把握 · 7 非常有把握' : '1 Not confident · 7 Very confident'}
        value={input.confidence} onChange={(confidence) => update({ confidence })} />
      <label>{zh ? '一句话说说你的感受（选填）' : 'A few words about your impression (optional)'}
        <textarea maxLength={300} value={input.comment ?? ''}
          placeholder={zh ? '请勿填写姓名等身份信息' : 'Please omit identifying details'}
          onChange={(e) => update({ comment: e.target.value })} /></label>
      <p>{zh ? '提交后，这部分感受将锁定，不能根据 AI 解读修改。' : 'Submission locks this independent response before revealing AI.'}</p>
    </>}
    <p className="peer-step-count">{zh ? `第 ${page + 1} / 3 步` : `Step ${page + 1} of 3`}</p>
    {error && <p role="alert" className="form-error">{error}</p>}
    <button className="classroom-primary" disabled={busy} onClick={next}>
      {page < 2 ? (zh ? '下一步' : 'Next') : (zh ? '提交感受，查看 AI 解读' : 'Submit and view AI')}</button>
    {page > 0 && <button className="reflection-text-button" onClick={() => setPage(page - 1)}>{zh ? '上一步' : 'Back'}</button>}
    <button className="reflection-text-button" disabled={busy || !consent}
      onClick={() => void onSave(input, false, consent)}>{zh ? '保存，稍后继续' : 'Save for later'}</button>
    <p className="peer-lock-note"><LockOutlined /> {zh ? '提交独立评价后，解锁 AI 解读' : 'AI unlocks after independent submission'}</p>
    </fieldset>
  </div>;
}
