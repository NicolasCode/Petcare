import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import Icon from './Icon.jsx';
import Logo from './Logo.jsx';

const NAV = [
  { to: '/', label: 'Inicio', icon: 'home', end: true },
  { to: '/mascotas', label: 'Mascotas', icon: 'paw' },
  { to: '/cerca', label: 'Cerca de mí', short: 'Cerca', icon: 'map' },
  { to: '/cuenta', label: 'Mi cuenta', short: 'Cuenta', icon: 'user' },
];

export default function Layout() {
  const { user } = useAuth();
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Saltar al contenido
      </a>
      <aside className="sidebar">
        <Logo />
        <nav aria-label="Principal">
          {NAV.map((item) => (
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
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Principal">
        {NAV.map((item) => (
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
