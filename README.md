# Kaimi 🐾

**Todo su cuidado, en un solo lugar.** La historia clínica y el cuidado de tu mascota, siempre a mano.
Fase 1 (MVP para dueños) + herramientas para clínicas fundadoras: carné digital, registros validados por clínica, seguimiento, directorio con horarios y reseñas verificadas, y la base del modelo freemium.

Stack: **React 19 + Vite** (frontend) · **Node 22 + Express 5** (API) · **PostgreSQL 16** · despliegue en **Railway** como un solo servicio.

## Qué incluye

### Para dueños
| Módulo | Detalle |
|---|---|
| Cuentas | Registro con autorización de datos (Ley 1581), confirmación de correo, recuperar y cambiar contraseña (cierra las demás sesiones), eliminación de cuenta |
| Perfil 360° | Foto, especie, raza, edad, peso, esterilización, microchip, clínica habitual enlazada al directorio, alergias destacadas |
| Carné digital | Carné con la marca Kaimi, imprimible o en PDF, con tabla de vacunas (lote, vencimiento del producto, médico) y QR de emergencia permanente y revocable |
| Historia clínica | Vacunas / desparasitación / antipulgas, alergias, medicamentos, citas y peso. Cada registro dice si lo ingresó el cuidador o lo validó una clínica (con veterinario y tarjeta profesional); lo validado queda bloqueado para el dueño |
| Seguimiento | Próximas fechas con estado; “Ya se aplicó” (calcula el siguiente refuerzo), “Ya no aplica”, marcar citas atendidas o canceladas, contacto con la clínica responsable |
| Recordatorios | En la app, resumen diario por correo y notificaciones push: 7 días antes, el día anterior, el mismo día y 3 días después |
| Familia | Varios cuidadores por mascota: ven y registran, no borran ni comparten |
| Clínicas con acceso | El dueño vincula una clínica con su código o QR, autoriza el acceso y lo puede revocar |
| Citas | Pide cita a una clínica aliada (motivo, fecha y horario preferidos); la clínica la confirma con fecha y hora y le llega el aviso |
| WhatsApp | Autorización expresa para que las clínicas de sus mascotas le recuerden por WhatsApp; al retirarla se borra el celular |
| Historia portable | Enlace temporal de solo lectura para cualquier veterinario |

### Directorio
Público (`/directorio`, sin cuenta), con horario semanal y “abierto ahora” en hora de Colombia, aviso de “veterinario disponible ahora” que la clínica activa por 2, 4 u 8 horas y se apaga solo, especialidades, equipos, veterinarios independientes (con atención a domicilio), perfil público por clínica (`/clinicas/:id-nombre`, con metadatos para buscadores y WhatsApp, y `sitemap.xml`) y reseñas verificadas: solo se califica una consulta que la propia clínica registró o validó. **El orden es por distancia o nombre; ni el plan ni las reseñas cambian la posición** (hay una prueba que lo verifica).

### Para clínicas (`/clinica`)
Pacientes (alta por enlace o QR imprimible con autorización del dueño), historia de cada paciente con registros validados por la clínica y validación de lo que ingresó el cuidador, solicitudes de cita, próximos seguimientos con WhatsApp o correo al dueño, disponibilidad temporal, perfil y horario editables, equipo con roles (admin, veterinario, recepción) y respuesta a reseñas.

Cualquier veterinario o clínica pide su panel en **`/registrar-clinica`** (o reclama un lugar que ya está en el directorio desde su perfil público) y un administrador lo aprueba.

### Freemium
Plan **Gratis** con todo lo anterior (hasta 5 personas en el equipo). Plan **Pro** con reportes de vacunación, seguimiento y pacientes (exportables a CSV), recordatorios automáticos por WhatsApp 7 días y 1 día antes de cada refuerzo (solo a dueños que lo autorizaron) y equipos de hasta 50 personas (`server/src/plans.js`). La clínica solicita el plan desde su panel y un administrador lo activa cuando el pago está acordado (todavía no hay pasarela de pago). El plan nunca interviene en el orden del directorio.

### Administración
Los correos en `ADMIN_EMAILS` ven **Administración** (`/admin`): aprueban o rechazan solicitudes de clínicas (con aviso por correo), activan planes, ven todos los lugares con su equipo y pacientes, y ocultan reseñas que incumplan las normas. También crean y editan lugares desde “Cerca de mí”.

### Fuera de alcance
Pasarela de pago del plan Pro, agenda con cupos reservables por el dueño, marketplace (Fase 3) y teleorientación.

## Desarrollo local

Requisitos: Node 22.12+ y PostgreSQL 16.

```bash
cp .env.example .env          # ajusta DATABASE_URL, JWT_SECRET y ADMIN_EMAILS
createdb kaimi
npm install
npm run seed:demo                      # opcional: demo@kaimi.co y clinica@kaimi.co / kaimi-demo con datos ficticios
npm run dev                            # API en :3000 y web en http://localhost:5173
```

Las migraciones (`server/migrations/*.sql`) se aplican solas al arrancar el servidor; también puedes correr `npm run migrate`.

Pruebas de la API (usan la base `kaimi_test`, o `TEST_DATABASE_URL`, y **la borran**). También corren en GitHub Actions (`.github/workflows/ci.yml`) junto con la compilación del frontend:

```bash
createdb kaimi_test
npm test
```

## Despliegue en Railway

> Guía completa paso a paso (correo, push, WhatsApp, dominio, verificación y solución de problemas): **[docs/DEPLOY_RAILWAY.md](docs/DEPLOY_RAILWAY.md)**. Abajo, el resumen.

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
   | `RESEND_API_KEY`, `MAIL_FROM` | para enviar correos (confirmación, recuperar contraseña, recordatorios). Sin ellas, los correos solo se escriben en el log |
   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | para notificaciones push; genéralas con `npx web-push generate-vapid-keys` |
   | `APP_URL` | opcional: dominio propio para los enlaces de los correos (por defecto usa el dominio de Railway) |
   | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE` | opcional: recordatorios por WhatsApp de las clínicas Pro con la Cloud API de Meta. La plantilla (aprobada por Meta) recibe nombre del dueño, mascota, cuidado, fecha y clínica |

4. **Settings → Networking → Generate Domain**. El healthcheck es `/api/health`.

> El comando de inicio está fijado en `railway.json` (`node server/src/index.js`) y tiene prioridad sobre el panel, así que no hace falta configurar *Custom Start Command*.
5. Regístrate con el correo de `ADMIN_EMAILS` y carga las clínicas reales desde **Cerca de mí → Agregar lugar** (coordenadas: clic derecho en Google Maps → copiar).

### Datos de demostración

Agrega la variable `SEED_DEMO=true` al servicio y deja que se redespliegue. Al arrancar se crean (o se reinician, con fechas frescas) dos cuentas con contraseña `kaimi-demo` (cámbiala con `DEMO_PASSWORD`):

- **`demo@kaimi.co`**: dueño de Timothy y Luna con historia clínica completa (alergia grave, vacunas al día y vencidas, tratamiento en curso, cita próxima, curva de peso, alimento por acabarse, carné con QR).
- **`clinica@kaimi.co`**: veterinaria y administradora de la Clínica Veterinaria Demo Chicó (plan Pro), con dos pacientes (Timothy y Rocky), registros validados, una solicitud de cita pendiente, seguimientos, reportes, veterinario disponible y dos reseñas verificadas.

Además deja una solicitud de clínica pendiente para revisar en `/admin` (entra con un correo de `ADMIN_EMAILS`).

También carga 8 lugares ficticios con horarios en el mapa.

Abre **`/onboard`** para el recorrido guiado: botones “Entrar a la demo” y “Entrar como clínica” de un clic, 14 pasos con enlaces directos a cada pantalla, guion de 3 minutos para presentar y alcance. El acceso de un clic solo existe mientras `SEED_DEMO=true`.

Con `SEED_DEMO=true` la cuenta demo se reinicia en cada despliegue o reinicio; cuando termine la demo, bórrala o ponla en `false`. Localmente: `npm run seed:demo`.

> Los lugares de la demo son inventados: no los dejes en una instalación real.

## Estructura

```
server/                 API Express
  migrations/           Esquema SQL (PostgreSQL 16, sin extensiones)
  src/routes/           auth, pets, records, share, dashboard, places, clinics, notifications
  src/reminders.js      Recordatorios del tablero, seguimientos de clínica y resumen diario
  src/hours.js          Horarios y "abierto ahora" en hora de Colombia
  src/plans.js          Planes para clínicas (freemium)
  test/                 Pruebas de integración contra Postgres real
client/                 SPA React + Vite
  src/pages/            Inicio, Mascotas, Perfil, Carné, Cerca de mí, Cuenta, vistas públicas
  src/pages/clinic/     Panel de clínica
  public/sw.js          Service worker (solo notificaciones push)
  src/components/       Formularios, modales, gráfica de peso, etc.
Dockerfile, railway.json
```

## Notas

- Las teselas del mapa vienen de los servidores públicos de OpenStreetMap, pensados para tráfico bajo. Antes de escalar, cambia a un proveedor de teselas (MapTiler, Stadia, etc.) en `client/src/pages/Places.jsx` y en la CSP de `server/src/app.js`.
- Las fechas se guardan como `DATE` y el tablero usa la fecha local del navegador para calcular “hoy”. Los horarios y el resumen diario usan la hora de Colombia.
- Las fotos se reducen en el navegador (~640 px) y se guardan en PostgreSQL (`pet_photos`), así sobreviven a los redespliegues sin configurar almacenamiento externo. Si el volumen crece, se pueden mover a S3/R2 sin cambiar la API.
- El resumen diario lo programa el propio servidor (revisa cada hora desde las 8 a. m.); `notification_log` evita envíos duplicados aunque haya varias instancias.
