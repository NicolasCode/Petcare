import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import Icon from './Icon.jsx';
import Logo from './Logo.jsx';

const NAV = [
  { to: '/', label: 'Inicio', icon: 'home', end: true },
  { to: '/mascotas', label: 'Mascotas', icon: 'paw' },
  { to: '/cerca', label: 'Cerca de mí', short: 'Cerca', icon: 'map' },
  { to: '/cuenta', label: 'Mi cuenta', short: 'Cuenta', icon: 'user' },
];

// Aviso para confirmar el correo: sin él no hay recordatorios por correo ni recuperación de cuenta
function VerifyBanner({ user }) {
  const [state, setState] = useState(null);
  if (user.email_verified || state === 'hidden') return null;
  const resend = async () => {
    setState('sending');
    await api.post('/auth/verify/resend').catch(() => {});
    setState('sent');
  };
  return (
    <div className="verify-banner" role="status">
      <Icon name="bell" size={18} />
      <span>
        {state === 'sent' ? `Te enviamos el enlace a ${user.email}.` : 'Confirma tu correo para recibir los recordatorios y poder recuperar tu cuenta.'}
      </span>
      {state !== 'sent' && (
        <button className="link-btn" onClick={resend} disabled={state === 'sending'}>
          Reenviar correo
        </button>
      )}
      <button className="icon-btn" onClick={() => setState('hidden')} aria-label="Ocultar aviso">
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

export default function Layout({ children }) {
  const { user } = useAuth();
  // Quien trabaja en una clínica ve su panel en la navegación
  const nav = user.clinics?.length ? [...NAV.slice(0, 3), { to: '/clinica', label: 'Mi clínica', short: 'Clínica', icon: 'clinic' }, NAV[3]] : NAV;
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Saltar al contenido
      </a>
      <aside className="sidebar">
        <Logo />
        <nav aria-label="Principal">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="side-link">
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="avatar-initial">{user.name[0]?.toUpperCase()}</span>
          <span className="truncate">{user.name}</span>
        </div>
      </aside>

      <header className="topbar">
        <Logo size={28} />
      </header>

      <main id="main" className="main">
        <VerifyBanner user={user} />
        {children ?? <Outlet />}
      </main>

      <nav className="tabbar" aria-label="Principal">
        {nav.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="tab-link">
            <Icon name={item.icon} size={22} />
            <span>{item.short ?? item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({ title, subtitle, back, actions }) {
  return (
    <div className="page-header">
      <div className="page-header-text">
        {back}
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
