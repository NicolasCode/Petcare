import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Field, FormError } from '../components/Field.jsx';
import Icon from '../components/Icon.jsx';
import Logo from '../components/Logo.jsx';
import { ApiError, api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

function AuthShell({ title, subtitle, children }) {
  return (
    <div className="auth">
      <aside className="auth-brand">
        <Logo size={40} />
        <div>
          <h2>Todo su cuidado, en un solo lugar.</h2>
          <ul className="auth-points">
            <li>
              <Icon name="shield" /> Historia clínica portable: vacunas, alergias y peso siempre a mano.
            </li>
            <li>
              <Icon name="clock" /> Recordatorios de refuerzos, citas y alimento.
            </li>
            <li>
              <Icon name="map" /> Clínicas, urgencias y farmacias cerca de ti.
            </li>
          </ul>
        </div>
        <p className="auth-quote">“Tu veterinario puede cambiar de clínica. La historia de tu mascota no.”</p>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-logo-mobile">
            <Logo size={36} />
          </div>
          <h1>{title}</h1>
          <p className="muted">{subtitle}</p>
          {children}
        </div>
      </main>
    </div>
  );
}

function useAuthForm(initial, submit) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const bind = (name) => ({
    value: values[name],
    onChange: (e) => {
      const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      setValues((s) => ({ ...s, [name]: v }));
      setErrors((s) => ({ ...s, [name]: undefined }));
    },
  });
  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await submit(values);
    } catch (err) {
      if (err instanceof ApiError && err.fields && Object.keys(err.fields).length) setErrors(err.fields);
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return { values, bind, errors, error, busy, onSubmit };
}

function PasswordInput(props) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-action">
      <input type={show ? 'text' : 'password'} {...props} />
      <button type="button" className="link-btn" onClick={() => setShow((s) => !s)}>
        {show ? 'Ocultar' : 'Mostrar'}
      </button>
    </div>
  );
}

export function Login() {
  const { login } = useAuth();
  const f = useAuthForm({ email: '', password: '' }, (v) => login(v.email, v.password));
  return (
    <AuthShell title="Bienvenido de nuevo" subtitle="Ingresa para ver la historia de tus mascotas.">
      <form onSubmit={f.onSubmit} className="stack" noValidate>
        <FormError error={f.error} />
        <Field label="Correo electrónico" error={f.errors.email}>
          {(p) => <input type="email" autoComplete="email" inputMode="email" required {...p} {...f.bind('email')} />}
        </Field>
        <Field label="Contraseña" error={f.errors.password}>
          {(p) => <PasswordInput autoComplete="current-password" required {...p} {...f.bind('password')} />}
        </Field>
        <p className="auth-forgot">
          <Link to="/recuperar">¿Olvidaste tu contraseña?</Link>
        </p>
        <button className="btn btn-primary btn-block btn-lg" disabled={f.busy}>
          {f.busy ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
      <p className="auth-switch">
        ¿No tienes cuenta? <Link to="/registro">Crea una gratis</Link>
      </p>
      <p className="auth-switch">
        <Link to="/onboard">Ver el recorrido de la demo</Link>
      </p>
    </AuthShell>
  );
}

export function Register() {
  const { register } = useAuth();
  const f = useAuthForm({ name: '', email: '', password: '', consent: false }, register);
  return (
    <AuthShell title="Crea tu cuenta" subtitle="Gratis. En menos de un minuto tendrás el perfil de tu mascota.">
      <form onSubmit={f.onSubmit} className="stack" noValidate>
        <FormError error={f.error} />
        <Field label="Tu nombre" error={f.errors.name}>
          {(p) => <input autoComplete="name" required {...p} {...f.bind('name')} />}
        </Field>
        <Field label="Correo electrónico" error={f.errors.email}>
          {(p) => <input type="email" autoComplete="email" inputMode="email" required {...p} {...f.bind('email')} />}
        </Field>
        <Field label="Contraseña" error={f.errors.password} hint="Mínimo 8 caracteres.">
          {(p) => <PasswordInput autoComplete="new-password" minLength={8} required {...p} {...f.bind('password')} />}
        </Field>
        <div className={`field${f.errors.consent ? ' has-error' : ''}`}>
          <label className="check">
            <input type="checkbox" checked={f.values.consent} onChange={f.bind('consent').onChange} />
            <span>
              Autorizo el tratamiento de mis datos personales y los de mis mascotas conforme a la Ley 1581 de 2012. Solo se comparten
              con un veterinario cuando yo genere un enlace.
            </span>
          </label>
          {f.errors.consent && <p className="field-error">{f.errors.consent}</p>}
        </div>
        <button className="btn btn-primary btn-block btn-lg" disabled={f.busy}>
          {f.busy ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>
      <p className="auth-switch">
        ¿Ya tienes cuenta? <Link to="/ingresar">Ingresa</Link>
      </p>
    </AuthShell>
  );
}

export function ForgotPassword() {
  const [sent, setSent] = useState(null);
  const f = useAuthForm({ email: '' }, async (v) => {
    await api.post('/auth/forgot', { email: v.email });
    setSent(v.email);
  });
  return (
    <AuthShell title="Recupera tu cuenta" subtitle="Te enviaremos un enlace para crear una contraseña nueva.">
      {sent ? (
        <div className="stack">
          <div className="alert alert-ok">
            Si existe una cuenta con <strong>{sent}</strong>, en unos minutos te llegará el enlace. Revisa también la carpeta de spam. El enlace vence en 1 hora.
          </div>
          <Link className="btn btn-secondary btn-block" to="/ingresar">
            Volver a ingresar
          </Link>
        </div>
      ) : (
        <form onSubmit={f.onSubmit} className="stack" noValidate>
          <FormError error={f.error} />
          <Field label="Correo electrónico" error={f.errors.email}>
            {(p) => <input type="email" autoComplete="email" inputMode="email" required {...p} {...f.bind('email')} />}
          </Field>
          <button className="btn btn-primary btn-block btn-lg" disabled={f.busy}>
            {f.busy ? 'Enviando…' : 'Enviar enlace'}
          </button>
        </form>
      )}
      {!sent && (
        <p className="auth-switch">
          <Link to="/ingresar">Volver a ingresar</Link>
        </p>
      )}
    </AuthShell>
  );
}

export function ResetPassword() {
  const { token } = useParams();
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const f = useAuthForm({ password: '' }, async (v) => {
    await resetPassword(token, v.password);
    navigate('/', { replace: true });
  });
  return (
    <AuthShell title="Crea una contraseña nueva" subtitle="Al guardarla se cerrará la sesión en tus otros dispositivos.">
      <form onSubmit={f.onSubmit} className="stack" noValidate>
        <FormError error={f.error} />
        <Field label="Contraseña nueva" error={f.errors.password} hint="Mínimo 8 caracteres.">
          {(p) => <PasswordInput autoComplete="new-password" minLength={8} required {...p} {...f.bind('password')} />}
        </Field>
        <button className="btn btn-primary btn-block btn-lg" disabled={f.busy}>
          {f.busy ? 'Guardando…' : 'Guardar y entrar'}
        </button>
      </form>
      <p className="auth-switch">
        ¿El enlace venció? <Link to="/recuperar">Pide uno nuevo</Link>
      </p>
    </AuthShell>
  );
}

export function VerifyEmail() {
  const { token } = useParams();
  const { user, refresh } = useAuth();
  const [state, setState] = useState({ status: 'loading' });
  const started = useRef(false);
  useEffect(() => {
    // El token es de un solo uso: evita el doble envío del modo estricto de React
    if (started.current) return;
    started.current = true;
    api
      .post('/auth/verify', { token })
      .then(() => {
        setState({ status: 'ok' });
        refresh().catch(() => {});
      })
      .catch((err) => setState({ status: 'error', message: err.message }));
  }, [token, refresh]);
  return (
    <AuthShell title="Confirmación de correo" subtitle="">
      {state.status === 'loading' ? (
        <span className="spinner" />
      ) : state.status === 'ok' ? (
        <div className="stack">
          <div className="alert alert-ok">¡Listo! Tu correo quedó confirmado. Te enviaremos ahí los recordatorios de tus mascotas.</div>
          <Link className="btn btn-primary btn-block" to={user ? '/' : '/ingresar'}>
            {user ? 'Ir a Kaimi' : 'Ingresar'}
          </Link>
        </div>
      ) : (
        <div className="stack">
          <FormError error={state.message} />
          <Link className="btn btn-secondary btn-block" to={user ? '/cuenta' : '/ingresar'}>
            {user ? 'Pedir otro enlace desde Mi cuenta' : 'Ingresar'}
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
