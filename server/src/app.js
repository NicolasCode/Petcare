import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { requireAuth } from './auth.js';
import { pool } from './db.js';
import { errorHandler, notFound } from './errors.js';
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import petRoutes from './routes/pets.js';
import placeRoutes from './routes/places.js';
import { publicShareRouter } from './routes/share.js';

const clientDist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist');

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Railway termina TLS en su proxy

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Teselas del mapa de OpenStreetMap
          'img-src': ["'self'", 'data:', 'https://*.tile.openstreetmap.org'],
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
  app.use('/api/pets', requireAuth, petRoutes);
  app.use('/api/dashboard', requireAuth, dashboardRoutes);
  app.use('/api/places', requireAuth, placeRoutes);
  app.use('/api', () => {
    throw notFound('Ruta');
  });

  // En producción el mismo servicio sirve el frontend compilado
  if (existsSync(clientDist)) {
    // Solo los archivos con hash en el nombre (/assets) se cachean para siempre;
    // íconos, manifest y logo se revalidan para que un cambio de marca se vea de inmediato
    app.use('/assets', express.static(path.join(clientDist, 'assets'), { maxAge: '1y', immutable: true }));
    app.use(express.static(clientDist, { index: false }));
    app.get('/{*splat}', (req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
