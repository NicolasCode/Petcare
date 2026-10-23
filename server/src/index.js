import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
import { migrate } from './migrate.js';
import { seedDemo } from './seed-demo.js';

await migrate();

// SEED_DEMO=true carga (o reinicia) la cuenta y los lugares de demostración en cada arranque
if (process.env.SEED_DEMO === 'true') {
  const demo = await seedDemo();
  console.log(`Datos de demo cargados. Ingresa con ${demo.email}`);
}

const server = createApp().listen(config.port, () => {
  console.log(`KuraPet escuchando en el puerto ${config.port}`);
});

function shutdown() {
  server.close(() => pool.end().then(() => process.exit(0)));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
