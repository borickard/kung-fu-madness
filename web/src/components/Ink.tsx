/** The one piece of decoration the spec allows: a single ink-brush ensō. */
export function Ink({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden focusable="false">
      <path
        d="M74 22c-9-7-21-10-32-7C28 19 18 30 15 43c-4 15 2 32 15 40 14 9 34 7 45-5 9-9 12-23 8-35-2-6-6-12-11-16"
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
      />
    </svg>
  );
}
