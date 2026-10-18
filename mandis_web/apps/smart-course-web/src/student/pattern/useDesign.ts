import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../../api';
import { newPatternState, type DesignView, type PatternAssetView, type PatternState } from '@pattern/contract';
export function useDesign(courseId: string, token: string) {
  const base = `/courses/${courseId}/design`;
  const [saved, setSaved] = useState<DesignView | null>(null);
  const [state, setState] = useState<PatternState>(newPatternState);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [loading, setLoading] = useState(true); const locked = useRef(false);
  const dirty = Boolean(saved && JSON.stringify(state) !== JSON.stringify(saved.state));
  async function reload() {
    setLoading(true); setError('');
    try { const data = await api<DesignView>(base, {}, token); setSaved(data); setState(data.state); }
    catch (error) { setError(errorMessage(error)); } finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, [courseId, token]);
  useDirtyGuard(dirty);
  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try { await action(); } catch (error) { setError(errorMessage(error)); }
    finally { locked.current = false; setBusy(false); }
  }
  async function save(next: PatternState) {
    if (!saved) throw new Error('请先载入设计');
    const data = await api<DesignView>(base, { method: 'PUT',
      body: JSON.stringify({ revision: saved.revision, state: next }) }, token);
    setSaved(data); setState(data.state); return data;
  }
  function advance(step: number) { return run(async () => { await save({ ...state, step }); }); }
  function generate() { return run(async () => {
    const data = await save({ ...state, step: 4 });
    const exported = await api<DesignView>(`${base}/export`, { method: 'POST',
      body: JSON.stringify({ revision: data.revision }) }, token);
    setSaved(exported); setState(exported.state);
  }); }
  function upload(file: File, role: 'center' | 'border', ringIndex = 0) { return run(async () => {
    const asset = await uploadAsset(base, token, file);
    setSaved(old => old ? { ...old, assets: [asset, ...old.assets] } : old);
    setState(old => withAsset(old, role, asset.assetId, ringIndex));
  }); }
  return { saved, state, setState, dirty, busy, error, loading, reload, advance, generate, upload };
}

function useDirtyGuard(dirty: boolean) {
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
}
async function uploadAsset(base: string, token: string, file: File) {
  if (file.size > 10 * 1024 * 1024) throw new Error('图片不能超过 10 MB');
  const form = new FormData(); form.append('image', file);
  return api<PatternAssetView>(`${base}/assets`, { method: 'POST', body: form }, token);
}

function withAsset(state: PatternState, role: 'center' | 'border', assetId: string, ringIndex: number): PatternState {
  if (role === 'center') return { ...state, centerAssetId: assetId, crop: newPatternState().crop };
  return { ...state, rings: state.rings.map((ring, i) => i === ringIndex
    ? { ...ring, source: 'upload', assetId } : ring) as PatternState['rings'] };
}
