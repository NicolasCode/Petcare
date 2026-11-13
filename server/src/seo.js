import { readFile } from 'node:fs/promises';
import { query } from './db.js';

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const slugify = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const KIND_LABEL = { clinica: 'Clínica veterinaria', urgencias: 'Urgencias veterinarias', farmacia: 'Farmacia veterinaria', independiente: 'Veterinario independiente' };

// La app es una SPA: para los perfiles de clínica se inyectan título y descripción en el HTML
// para que buscadores y vistas previas de WhatsApp muestren la clínica correcta
export async function renderClinicHtml(indexPath, placeId) {
  const html = await readFile(indexPath, 'utf8');
  const { rows } = await query('SELECT name, kind, locality, city, services, description FROM places WHERE id = $1', [placeId]);
  const p = rows[0];
  if (!p) return html;
  const title = `${p.name} · ${KIND_LABEL[p.kind]} en ${p.locality ? `${p.locality}, ` : ''}${p.city} | Kaimi`;
  const description = (p.description || [KIND_LABEL[p.kind], p.services].filter(Boolean).join('. ')).slice(0, 160);
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${escape(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${escape(description)}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${escape(p.name)}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${escape(description)}`);
}

export async function sitemapXml(baseUrl) {
  const { rows } = await query('SELECT id, name, updated_at FROM places ORDER BY id');
  const urls = [
    `<url><loc>${baseUrl}/directorio</loc></url>`,
    ...rows.map((p) => `<url><loc>${baseUrl}/clinicas/${p.id}-${slugify(p.name)}</loc><lastmod>${p.updated_at.toISOString().slice(0, 10)}</lastmod></url>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`;
}
