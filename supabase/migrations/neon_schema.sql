-- =========================================================================
-- INDUSTRIAL MAINTENANCE DDL SCHEMA FOR NEON POSTGRESQL
-- Compatible with Serverless HTTP queries & Offline-First Dexie.js PWA
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ENUMS
DO $$ BEGIN CREATE TYPE user_role_type AS ENUM ('admin', 'ingeniero', 'inspector', 'consulta'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE estado_semaforo AS ENUM ('gris', 'verde', 'amarillo', 'naranja', 'rojo'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE tipo_elemento_type AS ENUM ('acero_estructural', 'baranda', 'plataforma', 'soporte', 'equipo', 'caneria', 'tanque'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 1. TABLA: Usuarios y Perfiles
CREATE TABLE IF NOT EXISTS public.usuarios_perfiles (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email TEXT NOT NULL UNIQUE,
  nombre_completo TEXT,
  rol user_role_type NOT NULL DEFAULT 'inspector',
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. TABLA: Áreas Industriales
CREATE TABLE IF NOT EXISTS public.areas (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  codigo VARCHAR(50) NOT NULL UNIQUE,
  nombre VARCHAR(255) NOT NULL,
  ubicacion_tecnica_erp VARCHAR(100),
  descripcion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. TABLA: Planos de Ingeniería y Lay-Outs
CREATE TABLE IF NOT EXISTS public.planos (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  area_id VARCHAR(100) NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  titulo VARCHAR(255) NOT NULL,
  archivo_original_url TEXT,
  svg_url TEXT,
  svg_content TEXT,
  archivo_data_url TEXT,
  rotacion INT DEFAULT 0,
  tipo_plano VARCHAR(50) DEFAULT 'area_detalle',
  dimensiones_viewbox JSONB DEFAULT '{"width": 2000, "height": 1200}'::jsonb,
  version INT NOT NULL DEFAULT 1,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. TABLA: Zonas de Inspección y Paquetes de Pintura
CREATE TABLE IF NOT EXISTS public.zonas_inspeccion (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  plano_id VARCHAR(100) NOT NULL REFERENCES public.planos(id) ON DELETE CASCADE,
  codigo VARCHAR(50) NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  cota_nivel NUMERIC(10, 3) DEFAULT 146000.000,
  nombre_nivel VARCHAR(100),
  disciplinas_involucradas TEXT[] DEFAULT '{}',
  estado_salud_apriori VARCHAR(30) DEFAULT 'regular',
  superficie_estimada_m2 NUMERIC(10, 2) DEFAULT 0.00,
  poligono_svg JSONB NOT NULL DEFAULT '{"puntos": []}'::jsonb,
  nivel_acceso_andamio JSONB DEFAULT '{"altura_mts": 6.5, "envolvente_m3": 180.0, "complejidad": "media", "requiere_parada": false}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_plano_zona UNIQUE (plano_id, codigo)
);

-- 5. TABLA: Elementos y Activos Físicos
CREATE TABLE IF NOT EXISTS public.elementos (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  zona_id VARCHAR(100) NOT NULL REFERENCES public.zonas_inspeccion(id) ON DELETE CASCADE,
  tag_codigo VARCHAR(100) NOT NULL,
  codigo_equipo_erp VARCHAR(100),
  qr_token VARCHAR(120) NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  tipo_elemento tipo_elemento_type NOT NULL DEFAULT 'acero_estructural',
  coordenadas_pin JSONB NOT NULL DEFAULT '{"x": 100, "y": 100}'::jsonb,
  geometria_parametros JSONB DEFAULT '{"perfil": "W12x40", "longitud_m": 6.0, "m2_superficie": 14.5, "peso_kg": 358.0, "tipologia": "columna"}'::jsonb,
  criticidad_activo INT NOT NULL DEFAULT 3 CHECK (criticidad_activo BETWEEN 1 AND 5),
  estado_actual estado_semaforo NOT NULL DEFAULT 'gris',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_zona_tag UNIQUE (zona_id, tag_codigo)
);

-- 6. TABLA: Inspecciones de Campo
CREATE TABLE IF NOT EXISTS public.inspecciones (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  elemento_id VARCHAR(100) NOT NULL REFERENCES public.elementos(id) ON DELETE CASCADE,
  inspector_id VARCHAR(100),
  fecha_inspeccion TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  estado_sincronizacion VARCHAR(30) NOT NULL DEFAULT 'sincronizado',
  clasificacion_sustrato VARCHAR(100) NOT NULL DEFAULT 'acero_al_carbono',
  clasificacion_recubrimiento VARCHAR(100) NOT NULL DEFAULT 'epoxi_poliamida',
  grado_corrosion VARCHAR(20) NOT NULL DEFAULT 'Ri 3',
  requiere_reemplazo BOOLEAN NOT NULL DEFAULT false,
  porcentaje_afectado NUMERIC(5, 2) NOT NULL DEFAULT 15.00 CHECK (porcentaje_afectado BETWEEN 0 AND 100),
  criticidad_calculada INT NOT NULL DEFAULT 3 CHECK (criticidad_calculada BETWEEN 1 AND 5),
  observaciones TEXT,
  diagnostico_ia JSONB DEFAULT NULL,
  validado_por_ingeniero_id VARCHAR(100),
  fecha_validacion TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. TABLA: Fotos de Evidencia
CREATE TABLE IF NOT EXISTS public.fotos_inspeccion (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  inspeccion_id VARCHAR(100) NOT NULL REFERENCES public.inspecciones(id) ON DELETE CASCADE,
  storage_url TEXT NOT NULL,
  thumbnail_url TEXT,
  peso_bytes BIGINT NOT NULL DEFAULT 0,
  anotaciones_canvas JSONB DEFAULT '[]'::jsonb,
  analisis_ia JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. TABLA: Parámetros y Coeficientes de Cubicacion
CREATE TABLE IF NOT EXISTS public.parametros_cubicacion (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  categoria VARCHAR(100) NOT NULL,
  clave VARCHAR(100) NOT NULL UNIQUE,
  valor_numerico NUMERIC(12, 4) NOT NULL,
  unidad VARCHAR(50) NOT NULL,
  descripcion TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 9. TABLA: Campañas de Mantenimiento y Paquetes de Andamios
CREATE TABLE IF NOT EXISTS public.campanas_y_paquetes (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  nombre VARCHAR(255) NOT NULL,
  anio_ejecucion INT NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  requiere_parada_planta BOOLEAN NOT NULL DEFAULT false,
  zona_id VARCHAR(100) REFERENCES public.zonas_inspeccion(id),
  costo_andamio_estimado NUMERIC(14, 2) DEFAULT 0.00,
  estado VARCHAR(50) NOT NULL DEFAULT 'planificada',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 10. TABLA: Intervenciones Cubicadas
CREATE TABLE IF NOT EXISTS public.intervenciones_cubicadas (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  inspeccion_id VARCHAR(100) NOT NULL REFERENCES public.inspecciones(id) ON DELETE CASCADE,
  campana_id VARCHAR(100) REFERENCES public.campanas_y_paquetes(id) ON DELETE SET NULL,
  m2_pintura NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  kg_acero_reemplazo NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  ml_barandas NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  m2_rejillas NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  hh_estimadas NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  costo_materiales NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  costo_mano_obra NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  nivel_confiabilidad VARCHAR(50) NOT NULL DEFAULT 'alta',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 11. TABLA: Auditoría de Cambios
CREATE TABLE IF NOT EXISTS public.auditoria_cambios (
  id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  usuario_id VARCHAR(100),
  tabla VARCHAR(100) NOT NULL,
  registro_id VARCHAR(100) NOT NULL,
  accion VARCHAR(20) NOT NULL,
  valores_anteriores JSONB,
  valores_nuevos JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- SEED DATA
INSERT INTO public.parametros_cubicacion (categoria, clave, valor_numerico, unidad, descripcion) VALUES
  ('rendimientos', 'hh_por_m2_pintura_epoxi', 0.4500, 'HH/m2', 'Horas-Hombre por m2 de limpieza mecánica St2 y pintura epoxi'),
  ('rendimientos', 'hh_por_kg_acero_reemplazo', 0.1200, 'HH/kg', 'Horas-Hombre de calderería, corte y montaje de acero'),
  ('costos', 'costo_hh_oficial_montador', 28.5000, 'USD/HH', 'Tarifa horaria cuadrilla de montaje industrial'),
  ('costos', 'costo_m2_sistema_epoxi_poliuretano', 18.2000, 'USD/m2', 'Costo de insumos y consumibles de pintura de alta resistencia'),
  ('costos', 'costo_kg_acero_perfileria', 3.4000, 'USD/kg', 'Costo de provisión de perfil laminado estructural'),
  ('andamios', 'costo_m3_andamio_mes', 12.0000, 'USD/m3', 'Costo de alquiler y armado de andamio multidireccional por m3')
ON CONFLICT (clave) DO NOTHING;

INSERT INTO public.areas (codigo, nombre, ubicacion_tecnica_erp, descripcion) VALUES
  ('131', 'Efluentes y Tratamiento', 'PLT-131-EFLU', 'Área de piletas de neutralización, bombas de lodos y clarificadores'),
  ('411', 'Blanqueo y Reactivos', 'PLT-411-BLAN', 'Torres de dióxido de cloro, digestor y cañerías de reactivos químicos'),
  ('471', 'Caustificación y Cal', 'PLT-471-CAUS', 'Clarificadores de licor verde/blanco, hornos de cal y tolvas de transporte')
ON CONFLICT (codigo) DO NOTHING;
