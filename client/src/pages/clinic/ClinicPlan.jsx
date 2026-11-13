import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Badge } from '../../components/RecordSection.jsx';
import { api } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import { useClinic } from './ClinicLayout.jsx';

export default function ClinicPlan() {
  const { place, member, plan, plans, counts, reload } = useClinic();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const request = async (id) => {
    setBusy(true);
    try {
      await api.post(`/clinics/${place.id}/plan-request`, { plan: id });
      toast('Solicitud enviada. Te contactaremos para activarlo.');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const canRequest = member.role === 'admin' && !member.site_admin;
  return (
    <div className="stack">
      <div className="plan-grid">
        {Object.entries(plans).map(([id, p]) => (
          <section key={id} className={`card plan${plan.id === id ? ' plan-current' : ''}`}>
            <div className="card-head">
              <h2>{p.label}</h2>
              {plan.id === id ? <Badge tone="ok">Tu plan</Badge> : counts.pending_plan === id ? <Badge tone="info">Solicitud en revisión</Badge> : null}
            </div>
            <ul className="ob-list">
              {p.features.map((f) => (
                <li key={f}>
                  <Icon name="check" size={16} /> {f}
                </li>
              ))}
            </ul>
            {plan.id !== id && canRequest && counts.pending_plan !== id && (
              <button className={`btn ${id === 'pro' ? 'btn-primary' : 'btn-ghost'} btn-block plan-cta`} onClick={() => request(id)} disabled={busy}>
                {id === 'pro' ? 'Solicitar el plan Pro' : 'Volver al plan Gratis'}
              </button>
            )}
          </section>
        ))}
      </div>
      <section className="card">
        <h2 className="card-title">
          <Icon name="shield" /> Nuestro compromiso
        </h2>
        <p className="muted">
          Lo básico para atender pacientes es y seguirá siendo gratis. El plan Pro se activa tras acordar el pago con nuestro equipo. Ningún plan compra posición: el directorio ordena por cercanía y las reseñas solo
          vienen de visitas verificadas. Si algún día mostramos anuncios, irán marcados como “Patrocinado” y separados de los resultados.
        </p>
      </section>
    </div>
  );
}
