import { useEffect, useRef, useState } from 'react';
import type { Locale } from '@mandis/common/classroom-types';
import { CourseProgress } from './CourseProgress';

type Props = {
  locale: Locale;
  saving: boolean;
  classroomCode?: string;
  onUpload: (dataUrl: string) => Promise<void>;
  onTeacherUpload: () => Promise<void>;
  onConfirmTeacherUpload: () => void;
};

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(file);
  });
}

export function ArtworkStep({
  locale,
  saving,
  classroomCode,
  onUpload,
  onTeacherUpload,
  onConfirmTeacherUpload,
}: Props) {
  const zh = locale === 'zh-CN';
  const inputRef = useRef<HTMLInputElement>(null);
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(
    () => () => {
      if (dataUrl.startsWith('blob:')) URL.revokeObjectURL(dataUrl);
    },
    [dataUrl]
  );

  async function choose(file?: File): Promise<void> {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setError(zh ? '请选择10MB以内的JPG、PNG或WEBP图片' : 'Choose a JPG, PNG or WEBP image under 10 MB');
      return;
    }
    setDataUrl(await readFile(file));
    setError('');
  }

  return (
    <main className="course-step-screen">
      <CourseProgress locale={locale} currentStep={3} />
      <section className="classroom-card artwork-card">
        <p className="classroom-eyebrow">{zh ? '第 3 步 · 上传作品' : 'STEP 3 · UPLOAD'}</p>
        <h1>{zh ? '记录你的课堂作品' : 'Capture your classroom artwork'}</h1>
        <p>
          {zh
            ? '拍摄或从相册选择作品。无法上传时，可以请教师通过匿名课堂编号补充。'
            : 'Take a photo or choose one. If you cannot upload, your teacher can add it using an anonymous code.'}
        </p>
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={(event) => {
            void choose(event.target.files?.[0]);
          }}
        />
        <button className="artwork-picker" type="button" onClick={() => inputRef.current?.click()}>
          {dataUrl ? (
            <img src={dataUrl} alt={zh ? '作品预览' : 'Artwork preview'} />
          ) : (
            <>
              <span aria-hidden="true">＋</span>
              <strong>{zh ? '拍摄或选择作品' : 'Take or choose a photo'}</strong>
            </>
          )}
        </button>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {dataUrl && (
          <button
            className="classroom-primary"
            type="button"
            disabled={saving}
            onClick={() => {
              void onUpload(dataUrl);
            }}
          >
            {zh ? '确认上传' : 'Upload artwork'}
          </button>
        )}
        {classroomCode ? (
          <div className="pending-artwork teacher-upload-confirmation">
            <h2>{zh ? '请记录匿名课堂编号' : 'Save your anonymous classroom code'}</h2>
            <strong>{classroomCode}</strong>
            <p>
              {zh
                ? '请把编号写在作品临时标签上，并请教师补充作品照片。'
                : 'Put this code on a temporary artwork label and ask your teacher to upload the photo.'}
            </p>
            <button className="classroom-primary" type="button" onClick={onConfirmTeacherUpload}>
              {zh ? '我会请教师补充，继续课后测评' : 'I will ask the teacher, continue'}
            </button>
          </div>
        ) : (
          <div className="teacher-upload-option">
            <span>{zh ? '暂时无法上传？' : 'Unable to upload?'}</span>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                void onTeacherUpload();
              }}
            >
              {zh ? '请教师帮助上传' : 'Ask the teacher to upload'}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
