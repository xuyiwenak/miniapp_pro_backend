import { useEffect, useState } from 'react';
import type { Locale } from '@mandis/common/classroom-types';
import { galleryApi } from '../galleryApi';

export function GallerySharing({ token, locale, readOnly = false }: {
  token: string; locale: Locale; readOnly?: boolean;
}) {
  const zh = locale === 'zh-CN';
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    setLoaded(false);
    galleryApi.list(token).then((state) => { if (active) { setSharing(state.sharing); setLoaded(true); } })
      .catch(() => { if (active) setMessage(zh ? '展示设置读取失败，请刷新重试' : 'Unable to load sharing. Refresh to retry.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [token, zh]);
  async function change() {
    setBusy(true); setMessage('');
    try {
      const result = await galleryApi.sharing(token, !sharing);
      setSharing(result.sharing);
      setMessage(zh ? '展示选择已保存' : 'Sharing preference saved');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Save failed'); }
    finally { setBusy(false); }
  }
  return <section className="gallery-sharing">
    <label><strong>{zh ? '向本课堂同学匿名展示' : 'Share anonymously with this class'}</strong>
      <input type="checkbox" role="switch" checked={sharing} disabled={busy || readOnly || !loaded}
        onChange={() => void change()} /></label>
    <p>{zh ? '同学可以欣赏并评价，不展示你的编号和个人测评。' : 'Classmates can view and review, without your ID or self-reports.'}</p>
    <small>{zh ? '完成匿名检查后，会出现在课堂作品中。评价用于课堂研究，不作为公开评论。'
      : 'Shown after an anonymity check. Reviews support classroom research and are not public comments.'}</small>
    <p role="status">{message}</p>
  </section>;
}
