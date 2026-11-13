import Icon from '../../components/Icon.jsx';
import { Badge } from '../../components/RecordSection.jsx';
import { useClinic } from './ClinicLayout.jsx';

export default function ClinicPlan() {
  const { plan, plans } = useClinic();
  return (
    <div className="stack">
      <div className="plan-grid">
        {Object.entries(plans).map(([id, p]) => (
          <section key={id} className={`card plan${plan.id === id ? ' plan-current' : ''}`}>
            <div className="card-head">
              <h2>{p.label}</h2>
              {plan.id === id ? <Badge tone="ok">Tu plan</Badge> : p.soon ? <Badge tone="info">Próximamente</Badge> : null}
            </div>
            <ul className="ob-list">
              {p.features.map((f) => (
                <li key={f}>
                  <Icon name={p.soon ? 'clock' : 'check'} size={16} /> {f}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <section className="card">
        <h2 className="card-title">
          <Icon name="shield" /> Nuestro compromiso
        </h2>
        <p className="muted">
          Lo básico para atender pacientes es y seguirá siendo gratis. Ningún plan compra posición: el directorio ordena por cercanía y las reseñas solo
          vienen de visitas verificadas. Si algún día mostramos anuncios, irán marcados como “Patrocinado” y separados de los resultados.
        </p>
      </section>
    </div>
  );
}
