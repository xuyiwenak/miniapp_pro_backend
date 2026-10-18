import { STEPS, RULES, PALETTES, sealText, type DesignView } from '@pattern/contract';
export function PatternGallery({ designs }: { designs: DesignView[] }) {
  return <section className="panel"><h2>学生设计 <small>{designs.length}</small></h2>
    {!designs.length && <p className="muted">学生保存设计后，原稿、排列方案和成品会出现在这里。助教对话保持私密。</p>}
    <div className="pattern-student-list">{designs.map((design, i) => <StudentDesign key={design.participantId}
      design={design} index={i} />)}</div>
    <p className="muted small">按学生汇总当前设计，衍生图片不重复计为学生作品。显示最近 100 份设计。</p></section>;
}
function StudentDesign({ design, index }: { design: DesignView; index: number }) {
  const { state } = design; const source = design.assets.find(asset => asset.assetId === state.centerAssetId);
  const output = design.exports.at(-1);
  const ceramic = design.ceramics?.find(item => item.status === 'success');
  return <article className="pattern-student"><h3>匿名创作者 {index + 1} · {STEPS[state.step - 1]}</h3>
    <div className="gallery">{source && <figure><a href={source.imageUrl} target="_blank" rel="noreferrer">
      <img src={source.imageUrl} alt={`匿名创作者 ${index + 1} 的原稿`} /></a><figcaption>上传原稿</figcaption></figure>}
    {output && <figure><a href={output.imageUrl} target="_blank" rel="noreferrer">
      <img src={output.imageUrl} alt={`匿名创作者 ${index + 1} 的青花盘成品`} /></a>
    <figcaption>{output.revision === design.revision ? '当前成品' : '上次成品 · 新调整尚未生成'}</figcaption></figure>}
    {ceramic?.imageUrl && <figure><a href={ceramic.imageUrl} target="_blank" rel="noreferrer">
      <img src={ceramic.imageUrl} alt="学生陶瓷效果图，AI 效果参考" /></a>
    <figcaption>AI 效果参考 · 设计版本 {ceramic.revision}</figcaption></figure>}</div>
    <p>{PALETTES[state.palette].label} · {state.template === 'single' ? '单圈边饰' : '双圈边饰'}</p>
    {state.rings.slice(0, state.template === 'single' ? 1 : 2).map((ring, i) =>
      <p key={i} className="small">第 {i + 1} 圈：{ring.source === 'preset' && ring.presetId === 'wave'
        ? '连续水波' : RULES[ring.rule]} · {ring.count} 个</p>)}
    {state.seal.enabled && <p className="small">作品署名：{sealText(state.seal.name)}</p>}
    <p className="brief">{state.statement || '尚未填写创作说明'}</p>
  </article>;
}
