import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Spinner } from '../../components/States.jsx';
import { api } from '../../lib/api.js';
import { SPECIES } from '../../lib/format.js';
import { useToast } from '../../lib/toast.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { useClinic } from './ClinicLayout.jsx';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Últimos 6 meses aunque alguno no tenga datos
function lastMonths(rows) {
  const out = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ label: MONTHS[d.getMonth()], value: rows.find((r) => r.month === key)?.n ?? 0 });
  }
  return out;
}

// Barras horizontales de una sola serie: valor visible al final, tooltip al pasar y tabla equivalente
function BarList({ title, rows, format = (v) => v, max }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <figure className="barlist">
      <figcaption>{title}</figcaption>
      <ul>
        {rows.map((r) => (
          <li key={r.label} className="barlist-row" tabIndex={0} aria-label={`${r.label}: ${format(r.value, r)}`}>
            <span className="barlist-label">{r.label}</span>
            <span className="barlist-track">
              <span className="barlist-bar" style={{ width: `${(r.value / top) * 100}%` }} />
            </span>
            <span className="barlist-value">{format(r.value, r)}</span>
            {r.tip && <span className="barlist-tip" role="tooltip">{r.tip}</span>}
          </li>
        ))}
      </ul>
      <details className="barlist-table">
        <summary>Ver como tabla</summary>
        <table>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                <td>{format(r.value, r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export function ProUpsell({ feature }) {
  const { place, member, plan, counts, reload } = useClinic();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const request = async () => {
    setBusy(true);
    try {
      await api.post(`/clinics/${place.id}/plan-request`, { plan: 'pro' });
      toast('Solicitud enviada. Te contactaremos para activar el plan.');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card empty">
      <span className="empty-icon">
        <Icon name="star" size={28} />
      </span>
      <h2 className="h3">{feature} es del plan Pro</h2>
      <p>Tu plan actual es {plan.label}. Con Pro tienes reportes, recordatorios automáticos por WhatsApp y equipos más grandes.</p>
      {counts.pending_plan ? (
        <p className="badge badge-info">Solicitud de plan Pro en revisión</p>
      ) : member.role === 'admin' && !member.site_admin ? (
        <button className="btn btn-primary" onClick={request} disabled={busy}>
          {busy ? 'Enviando…' : 'Solicitar el plan Pro'}
        </button>
      ) : (
        <p className="muted small">Pídele al administrador de la clínica que solicite el plan.</p>
      )}
    </section>
  );
}

export default function ClinicReports() {
  const { place, plan } = useClinic();
  const { data, error } = useFetch(plan.reports ? `/clinics/${place.id}/reports` : null);
  if (!plan.reports) return <ProUpsell feature="Reportes" />;
  if (error) return <p className="alert alert-error">{error.message}</p>;
  if (!data) return <Spinner />;

  const coverage = data.vaccines.map((v) => ({
    label: v.name,
    value: Math.round((v.up_to_date / v.total) * 100),
    raw: v,
    tip: `${v.up_to_date} de ${v.total} pacientes al día`,
  }));
  const species = data.species.map((s) => ({ label: `${SPECIES[s.species]?.emoji ?? ''} ${SPECIES[s.species]?.label ?? s.species}`, value: s.n }));

  return (
    <div className="stack">
      <div className="stat-row stat-row-4">
        <div className="card stat">
          <strong>{data.patients}</strong>
          <span>Pacientes activos</span>
        </div>
        <div className="card stat">
          <strong className={data.overdue_patients ? 'tone-danger' : undefined}>{data.overdue_patients}</strong>
          <span>
            {data.overdue_patients > 0 && <Icon name="alert" size={14} />} Con refuerzos vencidos
          </span>
        </div>
        <div className="card stat">
          <strong>{data.patients ? Math.round(((data.patients - data.overdue_patients) / data.patients) * 100) : 0}%</strong>
          <span>Pacientes al día</span>
        </div>
        <div className="card stat">
          <strong>{data.validated_last_30}</strong>
          <span>Registros validados (30 días)</span>
        </div>
      </div>

      <div className="profile-grid">
        <section className="card">
          <BarList title="Cobertura de vacunación (pacientes al día)" rows={coverage} max={100} format={(v) => `${v}%`} />
          {coverage.length === 0 && <p className="muted">Aún no hay vacunas registradas en tus pacientes.</p>}
        </section>
        <section className="card">
          <BarList title="Pacientes por especie" rows={species} />
        </section>
        <section className="card">
          <BarList title="Consultas completadas por mes" rows={lastMonths(data.visits_by_month)} />
        </section>
        <section className="card">
          <BarList title="Pacientes nuevos por mes" rows={lastMonths(data.new_patients_by_month)} />
        </section>
      </div>

      <section className="card row-between">
        <div>
          <h2 className="h3">Exportar pacientes</h2>
          <p className="muted small">CSV con mascota, dueño, correo, última visita y próximo refuerzo. Ábrelo en Excel o Google Sheets.</p>
        </div>
        <a className="btn btn-secondary" href={`/api/clinics/${place.id}/reports/patients.csv`} download>
          <Icon name="external" size={18} /> Descargar CSV
        </a>
      </section>
    </div>
  );
}
