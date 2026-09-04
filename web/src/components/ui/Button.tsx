import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'quiet' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white border-accent hover:brightness-110',
  quiet: 'bg-panel text-ink border-rule hover:border-ink',
  danger: 'bg-panel text-accent border-rule hover:border-accent',
};

export function Button({
  variant = 'quiet',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center border px-3 py-1.5 text-[13px] font-medium transition-[filter,border-color] disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${className}`}
    />
  );
}
