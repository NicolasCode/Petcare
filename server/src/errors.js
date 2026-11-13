import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const notFound = (what = 'Recurso') => new HttpError(404, `${what} no encontrado`);

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    const fields = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      fields[key] ??= issue.message;
    }
    return res.status(400).json({ error: 'Revisa los datos del formulario', fields });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  // Violaciones de restricciones de Postgres que pasan la validación
  if (err.code === '23514' || err.code === '22007' || err.code === '22008') {
    return res.status(400).json({ error: 'Algunos datos no son válidos' });
  }
  // Referencia a un lugar, mascota o usuario que no existe
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Uno de los datos hace referencia a algo que no existe' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'El archivo es demasiado grande' });
  }
  console.error(err);
  res.status(500).json({ error: 'Ocurrió un error inesperado. Inténtalo de nuevo.' });
}
