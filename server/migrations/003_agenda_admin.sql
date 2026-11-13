-- Registro de clínicas, disponibilidad, solicitudes de cita, plan Pro y WhatsApp

-- Solicitud para aparecer como clínica aliada o veterinario independiente (la aprueba un administrador)
CREATE TABLE place_requests (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Reclamar un lugar que ya está en el directorio en lugar de crear uno nuevo
  existing_place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
  name              TEXT NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN ('clinica', 'urgencias', 'independiente')),
  address           TEXT,
  locality          TEXT,
  city              TEXT NOT NULL DEFAULT 'Bogotá',
  phone             TEXT,
  whatsapp          TEXT,
  lat               DOUBLE PRECISION CHECK (lat BETWEEN -90 AND 90),
  lng               DOUBLE PRECISION CHECK (lng BETWEEN -180 AND 180),
  display_name      TEXT NOT NULL,
  professional_card TEXT,
  message           TEXT,
  status            TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'aprobada', 'rechazada')),
  review_note       TEXT,
  reviewed_at       TIMESTAMPTZ,
  place_id          INTEGER REFERENCES places(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX place_requests_status_idx ON place_requests (status, created_at);

-- "Hay veterinario disponible ahora": siempre con vencimiento, para que nunca quede un dato viejo
ALTER TABLE places
  ADD COLUMN available_until TIMESTAMPTZ,
  ADD COLUMN available_note  TEXT;

-- El dueño pide una cita y la clínica la confirma con fecha y hora (o la rechaza)
CREATE TABLE appointment_requests (
  id             SERIAL PRIMARY KEY,
  place_id       INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  pet_id         INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason         TEXT NOT NULL,
  preferred_date DATE,
  preferred_time TEXT CHECK (preferred_time IN ('manana', 'tarde', 'cualquiera')),
  notes          TEXT,
  status         TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'confirmada', 'rechazada', 'cancelada')),
  appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
  response       TEXT,
  responded_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX appointment_requests_place_idx ON appointment_requests (place_id, status);
CREATE INDEX appointment_requests_pet_idx ON appointment_requests (pet_id);

-- Solicitud de cambio de plan (el cobro se gestiona por fuera mientras no haya pasarela)
CREATE TABLE plan_requests (
  id          SERIAL PRIMARY KEY,
  place_id    INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  plan        TEXT NOT NULL CHECK (plan IN ('gratis', 'pro')),
  status      TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'aprobada', 'rechazada')),
  reviewed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX plan_requests_pending_key ON plan_requests (place_id) WHERE status = 'pendiente';

-- Celular del dueño y autorización expresa para recibir recordatorios por WhatsApp
ALTER TABLE users
  ADD COLUMN phone              TEXT,
  ADD COLUMN whatsapp_opt_in_at TIMESTAMPTZ;
