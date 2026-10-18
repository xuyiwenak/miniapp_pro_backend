import { useState } from 'react';
import { WatercolorBackdrop } from '@education/ui';
import { STEPS, sealText, type DesignView, type PatternState, type Ring } from '@pattern/contract';
import { useDesign } from './useDesign';
import { usePreview } from './usePreview';
import { MotifStep } from './MotifStep';
import { RingControls } from './RingControls';
import { PlatePreview, PlateSettings } from './PlateStep';
import { CeramicPanel } from './CeramicPanel';
import { ResultStep } from './ResultStep';
import { Choices } from './controls';
import { AssistantPanel } from '../AssistantPanel';
import { Loading, Notice } from '../../components';
import type { Participation, Turn } from '../../types';
import './pattern.css';
type Props = { data: Participation; token: string; onComplete: () => void;
  onTurn: (turn: Turn) => void; completing: boolean; participationError: string };
export function PatternClass(props: Props) {
  const { data, token } = props;
  const design = useDesign(data.course.courseId, token);
  const [ringIndex, setRingIndex] = useState(0); const [assistant, setAssistant] = useState(false);
  const { state, saved } = design; const closed = data.course.status !== 'open';
  const activeRing = state.template === 'single' ? 0 : ringIndex;
  const validSeal = !state.seal.enabled || Boolean(sealText(state.seal.name));
  const view = usePreview(data.course.courseId, token, state, activeRing,
    Boolean(saved) && validSeal && state.step !== 4, closed);
  const updateRing = (ring: Ring) => design.setState(old => ({ ...old,
    rings: old.rings.map((value, i) => i === activeRing ? ring : value) as PatternState['rings'] }));
  return <WatercolorBackdrop><main className="pattern-shell">
    <PatternHeader title={data.course.title} state={state} setStep={step => design.setState({ ...state, step })}
      disabled={design.busy} />
    <Notice>{props.participationError || design.error || view.error}</Notice>
    {closed && <p className="notice">课程已结束，设计与已保存成品可查看，不能再修改。</p>}
    {design.loading && <Loading />}
    {!design.loading && !saved && <button onClick={() => void design.reload()}>重新载入</button>}
    {!design.loading && saved && <PatternBody {...props} design={design} view={view} closed={closed}
      activeRing={activeRing}
      setRingIndex={setRingIndex} updateRing={updateRing} validSeal={validSeal} />}
    <footer className="pattern-footer"><button disabled={!data.agentReady || closed}
      onClick={() => setAssistant(true)}>问问助教 →</button>
    <span>{design.dirty ? '有未保存的调整，点击下一步或保存设计后保留。' : '原稿与设计分别保留。'}</span></footer>
    {assistant && <AssistantPanel courseId={data.course.courseId} token={token}
      artworks={designArtworks(design.saved, data)}
      turns={data.turns} initialMode="question" disabled={closed} onClose={() => setAssistant(false)} onTurn={props.onTurn} />}
  </main></WatercolorBackdrop>;
}
function PatternHeader({ title, state, setStep, disabled }: {
  title: string; state: PatternState; setStep: (step: number) => void; disabled: boolean;
}) {
  return <><header className="pattern-brand"><div className="brand"><span>原色有感</span><small>smartCourse · 青花课堂</small></div>
    <small>{title}</small></header><nav className="pattern-progress" aria-label="创作步骤">
    {STEPS.map((title, i) => <button key={title} aria-current={state.step === i + 1 ? 'step' : undefined}
      disabled={disabled || (i > 0 && !state.centerAssetId)} onClick={() => setStep(i + 1)}>
      <span>{i + 1}</span>{title}</button>)}</nav></>;
}
type BodyProps = Props & { design: ReturnType<typeof useDesign>; view: ReturnType<typeof usePreview>;
  closed: boolean; activeRing: number; setRingIndex: (index: number) => void; updateRing: (ring: Ring) => void;
  validSeal: boolean };
function PatternBody(props: BodyProps) {
  const { design, view, closed, validSeal } = props;
  const { state, saved, setState, busy } = design;
  if (!saved) return null;
  const output = saved.exports.at(-1);
  return <section className="pattern-paper"><fieldset disabled={closed || busy} className="pattern-fields">
    {state.step === 1 && <MotifStep state={state} asset={saved.assets.find(a => a.assetId === state.centerAssetId)}
      preview={view.preview} onChange={setState} busy={busy || !props.data.uploadReady}
      onUpload={file => void design.upload(file, 'center')} />}
    {(state.step === 2 || state.step === 3) && <CompositionSteps {...props} />}
  </fieldset>
  {state.step === 4 && <ResultStep saved={saved} state={state} dirty={design.dirty} onChange={setState}
    onGenerate={() => void design.generate()} busy={busy} closed={closed} />}
  {state.step === 4 && output && <CeramicPanel courseId={props.data.course.courseId}
    token={props.token} revision={output.revision}
    current={!design.dirty && output.revision === saved.revision}
    closed={closed} ready={Boolean(saved.ceramicReady)} />}
  {!props.data.uploadReady && <Notice>上传服务未配置，请先保留自己的原稿。</Notice>}
  <div className="pattern-bottom">
    {state.step > 1 && <button disabled={busy}
      onClick={() => setState({ ...state, step: state.step - 1 })}>上一步</button>}
    {state.step < 3 && <button className="primary"
      disabled={busy || closed || !state.centerAssetId || !validSeal
        || Boolean(view.error) || view.pending} onClick={() => void design.advance(state.step + 1)}>
      {busy ? '正在保存…' : `下一步：${STEPS[state.step]}`}</button>}
    {state.step === 3 && <button className="primary" disabled={busy || closed || !validSeal || !state.centerAssetId
        || Boolean(view.error) || view.pending} onClick={() => void design.generate()}>{busy ? '正在生成…' : '生成我的成品'}</button>}
    {state.step === 4 && !props.data.completed && <button className="primary"
      disabled={busy || props.completing || closed} aria-busy={props.completing} onClick={props.onComplete}>
      {props.completing ? '正在保存完成状态…' : '完成本次创作'}</button>}
    {state.step === 4 && props.data.completed && <div className="pattern-completed" role="status">
      <strong><span aria-hidden="true">✓ </span>本次创作已完成</strong>
      <small>完成状态已保存。你仍可查看图片或返回调整设计。</small></div>}
  </div><div className="pattern-secondary"><button disabled={busy || closed || !validSeal}
    onClick={() => void design.advance(state.step)}>保存设计</button><ReloadDesign design={design} /></div>
  {state.step < 4 && !props.data.completed && <details className="finish-early"><summary>今天先到这里</summary>
    <p>不需要完成设计或获得 AI 认可，也可以结束活动。未保存的调整请先保存。</p>
    <button disabled={closed || props.completing} onClick={props.onComplete}>完成本次活动</button></details>}
  </section>;
}
function ReloadDesign({ design }: { design: ReturnType<typeof useDesign> }) {
  const [confirm, setConfirm] = useState(false);
  if (confirm) return <div role="alert"><p>重新载入会放弃本页尚未保存的调整。</p>
    <button onClick={() => { setConfirm(false); void design.reload(); }}>放弃调整并载入</button>
    <button onClick={() => setConfirm(false)}>保留调整</button></div>;
  return <button disabled={design.busy}
    onClick={() => { if (design.dirty) setConfirm(true); else void design.reload(); }}>重新载入</button>;
}
function CompositionSteps(props: BodyProps) {
  const { design, view, activeRing, setRingIndex, updateRing } = props;
  const { state, saved, setState, busy } = design;
  return <><header className="pattern-heading"><span>{state.step === 2 ? '02 / 让图案有节奏' : '03 / 围成你的青花盘'}</span>
    <h1>{STEPS[state.step - 1]}</h1><p>{state.step === 2 ? '试试不同的重复方式，再看它怎样绕成一圈。' : '中心与留白已经安排好，把注意力留给图案。'}</p></header>
  <PlatePreview preview={view.preview} pending={view.pending} />
  {state.step === 3 && <PlateSettings state={state} onChange={setState} preview={view.preview} />}
  {state.template === 'double' && <Choices label="正在编辑" value={activeRing}
    items={[{ value: 0, label: '内圈' }, { value: 1, label: '外圈' }]} onChange={setRingIndex} />}
  {view.preview?.strip && <figure className="pattern-strip"><img src={view.preview.strip} alt="当前边饰规则的平面连续预览" />
    <figcaption>先看平面排列，再看环形效果</figcaption></figure>}
  <RingControls ring={state.rings[activeRing]} onChange={updateRing} assets={saved?.assets || []}
    centerId={state.centerAssetId} busy={busy || !props.data.uploadReady}
    onUpload={file => void design.upload(file, 'border', activeRing)} />
  </>;
}

function designArtworks(saved: DesignView | null, data: Participation) {
  const exports = saved?.exports || [];
  const ids = new Set(exports.map(output => output.artworkId));
  const artworks = exports.map(output => ({ artworkId: output.artworkId, imageUrl: output.imageUrl,
    statement: output.revision === saved?.revision ? saved.state.statement : '',
    participantId: '', createdAt: output.createdAt }));
  return [...artworks.reverse(), ...data.artworks.filter(artwork => !ids.has(artwork.artworkId))];
}
