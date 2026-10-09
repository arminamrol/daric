/** Placeholder mark: a gold coin with an archer's bow, after the Achaemenid daric. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <circle cx="32" cy="32" r="30" className="fill-primary" />
      <circle
        cx="32"
        cy="32"
        r="24"
        fill="none"
        strokeWidth="1.5"
        className="stroke-on-primary/30"
      />
      <g fill="none" strokeLinecap="round" className="stroke-on-primary">
        <path d="M27 17 Q45 32 27 47" strokeWidth="3" />
        <path d="M27 17 V47" strokeWidth="1.25" />
        <path d="M17 32 H45" strokeWidth="2.25" />
      </g>
      <path d="M47 32 l-6 -4 v8 z" className="fill-on-primary" />
    </svg>
  );
}
