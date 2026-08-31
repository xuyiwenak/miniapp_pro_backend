import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { Locale } from '@mandis/common/classroom-types';
import { CourseProgress } from './CourseProgress';

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_ACCEPT = ACCEPTED_IMAGE_TYPES.join(',');
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

type Props = {
  locale: Locale;
  saving: boolean;
  classroomCode?: string;
  revisiting?: boolean;
  onUpload: (dataUrl: string) => Promise<void>;
  onTeacherUpload: () => Promise<void>;
  onConfirmTeacherUpload: () => void;
  onCancel?: () => void;
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
  revisiting = false,
  onUpload,
  onTeacherUpload,
  onConfirmTeacherUpload,
  onCancel,
}: Props) {
  const zh = locale === 'zh-CN';
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);
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
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_SIZE_BYTES) {
      setError(
        zh
          ? '请选择10MB以内的JPG、PNG或WEBP图片'
          : 'Choose a JPG, PNG or WEBP image under 10 MB'
      );
      return;
    }
    setDataUrl(await readFile(file));
    setError('');
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const input = event.currentTarget;
    void choose(input.files?.[0]);
    input.value = '';
  }

  async function upload(): Promise<void> {
    setError('');
    try {
      await onUpload(dataUrl);
    } catch {
      setError(
        zh
          ? '上传失败，请检查网络后重新点击上传'
          : 'Upload failed. Reconnect and tap upload again.'
      );
    }
  }

  return (
    <main className="course-step-screen">
      <CourseProgress
        locale={locale}
        currentStep={revisiting ? 5 : 3}
        pendingArtwork={revisiting}
        failedStep={error ? 3 : undefined}
      />
      <section className="classroom-card artwork-card">
        <p className="classroom-eyebrow">{zh ? '第 3 步 · 上传作品' : 'STEP 3 · UPLOAD'}</p>
        <h1>
          {revisiting
            ? zh
              ? '补充你的课堂作品'
              : 'Add your classroom artwork'
            : zh
            ? '记录你的课堂作品'
            : 'Capture your classroom artwork'}
        </h1>
        <p>
          {revisiting
            ? zh
              ? '上传后会直接返回作品回响，已经完成的课后测评不会重做。'
              : 'After uploading, you will return to reflection without repeating the post assessment.'
            : zh
            ? '拍摄或从相册选择作品。无法上传时，可以请教师通过匿名课堂编号补充。'
            : 'Take a photo or choose one. If you cannot upload, your teacher can add it using an anonymous code.'}
        </p>
        <input
          ref={cameraInputRef}
          className="sr-only"
          type="file"
          accept={IMAGE_ACCEPT}
          capture="environment"
          onChange={handleFileChange}
        />
        <input
          ref={albumInputRef}
          className="sr-only"
          type="file"
          accept={IMAGE_ACCEPT}
          onChange={handleFileChange}
        />
        <div className="artwork-picker">
          {dataUrl ? (
            <img src={dataUrl} alt={zh ? '作品预览' : 'Artwork preview'} />
          ) : (
            <>
              <span aria-hidden="true">＋</span>
              <strong>{zh ? '选择作品照片' : 'Choose an artwork photo'}</strong>
            </>
          )}
        </div>
        <div className="artwork-source-actions">
          <button
            className="classroom-primary"
            type="button"
            disabled={saving}
            onClick={() => cameraInputRef.current?.click()}
          >
            {zh ? '拍照' : 'Take photo'}
          </button>
          <button
            className="classroom-secondary"
            type="button"
            disabled={saving}
            onClick={() => albumInputRef.current?.click()}
          >
            {zh ? '从相册选择' : 'Choose from library'}
          </button>
        </div>
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
              void upload();
            }}
          >
            {zh ? '确认上传' : 'Upload artwork'}
          </button>
        )}
        {revisiting ? (
          <button className="classroom-secondary revisit-artwork-back" type="button" onClick={onCancel}>
            {zh ? '暂不上传，返回作品回响' : 'Not now, return to reflection'}
          </button>
        ) : classroomCode ? (
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
