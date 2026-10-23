export default function Logo({ size = 32, withText = true }) {
  return (
    <span className="logo">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="var(--brand)" />
        <path d="M32 12 16 18v12c0 10.5 6.8 19.3 16 22 9.2-2.7 16-11.5 16-22V18L32 12Z" fill="#fff" />
        <path d="M32 40s-8-4.8-8-10.2A4.6 4.6 0 0 1 32 27a4.6 4.6 0 0 1 8 2.8C40 35.2 32 40 32 40Z" fill="var(--brand)" />
      </svg>
      {withText && <span className="logo-text">KuraPet</span>}
    </span>
  );
}
