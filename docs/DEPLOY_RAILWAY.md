# Guía de despliegue en Railway

Kaimi se despliega como **un solo servicio** (el mismo contenedor compila el frontend y lo sirve junto a la API) más una base de datos **PostgreSQL 16**. Las migraciones se aplican solas al arrancar.

Tiempo estimado: 15 minutos para lo básico, más lo que tarde Meta en aprobar la plantilla de WhatsApp si la usas.

---

## 1. Crear el proyecto

1. En [railway.com](https://railway.com): **New Project → Deploy from GitHub repo** y elige `NicolasCode/Petcare`.
2. Deja **Root Directory vacío** (raíz del repo). Railway lee `railway.json` y construye con el `Dockerfile`; el comando de inicio (`node server/src/index.js`) y el healthcheck (`/api/health`) ya están fijados ahí.
3. En **Settings → Source**, verifica que la rama sea **`Main`**. Cada merge a `Main` despliega solo.
4. No crees un servicio aparte para `client/`: la cookie de sesión y las rutas `/api` necesitan el mismo dominio.

## 2. Agregar PostgreSQL

1. En el mismo proyecto: **+ New → Database → PostgreSQL**.
2. Abre el servicio de la base y revisa que la imagen sea **PostgreSQL 16** (si la plantilla trae otra versión, cambia el tag de la imagen a `16`). No se necesitan extensiones.
3. En el servicio de la base, **Backups → Enable** (copias diarias). Ahí viven la historia clínica y las fotos.

## 3. Variables del servicio de la app

Pestaña **Variables** del servicio de la app (no el de la base).

### Obligatorias

| Variable | Valor |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referencia al servicio de base de datos; usa la red privada) |
| `JWT_SECRET` | Un secreto largo y aleatorio. Genéralo con `openssl rand -hex 32`. Si lo cambias, todos tienen que volver a iniciar sesión |
| `NODE_ENV` | `production` |
| `ADMIN_EMAILS` | Tu correo (o varios separados por coma). Esas cuentas ven **Administración** |

### Recomendadas

| Variable | Para qué | Sin ella |
|---|---|---|
| `RESEND_API_KEY` | Correos: confirmar cuenta, recuperar contraseña, recordatorios, avisos de citas | Los correos solo se escriben en el log; **nadie puede recuperar su contraseña** |
| `MAIL_FROM` | Remitente, p. ej. `Kaimi <hola@tu-dominio.co>` (dominio verificado en Resend) | Usa `no-responder@kaimi.co`, que Resend rechaza si no es tu dominio |
| `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` | Notificaciones push en el celular | El interruptor de notificaciones dice que no están activas |
| `VAPID_SUBJECT` | `mailto:` de contacto para los servicios push | Usa `mailto:hola@kaimi.co` |
| `APP_URL` | Dominio propio para los enlaces de los correos, p. ej. `https://app.kaimi.co` | Usa el dominio de Railway (`RAILWAY_PUBLIC_DOMAIN`) |

### Opcionales

| Variable | Para qué |
|---|---|
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Recordatorios por WhatsApp de las clínicas en plan Pro (ver sección 7) |
| `WHATSAPP_TEMPLATE`, `WHATSAPP_TEMPLATE_LANG` | Nombre e idioma de la plantilla (por defecto `recordatorio_cuidado` y `es`) |
| `SEED_DEMO` | `true` carga las cuentas demo en cada arranque (ver sección 9). **No lo dejes en producción real** |
| `DEMO_PASSWORD` | Contraseña de las cuentas demo (por defecto `kaimi-demo`) |

> No pongas `PORT`: Railway la inyecta sola.

## 4. Dominio

1. **Settings → Networking → Generate Domain** (te da `algo.up.railway.app`).
2. Para un dominio propio: **Custom Domain**, agrega el `CNAME` que te indica Railway en tu proveedor DNS y pon el mismo dominio en `APP_URL`.
3. El HTTPS lo pone Railway. La cookie de sesión exige HTTPS en producción, así que no uses `http://`.

## 5. Correo con Resend

1. Crea una cuenta en [resend.com](https://resend.com) y en **Domains** agrega tu dominio (p. ej. `kaimi.co`). Copia los registros DNS (SPF, DKIM) en tu proveedor y espera a que aparezca **Verified**.
2. En **API Keys** crea una clave con permiso de envío y pégala en `RESEND_API_KEY`.
3. Pon `MAIL_FROM` con una dirección de ese dominio.
4. Prueba: en la app, **¿Olvidaste tu contraseña?** con tu correo. Si no llega, mira **Deploy Logs**: el error de Resend aparece ahí.

## 6. Notificaciones push

1. En tu computador, dentro del repo: `npx web-push generate-vapid-keys`.
2. Copia la clave pública en `VAPID_PUBLIC_KEY` y la privada en `VAPID_PRIVATE_KEY`. Guárdalas: si las cambias, cada persona tiene que volver a activar las notificaciones.
3. Prueba: **Mi cuenta → Notificaciones en este dispositivo → Enviar una prueba**.
4. En iPhone las notificaciones solo funcionan si Kaimi está instalada en la pantalla de inicio (Safari → Compartir → Agregar a inicio), con iOS 16.4 o superior.

## 7. WhatsApp (plan Pro de clínicas)

Solo se envía a dueños que lo autorizaron en **Mi cuenta**, y solo para clínicas en plan Pro: automáticamente 7 días y 1 día antes de cada refuerzo, o con el botón de cada seguimiento.

1. En [Meta for Developers](https://developers.facebook.com) crea una app de tipo **Business** y agrega el producto **WhatsApp**. Registra y verifica el número de Kaimi.
2. En **WhatsApp Manager → Plantillas**, crea una plantilla de categoría **Utilidad**, idioma **Español**, llamada `recordatorio_cuidado`, con **5 variables en este orden**. Ejemplo:
   > Hola {{1}}, te recordamos que {{2}} tiene pendiente {{3}} el {{4}}. Puedes agendar con {{5}}. — Kaimi
3. Cuando Meta la apruebe, crea un **usuario del sistema** con token permanente y permiso `whatsapp_business_messaging`. Pon el token en `WHATSAPP_TOKEN` y el **Phone number ID** (no el número) en `WHATSAPP_PHONE_NUMBER_ID`.
4. Si usaste otro nombre o idioma de plantilla, ajusta `WHATSAPP_TEMPLATE` y `WHATSAPP_TEMPLATE_LANG` (p. ej. `es_CO`).
5. Meta cobra por conversación iniciada por la empresa. Revisa la tarifa vigente para Colombia antes de activar Pro a muchas clínicas.

## 8. Primer arranque

1. Despliega (o **Redeploy**). En **Deploy Logs** deberías ver:
   ```
   Migración aplicada: 001_init.sql
   Migración aplicada: 002_clinicas.sql
   Migración aplicada: 003_agenda_admin.sql
   Kaimi escuchando en el puerto ...
   ```
   En despliegues siguientes solo aparecen las migraciones nuevas.
2. Abre el dominio y **regístrate con el correo de `ADMIN_EMAILS`**. Verás **Administración** en la barra lateral (en el celular, en **Mi cuenta**).
3. Carga el directorio desde **Cerca de mí → Agregar lugar** (coordenadas: clic derecho en Google Maps → copiar).
4. Para activar clínicas: el veterinario se registra y pide su panel en `/registrar-clinica` (o reclama su lugar desde su perfil público). Tú lo apruebas en **Administración → Solicitudes**. Puedes darle plan Pro de entrada a las clínicas fundadoras.

## 9. Modo demo (para presentaciones)

Con `SEED_DEMO=true`, cada arranque crea o reinicia, con fechas frescas:

- `demo@kaimi.co`: dueño de Timothy y Luna con historia completa y carné con QR.
- `clinica@kaimi.co`: veterinaria de la Clínica Demo Chicó (plan Pro) con pacientes, cita pendiente, reportes y reseñas.
- 8 lugares ficticios en el mapa y una solicitud de clínica pendiente en Administración.

La contraseña de ambas cuentas es `kaimi-demo` (o la de `DEMO_PASSWORD`). El recorrido guiado está en `/onboard`, con botones de acceso de un clic.

**Antes de abrir a usuarios reales:** pon `SEED_DEMO=false` (o borra la variable) y redespliega. Luego elimina desde **Cerca de mí** (ícono de papelera, visible para administradores) los lugares con “Demo” en el nombre. Las cuentas demo puedes borrarlas entrando con ellas y usando **Mi cuenta → Eliminar mi cuenta**.

## 10. Lista de verificación después del despliegue

- [ ] `https://tu-dominio/api/health` responde `{"ok":true}`
- [ ] Registro y confirmación de correo (llega el correo de Resend)
- [ ] **¿Olvidaste tu contraseña?** envía el enlace y permite cambiarla
- [ ] **Mi cuenta → Enviar una prueba** muestra la notificación push
- [ ] Ves **Administración** con el correo de `ADMIN_EMAILS`
- [ ] `/directorio` y el perfil de una clínica abren sin iniciar sesión
- [ ] `https://tu-dominio/sitemap.xml` lista las clínicas (dáselo a Google Search Console)
- [ ] `SEED_DEMO` está apagado si es producción real
- [ ] Backups de PostgreSQL activados

## 11. Solución de problemas

| Síntoma | Causa probable |
|---|---|
| El despliegue falla en el healthcheck | `DATABASE_URL` no está o no apunta a la base. Debe ser la referencia `${{Postgres.DATABASE_URL}}` |
| `Falta la variable de entorno JWT_SECRET` en el log | Falta `JWT_SECRET` con `NODE_ENV=production` |
| `Error en la migración ...` | La base no es PostgreSQL 16 o una migración quedó a medias. El log dice cuál; las migraciones corren en una transacción, así que basta corregir y redesplegar |
| Inicio de sesión que no se mantiene | Estás entrando por `http://` o por un dominio distinto del de la app |
| Los correos no llegan | Revisa el log: sin `RESEND_API_KEY` dice `[correo sin enviar]`; con clave, muestra el error de Resend (casi siempre el dominio de `MAIL_FROM` sin verificar) |
| “Las notificaciones push aún no están activas” | Faltan `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` |
| El botón de WhatsApp de la clínica da error | Token vencido, `WHATSAPP_PHONE_NUMBER_ID` equivocado o plantilla no aprobada; el mensaje exacto de Meta aparece en el log |
| Después de un despliegue alguien ve “Hay una versión nueva de Kaimi” | Normal: tenía la app abierta durante el despliegue. Recargar lo resuelve |
| El mapa no carga las teselas con mucho tráfico | Los servidores públicos de OpenStreetMap son para tráfico bajo. Cambia a MapTiler o Stadia en `client/src/pages/Places.jsx` y en la CSP de `server/src/app.js` |

## Notas de operación

- **Resumen diario:** el propio servidor revisa cada hora y, desde las 8 a. m. de Colombia, envía el resumen de recordatorios y los WhatsApp de las clínicas Pro. `notification_log` evita duplicados aunque haya varias réplicas o reinicios. No hace falta un cron aparte.
- **Fotos:** se guardan reducidas (~640 px) en PostgreSQL, así que sobreviven a los redespliegues sin volumen ni S3. Entran en los backups de la base.
- **Escalar:** puedes subir réplicas del servicio; la sesión es una cookie firmada y el resumen diario no se duplica.
- **CI:** cada PR corre las pruebas de la API y la compilación del frontend en GitHub Actions. Railway despliega solo lo que llega a `Main`.
