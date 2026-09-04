import type { InputHTMLAttributes } from 'react';

export function Field({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="text-muted mb-1 block text-[11px] tracking-[0.08em] uppercase">{label}</span>
      <input {...props} />
      {hint ? <span className="text-muted mt-1 block text-[12px]">{hint}</span> : null}
    </label>
  );
}
