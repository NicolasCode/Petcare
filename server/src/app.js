import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { requireAuth } from './auth.js';
import { config } from './config.js';
import { pool, query } from './db.js';
import { errorHandler, notFound } from './errors.js';
import authRoutes from './routes/auth.js';
import clinicRoutes from './routes/clinics.js';
import dashboardRoutes from './routes/dashboard.js';
import notificationRoutes from './routes/notifications.js';
import petRoutes from './routes/pets.js';
import placeRoutes from './routes/places.js';
import { publicEmergencyRouter, publicShareRouter } from './routes/share.js';
import { renderClinicHtml, sitemapXml } from './seo.js';

const clientDist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist');

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Railway termina TLS en su proxy

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Teselas del mapa de OpenStreetMap
          // blob: para la vista previa de la foto antes de subirla
          'img-src': ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org'],
        },
      },
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', async (req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/shared', publicShareRouter);
  app.use('/api/emergency', publicEmergencyRouter);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/pets', requireAuth, petRoutes);
  app.use('/api/dashboard', requireAuth, dashboardRoutes);
  app.use('/api/places', placeRoutes);
  app.use('/api/clinics', requireAuth, clinicRoutes);

  // Fotos de mascotas: la clave es aleatoria y cambia con cada foto, así que se cachean para siempre
  app.get('/api/photos/:key', async (req, res) => {
    const { rows } = await query('SELECT mime, data FROM pet_photos WHERE key = $1', [String(req.params.key).slice(0, 64)]);
    if (!rows[0]) throw notFound('Foto');
    res.set({ 'Content-Type': rows[0].mime, 'Cache-Control': 'public, max-age=31536000, immutable' });
    res.send(rows[0].data);
  });

  app.get('/sitemap.xml', async (req, res) => {
    res.type('application/xml').send(await sitemapXml(config.appUrl));
  });
  app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send(`User-agent: *\nDisallow: /api/\nDisallow: /compartido/\nDisallow: /e/\nSitemap: ${config.appUrl}/sitemap.xml\n`);
  });
  app.use('/api', () => {
    throw notFound('Ruta');
  });

  // En producción el mismo servicio sirve el frontend compilado
  if (existsSync(clientDist)) {
    // Solo los archivos con hash en el nombre (/assets) se cachean para siempre;
    // íconos, manifest y logo se revalidan para que un cambio de marca se vea de inmediato
    app.use('/assets', express.static(path.join(clientDist, 'assets'), { maxAge: '1y', immutable: true }));
    app.use(express.static(clientDist, { index: false }));
    // Perfil público de clínica con título y descripción propios
    app.get('/clinicas/:slug', async (req, res, next) => {
      const placeId = parseInt(req.params.slug, 10);
      if (!placeId) return next();
      res.set('Cache-Control', 'no-cache');
      res.type('html').send(await renderClinicHtml(path.join(clientDist, 'index.html'), placeId));
    });
    app.get('/{*splat}', (req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
