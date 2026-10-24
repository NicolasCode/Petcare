// Isotipo de Kaimi (perro + gato con ojos grandes); los colores vienen de variables CSS para el modo oscuro
export function KaimiMark({ size = 32 }) {
  return (
    <svg width={size} height={size * 0.66} viewBox="0 0 128 84" aria-hidden="true" className="kaimi-mark">
      <g className="km-head">
        <path d="M36 21C24 11 7 13 3 25c-3 10 4 17 13 14l14-11Z" />
        <path d="M92 24 115 5c4 11 4 25-1 35L94 32Z" />
        <circle cx="40" cy="50" r="30" />
        <circle cx="88" cy="50" r="30" />
        <rect x="50" y="34" width="28" height="22" rx="6" />
      </g>
      <circle className="km-iris" cx="40" cy="51" r="21" />
      <circle className="km-iris" cx="88" cy="51" r="21" />
      <circle className="km-pupil" cx="40.5" cy="53" r="12.5" />
      <circle className="km-pupil" cx="88.5" cy="53" r="12.5" />
      <circle className="km-shine" cx="45" cy="47.5" r="4" />
      <circle className="km-shine" cx="93" cy="47.5" r="4" />
    </svg>
  );
}

export default function Logo({ size = 32, withText = true }) {
  return (
    <span className="logo">
      <KaimiMark size={size * 1.25} />
      {withText && (
        <span className="logo-text" style={{ fontSize: size * 0.82 }}>
          kaimi
        </span>
      )}
    </span>
  );
}
