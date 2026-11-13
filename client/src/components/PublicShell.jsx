import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import Logo from './Logo.jsx';

// Cabecera de las páginas públicas (directorio, perfil de clínica)
export default function PublicShell({ children }) {
  const { user } = useAuth();
  return (
    <div className="shared">
      <header className="shared-top">
        <Link to="/directorio" aria-label="Kaimi">
          <Logo size={28} />
        </Link>
        {user ? (
          <Link className="btn btn-secondary btn-sm" to="/">
            Ir a la app
          </Link>
        ) : (
          <span className="row-actions">
            <Link className="btn btn-ghost btn-sm" to="/ingresar">
              Ingresar
            </Link>
            <Link className="btn btn-primary btn-sm" to="/registro">
              Crear cuenta
            </Link>
          </span>
        )}
      </header>
      <main>{children}</main>
    </div>
  );
}
