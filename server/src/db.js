import pg from 'pg';
import { config } from './config.js';

// DATE -> 'YYYY-MM-DD' en lugar de Date (evita desfases por zona horaria)
pg.types.setTypeParser(1082, (value) => value);
// NUMERIC -> number
pg.types.setTypeParser(1700, (value) => (value === null ? null : Number(value)));

// Railway expone DATABASE_URL por la red privada (sin SSL) o por el proxy público (con SSL)
const needsSsl = /sslmode=require/.test(config.databaseUrl) || /\.proxy\.rlwy\.net/.test(config.databaseUrl);

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

export const query = (text, params) => pool.query(text, params);
