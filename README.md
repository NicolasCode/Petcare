# Kaimi 🐾

**Todo su cuidado, en un solo lugar.** La historia clínica y el cuidado de tu mascota, siempre a mano.
MVP de la *Fase 1 · Validación & MVP* del roadmap: perfil 360° de la mascota, registro médico, recordatorios y geolocalización básica en Bogotá.

Stack: **React 19 + Vite** (frontend) · **Node 22 + Express 5** (API) · **PostgreSQL 16** · despliegue en **Railway** como un solo servicio.

## Qué incluye

| Módulo | Detalle |
|---|---|
| Cuentas | Registro/ingreso con cookie `httpOnly`, autorización de tratamiento de datos (Ley 1581) obligatoria, eliminación de cuenta |
| Perfil 360° | Especie, raza, edad, peso actual, esterilización, microchip, clínica habitual, notas y alergias destacadas en rojo |
| Historia clínica | Vacunas / desparasitación / antipulgas con próximo refuerzo, alergias con severidad, medicamentos, citas con diagnóstico y curva de peso |
| Recordatorios | Refuerzos vencidos o próximos (30 días), citas (60 días), alimento por acabarse (7 días) y tratamientos en curso |
| Plan nutricional | Calcula cuándo se acaba la bolsa (kg ÷ ración diaria) y permite marcar “Compré una bolsa nueva” |
| Historia portable | Enlace de solo lectura para el veterinario (24 h, 7 o 30 días), revocable, con contador de vistas y sin datos de contacto del dueño |
| Cerca de mí | Mapa (Leaflet + OpenStreetMap) con clínicas, urgencias 24 h, farmacias y veterinarios a domicilio ordenados por distancia; filtros, búsqueda, llamar, WhatsApp y “Cómo llegar” |
| Administración | Los correos en `ADMIN_EMAILS` pueden crear, editar y eliminar lugares del directorio desde la misma pantalla |

Diseño mobile-first: pestañas inferiores en móvil, barra lateral en escritorio, formularios en hoja inferior, modo oscuro automático e instalable como PWA.

### Fuera de alcance (fases siguientes del roadmap)
Cuentas de veterinarios/clínicas y CRM (Fase 2), marketplace de farmacia y alimento (Fase 3), teleorientación, plan PRO y pagos. Los recordatorios se ven dentro de la app; todavía no se envían push ni correos.

## Desarrollo local

Requisitos: Node 22.12+ y PostgreSQL 16.

```bash
cp .env.example .env          # ajusta DATABASE_URL, JWT_SECRET y ADMIN_EMAILS
createdb kaimi
npm install
npm run seed:demo                      # opcional: cuenta demo@kaimi.co / kaimi-demo con datos ficticios
npm run dev                            # API en :3000 y web en http://localhost:5173
```

Las migraciones (`server/migrations/*.sql`) se aplican solas al arrancar el servidor; también puedes correr `npm run migrate`.

Pruebas de la API (usan la base `kaimi_test`, o `TEST_DATABASE_URL`, y **la borran**):

```bash
createdb kaimi_test
npm test
```

## Despliegue en Railway

La app es **un solo servicio**: el mismo contenedor compila el frontend y lo sirve junto a la API (mismo dominio, así funcionan la cookie de sesión y las rutas `/api`). No crees un servicio aparte para `client/`.

1. **New Project → Deploy from GitHub repo** y elige este repositorio. Deja **Root Directory** vacío (raíz del repo): Railway lee `railway.json` y construye con el `Dockerfile`.
2. En el mismo proyecto: **+ New → Database → PostgreSQL**. Revisa en el servicio de base de datos que la imagen sea la versión 16 (si la plantilla trae otra, cambia el tag de la imagen a `16`).
3. En el servicio de la app, pestaña **Variables**:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referencia al servicio de base de datos) |
   | `JWT_SECRET` | un secreto largo, p. ej. la salida de `openssl rand -hex 32` |
   | `NODE_ENV` | `production` |
   | `ADMIN_EMAILS` | tu correo, para gestionar el directorio de clínicas |

4. **Settings → Networking → Generate Domain**. El healthcheck es `/api/health`.
5. Regístrate con el correo de `ADMIN_EMAILS` y carga las clínicas reales desde **Cerca de mí → Agregar lugar** (coordenadas: clic derecho en Google Maps → copiar).

### Datos de demostración

Agrega la variable `SEED_DEMO=true` al servicio y deja que se redespliegue. Al arrancar se crea (o se reinicia, con fechas frescas) la cuenta **`demo@kaimi.co` / `kaimi-demo`** (cámbiala con `DEMO_PASSWORD`) con dos mascotas, Timothy y Luna, y su historia clínica completa: alergia grave, vacunas al día y vencidas, tratamiento en curso, cita próxima, curva de peso y alimento por acabarse. Además carga 8 lugares ficticios en el mapa.

Abre **`/onboard`** para el recorrido guiado: botón “Entrar a la demo” de un clic, 11 pasos con enlaces directos a cada pantalla, guion de 3 minutos para presentar y alcance del MVP. El acceso de un clic solo existe mientras `SEED_DEMO=true`.

Con `SEED_DEMO=true` la cuenta demo se reinicia en cada despliegue o reinicio; cuando termine la demo, bórrala o ponla en `false`. Localmente: `npm run seed:demo`.

> Los lugares de la demo son inventados: no los dejes en una instalación real.

## Estructura

```
server/                 API Express
  migrations/           Esquema SQL (PostgreSQL 16, sin extensiones)
  src/routes/           auth, pets, records (historia clínica), share, dashboard, places
  test/                 Pruebas de integración contra Postgres real
client/                 SPA React + Vite
  src/pages/            Inicio, Mascotas, Perfil, Cerca de mí, Cuenta, Vista compartida
  src/components/       Formularios, modales, gráfica de peso, etc.
Dockerfile, railway.json
```

## Notas

- Las teselas del mapa vienen de los servidores públicos de OpenStreetMap, pensados para tráfico bajo. Antes de escalar, cambia a un proveedor de teselas (MapTiler, Stadia, etc.) en `client/src/pages/Places.jsx` y en la CSP de `server/src/app.js`.
- Las fechas se guardan como `DATE` y el tablero usa la fecha local del navegador para calcular “hoy”.
