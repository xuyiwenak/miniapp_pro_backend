import { useState } from 'react';
import type { DesignView, PatternState } from '@pattern/contract';
export function ResultStep({ saved, state, dirty, onChange, onGenerate, busy, closed }: {
  saved: DesignView; state: PatternState; dirty: boolean; busy: boolean; closed: boolean;
  onChange: (state: PatternState) => void; onGenerate: () => void;
}) {
  const [original, setOriginal] = useState(false);
  const output = saved.exports.at(-1);
  const source = saved.assets.find(asset => asset.assetId === (output?.sourceAssetId || state.centerAssetId));
  const current = !dirty && output?.revision === saved.revision;
  return <><header className="pattern-heading"><span>04 / 把选择留下来</span><h1>我的成品</h1>
    <p>{current ? '你的青花盘已保存，可以下载或返回调整。' : '修改尚未生成新成品，下面仍是上次保存的图片。'}</p></header>
  <h2>我的盘面设计</h2>
  {output ? <figure className="plate-preview"><img src={original ? source?.imageUrl : output.imageUrl}
    alt={original ? '学生上传的原稿' : '服务器保存的青花盘成品'} />
  <figcaption>{original ? '这张成品对应的原稿' : `2048 × 2048 PNG · 版本 ${output.revision}`}</figcaption></figure>
    : <div className="pattern-empty"><h2>还没有生成成品</h2><p>返回盘面确认设计后，生成第一张青花盘。</p></div>}
  {output && <div className="actions"><a className="pattern-download" href={output.imageUrl} target="_blank"
    rel="noreferrer">打开高清盘面设计</a><button onClick={() => setOriginal(value => !value)}>
    {original ? '查看成品' : '查看原稿'}</button></div>}
  <p className="muted small">手机可打开图片后长按保存；保存到相册需要你在浏览器中操作。</p>
  <label>创作说明（选填）<textarea rows={3} maxLength={1000} disabled={closed || busy} value={state.statement}
    placeholder="你喜欢哪一种排列？为什么？" onChange={e => onChange({ ...state, statement: e.target.value })} /></label>
  {!current && !closed && <button className="primary" disabled={busy} onClick={onGenerate}>
    {busy ? '正在保存…' : '保存说明并重新生成'}</button>}
  </>;
}
