import type { ChangeEvent } from 'react';
export function Choices<T extends string | number>({ label, value, items, onChange }: {
  label: string; value: T; items: readonly { value: T; label: string }[]; onChange: (value: T) => void;
}) {
  return <div className="pattern-control"><p className="control-label">{label}</p>
    <div className="pattern-choices" role="group" aria-label={label}>{items.map(item =>
      <button type="button" key={item.value} aria-pressed={item.value === value}
        onClick={() => onChange(item.value)}>{item.label}</button>)}</div></div>;
}
export function UploadButton({ label, disabled, onFile }: {
  label: string; disabled: boolean; onFile: (file: File) => void;
}) {
  function change(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = '';
  }
  return <label className={`pattern-upload ${disabled ? 'disabled' : ''}`}>{label}
    <input type="file" aria-label={label} accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={change} />
  </label>;
}
