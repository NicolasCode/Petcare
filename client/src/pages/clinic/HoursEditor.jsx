import Icon from '../../components/Icon.jsx';
import { WEEKDAYS } from '../../lib/format.js';

const WEEK = [1, 2, 3, 4, 5, 6, 0];

// Horario semanal editable: varias franjas por día (p. ej. cierre al mediodía)
export default function HoursEditor({ value, onChange }) {
  const byDay = (d) => value.map((h, i) => ({ ...h, i })).filter((h) => h.weekday === d);
  const update = (i, patch) => onChange(value.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  const remove = (i) => onChange(value.filter((_, j) => j !== i));
  const add = (d) => onChange([...value, { weekday: d, opens: '08:00', closes: '18:00' }]);
  // Copia el horario del lunes al resto de días hábiles
  const copyMonday = () => {
    const monday = value.filter((h) => h.weekday === 1);
    onChange([...value.filter((h) => ![2, 3, 4, 5].includes(h.weekday)), ...[2, 3, 4, 5].flatMap((d) => monday.map((h) => ({ ...h, weekday: d })))]);
  };

  return (
    <div className="hours-editor">
      {WEEK.map((d) => {
        const slots = byDay(d);
        return (
          <div key={d} className="hours-day">
            <strong>{WEEKDAYS[d]}</strong>
            <div className="hours-slots">
              {slots.length === 0 && <span className="muted small">Cerrado</span>}
              {slots.map((h) => (
                <span key={h.i} className="hours-slot">
                  <input type="time" value={h.opens} onChange={(e) => update(h.i, { opens: e.target.value })} aria-label={`${WEEKDAYS[d]}: abre`} />
                  <span>a</span>
                  <input type="time" value={h.closes} onChange={(e) => update(h.i, { closes: e.target.value })} aria-label={`${WEEKDAYS[d]}: cierra`} />
                  <button type="button" className="icon-btn" onClick={() => remove(h.i)} aria-label={`Quitar franja del ${WEEKDAYS[d]}`}>
                    <Icon name="close" size={16} />
                  </button>
                </span>
              ))}
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => add(d)}>
              <Icon name="plus" size={16} /> Franja
            </button>
          </div>
        );
      })}
      <button type="button" className="btn btn-secondary btn-sm" onClick={copyMonday}>
        <Icon name="copy" size={16} /> Copiar el lunes a martes–viernes
      </button>
      <p className="muted small">Si cierra después de medianoche, pon la hora de cierre del día siguiente (p. ej. 20:00 a 02:00).</p>
    </div>
  );
}
