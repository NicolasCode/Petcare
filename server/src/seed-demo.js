// Carga lugares de EJEMPLO para probar el mapa en desarrollo.
// Los nombres son ficticios a propósito: no lo ejecutes en producción.
import { pool } from './db.js';
import { migrate } from './migrate.js';

const places = [
  ['Clínica Veterinaria Demo Chicó', 'clinica', 'Chapinero', 4.6765, -74.0480, false],
  ['Urgencias Veterinarias Demo 24h Norte', 'urgencias', 'Usaquén', 4.7110, -74.0300, true],
  ['Farmacia Veterinaria Demo Cedritos', 'farmacia', 'Usaquén', 4.7230, -74.0410, false],
  ['Hospital Veterinario Demo Teusaquillo', 'urgencias', 'Teusaquillo', 4.6370, -74.0780, true],
  ['Veterinario a Domicilio Demo Suba', 'domicilio', 'Suba', 4.7420, -74.0840, false],
  ['Clínica Veterinaria Demo Kennedy', 'clinica', 'Kennedy', 4.6290, -74.1540, false],
];

await migrate();
for (const [name, kind, locality, lat, lng, open24h] of places) {
  await pool.query(
    `INSERT INTO places (name, kind, locality, address, phone, open_24h, services, lat, lng)
     SELECT $1, $2, $3, 'Dirección de ejemplo', '601 000 0000', $4, 'Consulta general, vacunación', $5, $6
     WHERE NOT EXISTS (SELECT 1 FROM places WHERE name = $1)`,
    [name, kind, locality, open24h, lat, lng],
  );
}
console.log(`Lugares de ejemplo cargados: ${places.length}`);
await pool.end();
