const isProduction = process.env.NODE_ENV === 'production';

if (!process.env.DATABASE_URL) {
  throw new Error('Falta la variable de entorno DATABASE_URL');
}
if (isProduction && !process.env.JWT_SECRET) {
  throw new Error('Falta la variable de entorno JWT_SECRET');
}

// URL pública de la app para los enlaces de los correos; Railway expone RAILWAY_PUBLIC_DOMAIN
const appUrl = (
  process.env.APP_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:5173')
).replace(/\/+$/, '');

export const config = {
  isProduction,
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-no-usar-en-produccion',
  sessionDays: 30,
  appUrl,
  adminEmails: (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  // Correo transaccional (Resend). Sin clave, los correos se escriben en el log del servidor
  resendApiKey: process.env.RESEND_API_KEY || null,
  mailFrom: process.env.MAIL_FROM || 'Kaimi <no-responder@kaimi.co>',
  // Notificaciones push (Web Push). Genera las claves con: npx web-push generate-vapid-keys
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY || null,
    privateKey: process.env.VAPID_PRIVATE_KEY || null,
    subject: process.env.VAPID_SUBJECT || 'mailto:hola@kaimi.co',
  },
};

export const isAdminEmail = (email) => config.adminEmails.includes(email.toLowerCase());
