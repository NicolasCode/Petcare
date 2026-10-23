import { useEffect, useRef, useState } from 'react';
import { formatDate, formatKg } from '../lib/format.js';

const H = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 44 };

// Curva de peso: una sola serie, línea de 2px, marcadores de 8px y tooltip al pasar el cursor/tocar
export default function WeightChart({ weights }) {
  const [active, setActive] = useState(null);
  // El viewBox sigue el ancho real para que el texto no se encoja en móvil
  const wrapRef = useRef(null);
  const [W, setW] = useState(640);
  const enough = weights.length >= 2;
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(280, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [enough]);
  const points = [...weights].sort((a, b) => a.measured_on.localeCompare(b.measured_on));
  if (!enough) return null;

  const times = points.map((p) => new Date(p.measured_on).getTime());
  const values = points.map((p) => p.weight_kg);
  const [tMin, tMax] = [Math.min(...times), Math.max(...times)];
  const span = Math.max(...values) - Math.min(...values) || 1;
  const vMin = Math.max(0, Math.min(...values) - span * 0.25);
  const vMax = Math.max(...values) + span * 0.25;

  const x = (t) => PAD.left + ((t - tMin) / (tMax - tMin || 1)) * (W - PAD.left - PAD.right);
  const y = (v) => PAD.top + (1 - (v - vMin) / (vMax - vMin)) * (H - PAD.top - PAD.bottom);
  const ticks = [0, 0.5, 1].map((f) => vMin + f * (vMax - vMin));
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(times[i]).toFixed(1)},${y(p.weight_kg).toFixed(1)}`).join(' ');
  const a = active !== null ? points[active] : null;

  return (
    <figure className="chart">
      <figcaption className="sr-only">Curva de peso con {points.length} mediciones</figcaption>
      <div className="chart-wrap" ref={wrapRef}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Curva de peso" onMouseLeave={() => setActive(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="chart-grid" />
              <text x={PAD.left - 8} y={y(t)} className="chart-axis" textAnchor="end" dominantBaseline="middle">
                {t.toLocaleString('es-CO', { maximumFractionDigits: 1 })}
              </text>
            </g>
          ))}
          <text x={PAD.left} y={H - 6} className="chart-axis">
            {formatDate(points[0].measured_on, { month: 'short', year: '2-digit' })}
          </text>
          <text x={W - PAD.right} y={H - 6} className="chart-axis" textAnchor="end">
            {formatDate(points.at(-1).measured_on, { month: 'short', year: '2-digit' })}
          </text>
          <path d={path} className="chart-line" />
          {a && <line x1={x(times[active])} x2={x(times[active])} y1={PAD.top} y2={H - PAD.bottom} className="chart-cross" />}
          {points.map((p, i) => (
            <g key={p.id}>
              <circle cx={x(times[i])} cy={y(p.weight_kg)} r={active === i ? 6 : 4} className="chart-dot" />
              {/* Zona de toque más grande que el marcador */}
              <circle
                cx={x(times[i])}
                cy={y(p.weight_kg)}
                r={16}
                fill="transparent"
                onMouseEnter={() => setActive(i)}
                onClick={() => setActive(i)}
                tabIndex={0}
                onFocus={() => setActive(i)}
                aria-label={`${formatDate(p.measured_on)}: ${formatKg(p.weight_kg)}`}
              />
            </g>
          ))}
        </svg>
        {a && (
          <div
            className="chart-tip"
            style={{ left: `${(x(times[active]) / W) * 100}%`, top: `${(y(a.weight_kg) / H) * 100}%` }}
          >
            <strong>{formatKg(a.weight_kg)}</strong>
            <span>{formatDate(a.measured_on)}</span>
          </div>
        )}
      </div>
    </figure>
  );
}
