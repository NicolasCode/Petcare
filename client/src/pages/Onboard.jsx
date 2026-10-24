import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Logo, { KaimiMark } from '../components/Logo.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';

// Recorrido guiado de la demo: público, funciona con o sin sesión
const PETS = [
  {
    name: 'Timothy',
    emoji: '🐶',
    tint: '#fdecc8',
    summary: 'Golden Retriever · 4 años · 31,5 kg',
    items: [
      'Alergia grave a la cefalexina',
      'Rabia por vencer y pipeta antipulgas ya vencida',
      'Omeprazol en curso',
      'Cita de control en 3 días y consulta pasada con diagnóstico',
      '6 mediciones de peso en 18 meses',
      'Bolsa de alimento a punto de acabarse',
    ],
  },
  {
    name: 'Luna',
    emoji: '🐱',
    tint: '#e3ecfb',
    summary: 'Gata criolla · 2 años · 4,1 kg',
    items: ['Vacunas felinas al día', 'Desparasitación reciente', 'Esterilización registrada con notas', 'Curva de peso y plan de alimento sin alertas'],
  },
];

const STEPS = [
  {
    icon: 'home',
    title: 'Inicio: los próximos cuidados',
    to: () => '/',
    cta: 'Abrir inicio',
    doThis: ['Entra y revisa la lista “Próximos cuidados”, ordenada por urgencia.', 'Toca cualquier aviso: te lleva a la sección exacta de esa mascota.'],
    notice: [
      'Rojo = vencido (la pipeta antipulgas). Amarillo = esta semana (cita, alimento, desparasitación).',
      'Abajo: mascotas, tratamientos en curso y el atajo “¿Una urgencia?”.',
    ],
  },
  {
    icon: 'heart',
    title: 'Perfil 360° de Timothy',
    to: (ids) => pet(ids, 'Timothy'),
    cta: 'Abrir a Timothy',
    doThis: ['Abre a Timothy desde Mascotas.', 'Lee la ficha “Perfil 360°” en la pestaña Resumen.'],
    notice: [
      'La alergia a la cefalexina aparece en rojo en el encabezado: es lo primero que ve un veterinario.',
      'En una sola ficha: vacunas, última desparasitación, plan nutricional, clínica habitual y microchip.',
    ],
  },
  {
    icon: 'syringe',
    title: 'Vacunas y desparasitación',
    to: (ids) => pet(ids, 'Timothy', 'vacunas'),
    cta: 'Ver vacunas',
    doThis: [
      'Toca “Registrar aplicación”, tipo Antipulgas, nombre “Pipeta antipulgas”.',
      'Usa el atajo “+1 mes” para la fecha del próximo refuerzo y guarda.',
      'Vuelve al Inicio: el aviso rojo desapareció.',
    ],
    notice: [
      'El nombre sugiere vacunas según la especie (perro o gato).',
      'Solo cuenta la aplicación más reciente de cada vacuna: renovarla apaga la alerta.',
    ],
  },
  {
    icon: 'alert',
    title: 'Alergias y medicamentos',
    to: (ids) => pet(ids, 'Timothy', 'alergias'),
    cta: 'Ver alergias',
    doThis: ['Revisa la alergia con su severidad y reacción.', 'En Medicamentos, mira el omeprazol con dosis, frecuencia y fecha de fin.'],
    notice: ['Los tratamientos activos se muestran en el Inicio hasta su fecha de fin.', 'Puedes editar o borrar cualquier registro con los íconos de cada fila.'],
  },
  {
    icon: 'calendar',
    title: 'Citas y consultas',
    to: (ids) => pet(ids, 'Timothy', 'citas'),
    cta: 'Ver citas',
    doThis: ['Abre la cita pasada de vacunación anual y lee el diagnóstico.', 'Edita la próxima cita, márcala como completada y escribe el resultado.'],
    notice: ['Las citas programadas aparecen en el Inicio con fecha, hora y clínica.', 'Si una cita pasó y sigue “programada”, la app pregunta “¿Cómo te fue?”.'],
  },
  {
    icon: 'scale',
    title: 'Curva de peso',
    to: (ids) => pet(ids, 'Timothy', 'peso'),
    cta: 'Ver peso',
    doThis: ['Pasa el cursor o toca los puntos de la gráfica.', 'Registra un peso nuevo de hoy y mira cómo se actualiza la curva.'],
    notice: ['El peso más reciente se muestra en el perfil y en la lista de mascotas.'],
  },
  {
    icon: 'bowl',
    title: 'Plan nutricional',
    to: (ids) => pet(ids, 'Timothy', 'alimento'),
    cta: 'Ver alimento',
    doThis: ['Mira la barra: la bolsa está a punto de acabarse.', 'Toca “Compré una bolsa nueva” y vuelve al Inicio: el aviso desaparece.'],
    notice: ['La duración se calcula con el tamaño de la bolsa y la ración diaria (15 kg ÷ 450 g = 33 días).', 'Con “Editar plan” cambias el alimento o la ración.'],
  },
  {
    icon: 'share',
    title: 'Compartir con el veterinario',
    to: (ids) => pet(ids, 'Timothy'),
    cta: 'Abrir a Timothy',
    doThis: [
      'En el perfil de Timothy toca “Compartir”, elige 24 horas y genera el enlace.',
      'Ábrelo en una ventana de incógnito o en otro celular: es la vista del veterinario.',
      'Vuelve y toca “Revocar”: el enlace deja de funcionar al instante.',
    ],
    notice: ['La vista del veterinario es de solo lectura, sin login y sin tu correo ni teléfono.', 'Cada enlace cuenta cuántas veces se abrió.'],
  },
  {
    icon: 'map',
    title: 'Cerca de mí',
    to: () => '/cerca',
    cta: 'Abrir mapa',
    doThis: [
      'Toca “Usar mi ubicación” y acepta el permiso: la lista se ordena por distancia.',
      'Filtra por “Urgencias” o “Abierto 24h”, o busca “felina”.',
      'Prueba “Cómo llegar”: abre la ruta en Google Maps.',
    ],
    notice: ['Los 8 lugares de la demo son ficticios.', 'Los administradores (ADMIN_EMAILS) ven “Agregar lugar” y pueden editar el directorio.'],
  },
  {
    icon: 'paw',
    title: 'Luna y una mascota nueva',
    to: () => '/mascotas/nueva',
    cta: 'Agregar mascota',
    doThis: ['Abre a Luna y compara: sus vacunas son felinas y no tiene alertas.', 'Crea una mascota nueva: solo el nombre y la especie son obligatorios.'],
    notice: ['El formulario guarda en segundos; el resto se completa después.'],
  },
  {
    icon: 'user',
    title: 'Mi cuenta y privacidad',
    to: () => '/cuenta',
    cta: 'Abrir cuenta',
    doThis: ['Revisa el texto de privacidad (Ley 1581) y cierra sesión.'],
    notice: ['“Eliminar mi cuenta” borra todo de forma permanente. En la demo, la cuenta se vuelve a crear en el siguiente despliegue.'],
  },
];

const SCRIPT = [
  {
    time: '0:00',
    problem: '¿Qué pasa cuando una mascota enferma a las 9:00 PM?',
    show: 'Inicio → “¿Una urgencia?” → mapa filtrado por urgencias, llamar o cómo llegar.',
    step: 8,
  },
  {
    time: '0:45',
    problem: 'Historial cero: el veterinario de guardia no conoce alergias ni vacunas.',
    show: 'Perfil 360° de Timothy con la alergia en rojo → Compartir → abrir la vista del veterinario.',
    step: 1,
  },
  {
    time: '1:45',
    problem: 'Cero esfuerzo de memoria: vacunas y antipulgas olvidados.',
    show: 'Inicio: pipeta vencida, refuerzo de rabia y cita. Renovar la pipeta apaga la alerta.',
    step: 2,
  },
  {
    time: '2:15',
    problem: 'Motor de recompra: el alimento se acaba sin aviso.',
    show: 'Alimento: “se acaba en pocos días” → “Compré una bolsa nueva”. La compra con un clic llega en la Fase 3.',
    step: 6,
  },
  {
    time: '2:45',
    problem: 'Cierre',
    show: '“Tu veterinario puede cambiar de clínica. La historia de tu mascota no.”',
  },
];

const NOW = [
  'Perfil 360° con historia clínica completa',
  'Recordatorios de refuerzos, citas, alimento y tratamientos',
  'Historia portable con enlaces temporales y revocables',
  'Directorio geolocalizado de clínicas, urgencias y farmacias',
  'Autorización de datos (Ley 1581) y eliminación de cuenta',
  'Web responsive, instalable en el celular y con modo oscuro',
];
const NEXT = [
  'Notificaciones push y por correo de los recordatorios',
  'Cuentas para veterinarios y clínicas, agenda y CRM (Fase 2)',
  'Plan PRO con descuentos en clínicas aliadas (Fase 2)',
  'Marketplace de farmacia y alimento con compra en un clic (Fase 3)',
  'Teleorientación y adjuntar fotos o exámenes',
];

function pet(ids, name, tab) {
  const id = ids[name];
  if (!id) return '/mascotas';
  return tab ? `/mascotas/${id}?tab=${tab}` : `/mascotas/${id}`;
}

export default function Onboard() {
  const { user, loginDemo } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [demo, setDemo] = useState(null);
  const [ids, setIds] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Recorrido de la demo · Kaimi';
    api
      .get('/auth/demo')
      .then(setDemo)
      .catch(() => setDemo({ enabled: false }));
    return () => {
      document.title = 'Kaimi';
    };
  }, []);

  // Con sesión iniciada, los botones del recorrido abren directamente a Timothy y Luna
  useEffect(() => {
    if (!user) return setIds({});
    api
      .get('/pets')
      .then(({ pets }) => setIds(Object.fromEntries(pets.map((p) => [p.name, p.id]))))
      .catch(() => {});
  }, [user]);

  // target recibe los ids de las mascotas, que solo se conocen después de entrar
  const enterDemo = async (target) => {
    setBusy(true);
    try {
      await loginDemo();
      toast('Entraste a la cuenta demo');
      if (target) {
        const { pets } = await api.get('/pets');
        navigate(target(Object.fromEntries(pets.map((p) => [p.name, p.id]))));
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const isDemoUser = user?.email === demo?.email;

  function Go({ target, children, primary }) {
    const to = target(ids);
    const cls = `btn btn-sm ${primary ? 'btn-primary' : 'btn-secondary'}`;
    if (user) {
      return (
        <Link className={cls} to={to}>
          {children} <Icon name="chevron" size={16} />
        </Link>
      );
    }
    if (demo?.enabled) {
      return (
        <button className={cls} onClick={() => enterDemo(target)} disabled={busy}>
          {children} <Icon name="chevron" size={16} />
        </button>
      );
    }
    return (
      <Link className={cls} to="/ingresar" state={{ from: to }}>
        {children} <Icon name="chevron" size={16} />
      </Link>
    );
  }

  return (
    <div className="onboard">
      <header className="shared-top">
        <Link to="/" aria-label="Kaimi">
          <Logo size={28} />
        </Link>
        {user ? (
          <Link className="btn btn-secondary btn-sm" to="/">
            Ir a la app
          </Link>
        ) : (
          <Link className="btn btn-ghost btn-sm" to="/ingresar">
            Ingresar
          </Link>
        )}
      </header>

      <section className="ob-hero">
        <div className="ob-wrap ob-hero-grid">
          <div className="ob-hero-mark">
            <KaimiMark size={300} />
          </div>
          <div>
            <p className="ob-kicker">Recorrido de la demo</p>
            <h1>Todo su cuidado, en un solo lugar.</h1>
            <p className="ob-lead">
              Kaimi reúne la historia clínica, los recordatorios y los servicios veterinarios cercanos. Esta guía te muestra todo lo que trae la
              demo, paso a paso, en unos 10 minutos.
            </p>

            <div className="ob-access">
              {demo === null ? (
                <span className="spinner" />
              ) : demo.enabled ? (
                <>
                  {user ? (
                    <p className="ob-status">
                      <Icon name="check" size={18} /> {isDemoUser ? 'Estás dentro de la cuenta demo.' : `Sesión iniciada como ${user.name}.`}
                    </p>
                  ) : (
                    <button className="btn btn-primary btn-lg" onClick={() => enterDemo()} disabled={busy}>
                      {busy ? 'Entrando…' : 'Entrar a la demo'}
                    </button>
                  )}
                  <a className="btn btn-on-dark btn-lg" href="#recorrido">
                    Empezar el recorrido
                  </a>
                  <p className="ob-creds">
                    Cuenta demo: <strong>{demo.email}</strong>
                    {demo.password && (
                      <>
                        {' '}
                        · contraseña <strong>{demo.password}</strong>
                      </>
                    )}
                  </p>
                </>
              ) : (
                <>
                  <Link className="btn btn-primary btn-lg" to={user ? '/' : '/registro'}>
                    {user ? 'Ir a la app' : 'Crear cuenta gratis'}
                  </Link>
                  <a className="btn btn-on-dark btn-lg" href="#recorrido">
                    Ver el recorrido
                  </a>
                  <p className="ob-creds">La cuenta demo no está activa en este servidor (se activa con la variable SEED_DEMO=true).</p>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <nav className="ob-toc ob-wrap" aria-label="Secciones">
        <a href="#datos">Datos de la demo</a>
        <a href="#recorrido">Recorrido</a>
        <a href="#guion">Guion de 3 minutos</a>
        <a href="#alcance">Qué incluye</a>
        <a href="#consejos">Consejos</a>
      </nav>

      <main className="ob-wrap ob-main">
        <section id="datos" className="ob-section">
          <h2>Lo que ya está cargado</h2>
          <p className="muted">La cuenta demo trae dos mascotas con historia clínica realista. Las fechas se calculan desde el día en que se cargó la demo.</p>
          <div className="ob-pets">
            {PETS.map((p) => (
              <article key={p.name} className="card ob-pet">
                <div className="ob-pet-head">
                  <span className="pet-avatar" style={{ width: 52, height: 52, background: p.tint, fontSize: 26 }} aria-hidden="true">
                    {p.emoji}
                  </span>
                  <div>
                    <h3>{p.name}</h3>
                    <p className="muted small">{p.summary}</p>
                  </div>
                </div>
                <ul className="ob-list">
                  {p.items.map((i) => (
                    <li key={i}>
                      <Icon name="check" size={16} /> {i}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
            <article className="card ob-pet">
              <div className="ob-pet-head">
                <span className="pet-avatar" style={{ width: 52, height: 52, background: 'var(--brand-soft)', color: 'var(--brand-strong)' }} aria-hidden="true">
                  <Icon name="map" size={26} />
                </span>
                <div>
                  <h3>8 lugares en Bogotá</h3>
                  <p className="muted small">Ficticios, solo para la demo</p>
                </div>
              </div>
              <ul className="ob-list">
                <li>
                  <Icon name="check" size={16} /> 3 clínicas y 2 urgencias 24 horas
                </li>
                <li>
                  <Icon name="check" size={16} /> 2 farmacias veterinarias
                </li>
                <li>
                  <Icon name="check" size={16} /> 1 veterinario a domicilio
                </li>
              </ul>
            </article>
          </div>
        </section>

        <section id="recorrido" className="ob-section">
          <h2>Recorrido paso a paso</h2>
          <p className="muted">Cada paso tiene un botón que abre la pantalla exacta. Sigue el orden la primera vez.</p>
          <ol className="ob-steps">
            {STEPS.map((s, i) => (
              <li key={s.title} id={`paso-${i + 1}`} className="card ob-step">
                <div className="ob-step-head">
                  <span className="ob-num">{i + 1}</span>
                  <h3>
                    <Icon name={s.icon} /> {s.title}
                  </h3>
                  <Go target={s.to} primary={i === 0}>
                    {s.cta}
                  </Go>
                </div>
                <div className="ob-step-body">
                  <div>
                    <h4>Haz esto</h4>
                    <ul className="ob-list">
                      {s.doThis.map((t) => (
                        <li key={t}>
                          <Icon name="chevron" size={16} /> {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4>Fíjate en</h4>
                    <ul className="ob-list ob-list-notice">
                      {s.notice.map((t) => (
                        <li key={t}>
                          <Icon name="search" size={16} /> {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="guion" className="ob-section">
          <h2>Guion de demo en 3 minutos</h2>
          <p className="muted">Para presentarla a una clínica o a un inversionista, siguiendo los problemas del pitch.</p>
          <ol className="card ob-script">
            {SCRIPT.map((s) => (
              <li key={s.time}>
                <span className="ob-time">{s.time}</span>
                <div>
                  <strong>{s.problem}</strong>
                  <p className="muted">{s.show}</p>
                  {s.step !== undefined && (
                    <a className="small" href={`#paso-${s.step + 1}`}>
                      Ver paso {s.step + 1}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="alcance" className="ob-section">
          <h2>Qué incluye y qué viene</h2>
          <div className="ob-scope">
            <div className="card">
              <h3>
                <Icon name="check" /> Ya funciona (Fase 1 · MVP)
              </h3>
              <ul className="ob-list">
                {NOW.map((t) => (
                  <li key={t}>
                    <Icon name="check" size={16} /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="card">
              <h3>
                <Icon name="clock" /> Próximas fases
              </h3>
              <ul className="ob-list ob-list-notice">
                {NEXT.map((t) => (
                  <li key={t}>
                    <Icon name="clock" size={16} /> {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="consejos" className="ob-section">
          <h2>Consejos</h2>
          <div className="ob-tips">
            <div className="card">
              <h3>
                <Icon name="phone" /> Instálala en el celular
              </h3>
              <p className="muted">
                En Chrome (Android): menú ⋮ → “Agregar a pantalla principal”. En Safari (iPhone): Compartir → “Agregar a inicio”. Se abre como
                una app.
              </p>
            </div>
            <div className="card">
              <h3>
                <Icon name="share" /> Muestra las dos caras
              </h3>
              <p className="muted">
                Para mostrar la vista del veterinario, abre el enlace compartido en otro dispositivo o en incógnito, así se ve que no requiere
                cuenta.
              </p>
            </div>
            <div className="card">
              <h3>
                <Icon name="clock" /> La demo se reinicia
              </h3>
              <p className="muted">
                Mientras SEED_DEMO=true, cada despliegue o reinicio del servidor devuelve la cuenta demo a su estado original con fechas
                frescas. Puedes cambiar todo sin miedo.
              </p>
            </div>
            <div className="card">
              <h3>
                <Icon name="plus" /> Prueba con tu mascota
              </h3>
              <p className="muted">
                Crea tu propia cuenta para probar con datos reales: la cuenta demo es compartida y la ve cualquiera que entre.
              </p>
            </div>
          </div>
        </section>

        <p className="ob-quote">“Tu veterinario puede cambiar de clínica. La historia de tu mascota no.”</p>
      </main>
    </div>
  );
}
