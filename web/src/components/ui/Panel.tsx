import type { ReactNode } from 'react';

export function Panel({
  title,
  aside,
  children,
  className = '',
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border border-rule bg-panel ${className}`}>
      {title ? (
        <header className="flex items-baseline justify-between gap-3 border-b border-rule px-3 py-2">
          <h2 className="text-[13px] tracking-wide uppercase">{title}</h2>
          {aside ? <div className="num text-muted text-[12px]">{aside}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-muted px-3 py-6 text-center text-[13px]">{children}</p>;
}

export function Notice({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'bad' }) {
  if (!children) return null;
  return (
    <p
      className={`border px-3 py-2 text-[13px] ${
        tone === 'bad' ? 'border-accent bg-accent-soft text-accent' : 'border-rule bg-panel'
      }`}
    >
      {children}
    </p>
  );
}
