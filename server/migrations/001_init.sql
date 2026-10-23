CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  -- Autorización de tratamiento de datos (Ley 1581 de 2012)
  consent_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TABLE pets (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  species       TEXT NOT NULL CHECK (species IN ('perro', 'gato', 'ave', 'conejo', 'roedor', 'reptil', 'otro')),
  breed         TEXT,
  sex           TEXT CHECK (sex IN ('macho', 'hembra')),
  birth_date    DATE,
  color         TEXT,
  microchip     TEXT,
  sterilized    BOOLEAN NOT NULL DEFAULT false,
  usual_clinic  TEXT,
  notes         TEXT,
  -- Plan nutricional: permite estimar cuándo se acaba el alimento
  food_name           TEXT,
  food_bag_kg         NUMERIC(6, 2) CHECK (food_bag_kg > 0),
  food_daily_g        INTEGER CHECK (food_daily_g > 0),
  food_bag_started_on DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pets_user_id_idx ON pets (user_id);

-- Vacunas, desparasitaciones y antipulgas
CREATE TABLE preventive_care (
  id          SERIAL PRIMARY KEY,
  pet_id      INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('vacuna', 'desparasitacion', 'antipulgas', 'otro')),
  name        TEXT NOT NULL,
  applied_on  DATE NOT NULL,
  next_due    DATE,
  vet         TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (next_due IS NULL OR next_due >= applied_on)
);
CREATE INDEX preventive_care_pet_id_idx ON preventive_care (pet_id);

CREATE TABLE allergies (
  id          SERIAL PRIMARY KEY,
  pet_id      INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  allergen    TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'moderada' CHECK (severity IN ('leve', 'moderada', 'grave')),
  reaction    TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX allergies_pet_id_idx ON allergies (pet_id);

CREATE TABLE medications (
  id          SERIAL PRIMARY KEY,
  pet_id      INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  dosage      TEXT,
  frequency   TEXT,
  start_date  DATE NOT NULL,
  end_date    DATE,
  prescribed_by TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX medications_pet_id_idx ON medications (pet_id);

CREATE TABLE appointments (
  id           SERIAL PRIMARY KEY,
  pet_id       INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  reason       TEXT NOT NULL,
  clinic       TEXT,
  vet          TEXT,
  status       TEXT NOT NULL DEFAULT 'programada' CHECK (status IN ('programada', 'completada', 'cancelada')),
  diagnosis    TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX appointments_pet_id_idx ON appointments (pet_id, scheduled_at);

CREATE TABLE weights (
  id          SERIAL PRIMARY KEY,
  pet_id      INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  measured_on DATE NOT NULL,
  weight_kg   NUMERIC(6, 2) NOT NULL CHECK (weight_kg > 0),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX weights_pet_id_idx ON weights (pet_id, measured_on);

-- Enlaces de solo lectura para que un veterinario vea la historia (con autorización del dueño)
CREATE TABLE share_links (
  id             SERIAL PRIMARY KEY,
  pet_id         INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  token          TEXT NOT NULL UNIQUE,
  expires_at     TIMESTAMPTZ NOT NULL,
  revoked_at     TIMESTAMPTZ,
  view_count     INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX share_links_pet_id_idx ON share_links (pet_id);

-- Directorio de clínicas, veterinarios a domicilio y farmacias
CREATE TABLE places (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('clinica', 'urgencias', 'farmacia', 'domicilio')),
  address     TEXT,
  locality    TEXT,
  city        TEXT NOT NULL DEFAULT 'Bogotá',
  phone       TEXT,
  whatsapp    TEXT,
  website     TEXT,
  open_24h    BOOLEAN NOT NULL DEFAULT false,
  services    TEXT,
  lat         DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng         DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
