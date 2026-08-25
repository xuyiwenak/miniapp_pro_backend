import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import type { Locale } from '../i18n/copy';
import { COPY } from '../i18n/copy';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type UploadCanvasProps = {
  locale: Locale;
  onSubmit: (file: File) => Promise<void>;
};

function isAcceptedImage(file: File): boolean {
  return ACCEPTED_TYPES.has(file.type) && file.size <= MAX_FILE_SIZE_BYTES;
}

export function UploadCanvas({ locale, onSubmit }: UploadCanvasProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  function selectFile(file: File | undefined): void {
    if (!file) return;
    if (!isAcceptedImage(file)) {
      setError(
        locale === 'zh-CN'
          ? '请选择 10MB 以内的 JPG、PNG 或 WEBP 图片。'
          : 'Choose a JPG, PNG, or WEBP image under 10 MB.'
      );
      return;
    }
    setError(null);
    setFile(file);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>): void {
    event.preventDefault();
    selectFile(event.dataTransfer.files[0]);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    selectFile(event.target.files?.[0]);
  }

  async function submitFile(): Promise<void> {
    if (!file) return;
    await onSubmit(file);
  }

  return (
    <section className="upload-canvas">
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleChange}
      />
      <button
        className="upload-canvas__zone"
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <span className="upload-canvas__icon" aria-hidden="true">
          ▱
        </span>
        <strong>{file?.name ?? COPY[locale].dropzoneTitle}</strong>
        <span>{COPY[locale].dropzoneHint}</span>
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary-button" type="button" disabled={!file} onClick={submitFile}>
        {COPY[locale].uploadButton}
      </button>
    </section>
  );
}
