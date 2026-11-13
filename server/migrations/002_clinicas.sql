-- Fase 2: clínicas y veterinarios como entidades, registros validados, seguimiento y notificaciones

-- ===== Cuentas =====
-- session_version invalida las sesiones abiertas al cambiar la contraseña
ALTER TABLE users
  ADD COLUMN session_version   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN email_verified_at TIMESTAMPTZ,
  ADD COLUMN notify_email      BOOLEAN NOT NULL DEFAULT true;

-- Tokens de un solo uso (verificar correo, restablecer contraseña); solo se guarda su hash
CREATE TABLE auth_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auth_tokens_user_idx ON auth_tokens (user_id, purpose);

-- ===== Directorio =====
-- "A domicilio" pasa a ser una característica del veterinario independiente
ALTER TABLE places DROP CONSTRAINT places_kind_check;
ALTER TABLE places
  ADD COLUMN description TEXT,
  ADD COLUMN specialties TEXT,
  ADD COLUMN equipment   TEXT,
  ADD COLUMN email       TEXT,
  ADD COLUMN home_visits BOOLEAN NOT NULL DEFAULT false,
  -- El plan nunca interviene en el orden de los resultados (ver routes/places.js)
  ADD COLUMN plan        TEXT NOT NULL DEFAULT 'gratis' CHECK (plan IN ('gratis', 'pro')),
  -- Código para que los dueños vinculen a sus mascotas como pacientes (enlace o QR)
  ADD COLUMN intake_code TEXT UNIQUE;
UPDATE places SET kind = 'independiente', home_visits = true WHERE kind = 'domicilio';
ALTER TABLE places ADD CONSTRAINT places_kind_check CHECK (kind IN ('clinica', 'urgencias', 'farmacia', 'independiente'));

-- Horario semanal en hora de Colombia. Varias franjas por día; closes < opens cruza la medianoche
CREATE TABLE place_hours (
  id        SERIAL PRIMARY KEY,
  place_id  INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  weekday   SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0 = domingo
  opens     TIME NOT NULL,
  closes    TIME NOT NULL,
  CHECK (opens <> closes)
);
CREATE INDEX place_hours_place_idx ON place_hours (place_id, weekday);

-- Equipo de la clínica con cuenta en Kaimi. Un veterinario independiente es el admin de su propio lugar
CREATE TABLE place_members (
  id                SERIAL PRIMARY KEY,
  place_id          INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role              TEXT NOT NULL CHECK (role IN ('admin', 'vet', 'staff')),
  display_name      TEXT NOT NULL,
  professional_card TEXT, -- Tarjeta profesional
  specialty         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (place_id, user_id)
);
CREATE INDEX place_members_user_idx ON place_members (user_id);

-- ===== Mascotas =====
ALTER TABLE pets
  ADD COLUMN usual_place_id  INTEGER REFERENCES places(id) ON DELETE SET NULL,
  -- Enlace permanente del carné (QR) con datos mínimos de emergencia; el dueño lo activa o lo revoca
  ADD COLUMN emergency_token TEXT UNIQUE,
  ADD COLUMN emergency_phone TEXT;

-- La foto vive aparte para no cargar los bytes en cada consulta de mascotas.
-- photo_key es aleatoria: la URL no se puede adivinar y cambia con cada foto (caché permanente)
CREATE TABLE pet_photos (
  pet_id     INTEGER PRIMARY KEY REFERENCES pets(id) ON DELETE CASCADE,
  key        TEXT NOT NULL UNIQUE,
  mime       TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  data       BYTEA NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Otros cuidadores (familia) con acceso a la mascota
CREATE TABLE pet_caregivers (
  pet_id     INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pet_id, user_id)
);
CREATE INDEX pet_caregivers_user_idx ON pet_caregivers (user_id);

-- Vínculo mascota–clínica: lo autoriza el dueño y lo puede revocar (Ley 1581)
CREATE TABLE clinic_patients (
  id           SERIAL PRIMARY KEY,
  place_id     INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  pet_id       INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  granted_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  via          TEXT NOT NULL CHECK (via IN ('codigo', 'dueno')),
  consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at   TIMESTAMPTZ
);
CREATE UNIQUE INDEX clinic_patients_active_key ON clinic_patients (place_id, pet_id) WHERE revoked_at IS NULL;
CREATE INDEX clinic_patients_pet_idx ON clinic_patients (pet_id);

-- ===== Historia clínica =====
-- Datos completos de la vacuna y clínica enlazada al directorio
ALTER TABLE preventive_care
  ADD COLUMN lot                TEXT,
  ADD COLUMN product_expires_on DATE,
  ADD COLUMN vet_card           TEXT,
  ADD COLUMN place_id           INTEGER REFERENCES places(id) ON DELETE SET NULL,
  -- "Ya no aplica": el dueño descarta el recordatorio de este refuerzo
  ADD COLUMN dismissed_at       TIMESTAMPTZ;
ALTER TABLE appointments
  ADD COLUMN place_id INTEGER REFERENCES places(id) ON DELETE SET NULL;

-- Origen y validación de cada registro. Los datos del validador se copian para que el registro
-- siga siendo legible aunque el veterinario deje la clínica
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['preventive_care', 'allergies', 'medications', 'appointments', 'weights'] LOOP
    EXECUTE format(
      'ALTER TABLE %I
         ADD COLUMN source TEXT NOT NULL DEFAULT ''cuidador'' CHECK (source IN (''cuidador'', ''clinica'')),
         ADD COLUMN validated_at TIMESTAMPTZ,
         ADD COLUMN validated_place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
         ADD COLUMN validated_place_name TEXT,
         ADD COLUMN validated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
         ADD COLUMN validated_by_name TEXT,
         ADD COLUMN validated_by_card TEXT',
      t);
  END LOOP;
END $$;

-- ===== Reseñas verificables =====
-- Solo se puede calificar una cita que la propia clínica registró o validó
CREATE TABLE reviews (
  id             SERIAL PRIMARY KEY,
  place_id       INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  appointment_id INTEGER NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  rating         SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        TEXT,
  reply          TEXT,
  replied_at     TIMESTAMPTZ,
  hidden_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reviews_place_idx ON reviews (place_id, created_at DESC);

-- ===== Notificaciones =====
CREATE TABLE push_subscriptions (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);

-- Evita enviar dos veces el mismo resumen
CREATE TABLE notification_log (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key     TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
