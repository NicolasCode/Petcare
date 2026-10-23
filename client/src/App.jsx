import { Suspense, lazy } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { EmptyState, Spinner } from './components/States.jsx';
import { useAuth } from './lib/auth.jsx';
import Account from './pages/Account.jsx';
import { Login, Register } from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import PetDetail from './pages/PetDetail.jsx';
import { EditPet, NewPet } from './pages/PetForm.jsx';
import Pets from './pages/Pets.jsx';
import SharedProfile from './pages/SharedProfile.jsx';

// El mapa (Leaflet) se carga solo cuando se necesita
const Places = lazy(() => import('./pages/Places.jsx'));

function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user === undefined) return <Spinner />;
  if (!user) return <Navigate to="/ingresar" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

// Al iniciar sesión o registrarse, esta ruta es la única que decide a dónde ir
function GuestOnly({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user === undefined) return <Spinner />;
  if (!user) return children;
  if (user.isNew) return <Navigate to="/mascotas/nueva" replace state={{ welcome: true }} />;
  return <Navigate to={location.state?.from ?? '/'} replace />;
}

function NotFound() {
  return (
    <div className="page">
      <EmptyState
        icon="paw"
        title="Página no encontrada"
        action={
          <Link className="btn btn-primary" to="/">
            Volver al inicio
          </Link>
        }
      >
        Parece que esta página se escapó a pasear.
      </EmptyState>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/ingresar" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/registro" element={<GuestOnly><Register /></GuestOnly>} />
      <Route path="/compartido/:token" element={<SharedProfile />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="mascotas" element={<Pets />} />
        <Route path="mascotas/nueva" element={<NewPet />} />
        <Route path="mascotas/:petId" element={<PetDetail />} />
        <Route path="mascotas/:petId/editar" element={<EditPet />} />
        <Route path="cerca" element={<Suspense fallback={<Spinner />}><Places /></Suspense>} />
        <Route path="cuenta" element={<Account />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
