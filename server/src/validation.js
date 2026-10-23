import { z } from 'zod';

const msg = {
  required: 'Este campo es obligatorio',
  date: 'Fecha no válida',
};

// Texto opcional: '' se guarda como NULL
export const optText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .nullish()
    .transform((v) => (v ? v : null));

export const reqText = (max = 120) =>
  z.string({ error: msg.required }).trim().min(1, msg.required).max(max, `Máximo ${max} caracteres`);

export const reqDate = z.iso.date({ error: msg.date });

export const optDate = z
  .union([z.iso.date({ error: msg.date }), z.literal('')])
  .nullish()
  .transform((v) => (v ? v : null));

export const id = z.coerce.number().int().positive();

// Número positivo opcional: '' o null se guardan como NULL
export const optPositive = (max, { int = false } = {}) =>
  z
    .union([z.number(), z.literal('')])
    .nullish()
    .transform((v) => (v === '' || v === undefined ? null : v))
    .refine((v) => v === null || (v > 0 && v <= max && (!int || Number.isInteger(v))), 'Valor no válido');

export const todayIso = () => new Date().toISOString().slice(0, 10);

// Inserta/actualiza solo las columnas declaradas en el esquema (nunca entrada del usuario)
export function insertSql(table, data, extra = {}) {
  const row = { ...extra, ...data };
  const cols = Object.keys(row);
  return {
    text: `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    values: cols.map((c) => row[c]),
  };
}

export function updateSql(table, data, where) {
  const cols = Object.keys(data);
  const whereCols = Object.keys(where);
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
  const conds = whereCols.map((c, i) => `${c} = $${cols.length + i + 1}`).join(' AND ');
  return {
    text: `UPDATE ${table} SET ${sets} WHERE ${conds} RETURNING *`,
    values: [...cols.map((c) => data[c]), ...whereCols.map((c) => where[c])],
  };
}
