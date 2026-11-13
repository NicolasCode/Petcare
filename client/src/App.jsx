import { Suspense, lazy } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { EmptyState, Spinner } from './components/States.jsx';
import { useAuth } from './lib/auth.jsx';
import PublicShell from './components/PublicShell.jsx';
import Account from './pages/Account.jsx';
import { ForgotPassword, Login, Register, ResetPassword, VerifyEmail } from './pages/Auth.jsx';
import Carne from './pages/Carne.jsx';
import ClinicProfile from './pages/ClinicProfile.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Emergency from './pages/Emergency.jsx';
import LinkClinic from './pages/LinkClinic.jsx';
import PetDetail from './pages/PetDetail.jsx';
import { EditPet, NewPet } from './pages/PetForm.jsx';
import Onboard from './pages/Onboard.jsx';
import Pets from './pages/Pets.jsx';
import SharedProfile from './pages/SharedProfile.jsx';

// El mapa (Leaflet) y el panel de clínica se cargan solo cuando se necesitan
const Places = lazy(() => import('./pages/Places.jsx'));
const ClinicLayout = lazy(() => import('./pages/clinic/ClinicLayout.jsx'));
const ClinicIndex = lazy(() => import('./pages/clinic/ClinicLayout.jsx').then((m) => ({ default: m.ClinicIndex })));
const ClinicHome = lazy(() => import('./pages/clinic/ClinicHome.jsx'));
const ClinicPatients = lazy(() => import('./pages/clinic/ClinicPatients.jsx'));
const ClinicPatient = lazy(() => import('./pages/clinic/ClinicPatient.jsx'));
const ClinicIntake = lazy(() => import('./pages/clinic/ClinicIntake.jsx'));
const ClinicProfileEdit = lazy(() => import('./pages/clinic/ClinicProfileEdit.jsx'));
const ClinicTeam = lazy(() => import('./pages/clinic/ClinicTeam.jsx'));
const ClinicReviews = lazy(() => import('./pages/clinic/ClinicReviews.jsx'));
const ClinicPlan = lazy(() => import('./pages/clinic/ClinicPlan.jsx'));
const ClinicAppointments = lazy(() => import('./pages/clinic/ClinicAppointments.jsx'));
const ClinicReports = lazy(() => import('./pages/clinic/ClinicReports.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));
const RegisterClinic = lazy(() => import('./pages/RegisterClinic.jsx'));

const lazyPage = (el) => <Suspense fallback={<Spinner />}>{el}</Suspense>;

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
  const from = location.state?.from;
  // Quien llega con el enlace de una clínica vuelve a la vinculación, aunque acabe de registrarse
  if (user.isNew && !from?.startsWith('/vincular/')) return <Navigate to="/mascotas/nueva" replace state={{ welcome: true }} />;
  return <Navigate to={from ?? '/'} replace />;
}

// Perfil de clínica: dentro de la app con sesión, público sin ella (el propio componente elige la cabecera)
function PublicOrApp({ children }) {
  const { user } = useAuth();
  if (user === undefined) return <Spinner />;
  return user ? <Layout>{children}</Layout> : children;
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
      <Route path="/recuperar" element={<GuestOnly><ForgotPassword /></GuestOnly>} />
      <Route path="/restablecer/:token" element={<ResetPassword />} />
      <Route path="/verificar/:token" element={<VerifyEmail />} />
      <Route path="/compartido/:token" element={<SharedProfile />} />
      <Route path="/e/:token" element={<Emergency />} />
      <Route path="/onboard" element={<Onboard />} />
      <Route path="/directorio" element={<PublicShell>{lazyPage(<Places />)}</PublicShell>} />
      <Route path="/clinicas/:slug" element={<PublicOrApp><ClinicProfile /></PublicOrApp>} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="mascotas" element={<Pets />} />
        <Route path="mascotas/nueva" element={<NewPet />} />
        <Route path="mascotas/:petId" element={<PetDetail />} />
        <Route path="mascotas/:petId/editar" element={<EditPet />} />
        <Route path="mascotas/:petId/carne" element={<Carne />} />
        <Route path="vincular/:code" element={<LinkClinic />} />
        <Route path="cerca" element={lazyPage(<Places />)} />
        <Route path="cuenta" element={<Account />} />
        <Route path="registrar-clinica" element={lazyPage(<RegisterClinic />)} />
        <Route path="admin" element={lazyPage(<Admin />)} />
        <Route path="clinica" element={lazyPage(<ClinicIndex />)} />
        <Route path="clinica/:placeId" element={lazyPage(<ClinicLayout />)}>
          <Route index element={lazyPage(<ClinicHome />)} />
          <Route path="pacientes" element={lazyPage(<ClinicPatients />)} />
          <Route path="pacientes/:petId" element={lazyPage(<ClinicPatient />)} />
          <Route path="citas" element={lazyPage(<ClinicAppointments />)} />
          <Route path="reportes" element={lazyPage(<ClinicReports />)} />
          <Route path="registro" element={lazyPage(<ClinicIntake />)} />
          <Route path="perfil" element={lazyPage(<ClinicProfileEdit />)} />
          <Route path="equipo" element={lazyPage(<ClinicTeam />)} />
          <Route path="resenas" element={lazyPage(<ClinicReviews />)} />
          <Route path="plan" element={lazyPage(<ClinicPlan />)} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
