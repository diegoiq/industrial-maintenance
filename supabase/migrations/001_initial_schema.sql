-- ==============================================================================
-- INDUSTRIAL MAINTENANCE (Asset Integrity · Corrosion Management · Planning)
-- Migration 001: Initial Schema & Infrastructure Telemetry Function
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUMS & DOMAINS
DO $$ BEGIN
    CREATE TYPE user_role_type AS ENUM ('admin', 'ingeniero', 'inspector', 'consulta');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE estado_semaforo AS ENUM ('gris', 'verde', 'amarillo', 'naranja', 'rojo');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE tipo_elemento_type AS ENUM (
        'acero_estructural', 
        'baranda', 
        'plataforma', 
        'soporte', 
        'equipo', 
        'caneria', 
        'tanque'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. PERFILES DE USUARIO Y ROLES (Supabase Auth Link)
CREATE TABLE IF NOT EXISTS public.usuarios_perfiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    nombre_completo TEXT,
    rol user_role_type NOT NULL DEFAULT 'inspector',
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. ÁREAS DE PLANTA (ej. 131 Efluentes, 411 Blanqueo, 471 Caustificación)
CREATE TABLE IF NOT EXISTS public.areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo VARCHAR(50) NOT NULL UNIQUE,
    nombre VARCHAR(255) NOT NULL,
    ubicacion_tecnica_erp VARCHAR(100),
    descripcion TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. PLANOS DE PLANTA (SVG, PDF, DXF convertido)
CREATE TABLE IF NOT EXISTS public.planos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_id UUID NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
    titulo VARCHAR(255) NOT NULL,
    archivo_original_url TEXT,
    svg_url TEXT,
    dimensiones_viewbox JSONB DEFAULT '{"width": 2000, "height": 1200}'::jsonb,
    version INT NOT NULL DEFAULT 1,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. ZONAS DE INSPECCIÓN (Polígonos interactivos sobre el plano SVG)
CREATE TABLE IF NOT EXISTS public.zonas_inspeccion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plano_id UUID NOT NULL REFERENCES public.planos(id) ON DELETE CASCADE,
    codigo VARCHAR(50) NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    poligono_svg JSONB NOT NULL DEFAULT '{"puntos": []}'::jsonb,
    nivel_acceso_andamio JSONB DEFAULT '{
        "altura_mts": 6.5,
        "envolvente_m3": 180.0,
        "complejidad": "media",
        "requiere_parada": false
    }'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_plano_zona UNIQUE (plano_id, codigo)
);

-- 7. ELEMENTOS / ACTIVOS FÍSICOS (Con Pin en plano, QR y tags ERP)
CREATE TABLE IF NOT EXISTS public.elementos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zona_id UUID NOT NULL REFERENCES public.zonas_inspeccion(id) ON DELETE CASCADE,
    tag_codigo VARCHAR(100) NOT NULL,
    codigo_equipo_erp VARCHAR(100),
    qr_token VARCHAR(120) NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
    tipo_elemento tipo_elemento_type NOT NULL DEFAULT 'acero_estructural',
    coordenadas_pin JSONB NOT NULL DEFAULT '{"x": 100, "y": 100}'::jsonb,
    geometria_parametros JSONB DEFAULT '{
        "perfil": "W12x40",
        "longitud_m": 6.0,
        "m2_superficie": 14.5,
        "peso_kg": 358.0,
        "tipologia": "columna"
    }'::jsonb,
    criticidad_activo INT NOT NULL DEFAULT 3 CHECK (criticidad_activo BETWEEN 1 AND 5),
    estado_actual estado_semaforo NOT NULL DEFAULT 'gris',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_zona_tag UNIQUE (zona_id, tag_codigo)
);

-- 8. INSPECCIONES DE CORROSIÓN Y DETERIORO
CREATE TABLE IF NOT EXISTS public.inspecciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elemento_id UUID NOT NULL REFERENCES public.elementos(id) ON DELETE CASCADE,
    inspector_id UUID REFERENCES auth.users(id),
    fecha_inspeccion TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    estado_sincronizacion VARCHAR(30) NOT NULL DEFAULT 'sincronizado' CHECK (estado_sincronizacion IN ('pendiente', 'sincronizado', 'error')),
    clasificacion_sustrato VARCHAR(100) NOT NULL DEFAULT 'acero_al_carbono',
    clasificacion_recubrimiento VARCHAR(100) NOT NULL DEFAULT 'epoxi_poliamida',
    grado_corrosion VARCHAR(20) NOT NULL DEFAULT 'Ri 3', -- ISO 4628 / ASTM D610
    requiere_reemplazo BOOLEAN NOT NULL DEFAULT false,
    porcentaje_afectado NUMERIC(5, 2) NOT NULL DEFAULT 15.00 CHECK (porcentaje_afectado BETWEEN 0 AND 100),
    criticidad_calculada INT NOT NULL DEFAULT 3 CHECK (criticidad_calculada BETWEEN 1 AND 5),
    observaciones TEXT,
    diagnostico_ia JSONB DEFAULT NULL,
    validado_por_ingeniero_id UUID REFERENCES auth.users(id),
    fecha_validacion TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 9. FOTOGRAFÍAS CON ANOTACIONES VECTORIALES Y MINIATURAS
CREATE TABLE IF NOT EXISTS public.fotos_inspeccion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspeccion_id UUID NOT NULL REFERENCES public.inspecciones(id) ON DELETE CASCADE,
    storage_url TEXT NOT NULL,
    thumbnail_url TEXT,
    peso_bytes BIGINT NOT NULL DEFAULT 0,
    anotaciones_canvas JSONB DEFAULT '[]'::jsonb, -- Coordenadas vectoriales de Konva
    analisis_ia JSONB DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 10. PARÁMETROS GLOBALES DE CUBICACIÓN Y COSTOS
CREATE TABLE IF NOT EXISTS public.parametros_cubicacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    categoria VARCHAR(100) NOT NULL, -- 'rendimientos', 'pintura', 'acero', 'andamios'
    clave VARCHAR(100) NOT NULL UNIQUE,
    valor_numerico NUMERIC(12, 4) NOT NULL,
    unidad VARCHAR(50) NOT NULL,
    descripcion TEXT,
    actualizado_por UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 11. CAMPAÑAS Y PAQUETES DE INTERVENCIÓN
CREATE TABLE IF NOT EXISTS public.campanas_y_paquetes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(255) NOT NULL,
    anio_ejecucion INT NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    requiere_parada_planta BOOLEAN NOT NULL DEFAULT false,
    zona_id UUID REFERENCES public.zonas_inspeccion(id),
    costo_andamio_estimado NUMERIC(14, 2) DEFAULT 0.00,
    estado VARCHAR(50) NOT NULL DEFAULT 'planificada' CHECK (estado IN ('borrador', 'planificada', 'aprobada', 'en_ejecucion', 'cerrada')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 12. INTERVENCIONES CUBICADAS (Output del Motor de Cálculo)
CREATE TABLE IF NOT EXISTS public.intervenciones_cubicadas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspeccion_id UUID NOT NULL REFERENCES public.inspecciones(id) ON DELETE CASCADE,
    campana_id UUID REFERENCES public.campanas_y_paquetes(id) ON DELETE SET NULL,
    m2_pintura NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    kg_acero_reemplazo NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    ml_barandas NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    m2_rejillas NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    hh_estimadas NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    costo_materiales NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    costo_mano_obra NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    nivel_confiabilidad VARCHAR(50) NOT NULL DEFAULT 'alta' CHECK (nivel_confiabilidad IN ('alta', 'media', 'estimada_preliminar')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 13. AUDITORÍA DE CAMBIOS
CREATE TABLE IF NOT EXISTS public.auditoria_cambios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID REFERENCES auth.users(id),
    tabla VARCHAR(100) NOT NULL,
    registro_id UUID NOT NULL,
    accion VARCHAR(20) NOT NULL CHECK (accion IN ('INSERT', 'UPDATE', 'DELETE')),
    valores_anteriores JSONB,
    valores_nuevos JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 14. MÉTRICAS DE INFRAESTRUCTURA (TELEMETRÍA HISTÓRICA)
CREATE TABLE IF NOT EXISTS public.metricas_infra_snapshot (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    db_bytes BIGINT NOT NULL DEFAULT 0,
    storage_bytes BIGINT NOT NULL DEFAULT 0,
    egress_estimado_bytes BIGINT NOT NULL DEFAULT 0,
    render_web_ram_mb NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    render_api_ram_mb NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 15. CONFIGURACIÓN DINÁMICA DE LÍMITES
CREATE TABLE IF NOT EXISTS public.configuracion_limites_infra (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clave VARCHAR(100) NOT NULL UNIQUE,
    valor_limite BIGINT NOT NULL,
    unidad VARCHAR(20) NOT NULL,
    descripcion TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 16. RPC TELEMETRÍA: get_supabase_usage()
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_supabase_usage()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
    v_db_size BIGINT;
    v_storage_total BIGINT := 0;
    v_buckets JSONB := '[]'::jsonb;
    v_result JSONB;
BEGIN
    -- 1. Medir tamaño físico de la BD PostgreSQL
    SELECT pg_database_size(current_database()) INTO v_db_size;

    -- 2. Medir Storage de Supabase agrupado por bucket (si existe schema storage)
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'storage' AND table_name = 'objects'
    ) THEN
        SELECT 
            COALESCE(SUM((metadata->>'size')::bigint), 0),
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'bucket_id', bucket_id,
                        'total_bytes', COALESCE(SUM((metadata->>'size')::bigint), 0),
                        'total_archivos', COUNT(*)
                    )
                ), 
                '[]'::jsonb
            )
        INTO v_storage_total, v_buckets
        FROM storage.objects
        GROUP BY bucket_id;
    END IF;

    -- 3. Compilar resultado JSON
    v_result := jsonb_build_object(
        'db_size_bytes', COALESCE(v_db_size, 0),
        'storage_size_bytes', COALESCE(v_storage_total, 0),
        'buckets', COALESCE(v_buckets, '[]'::jsonb),
        'timestamp', timezone('utc'::text, now())
    );

    RETURN v_result;
END;
$$;

-- ==============================================================================
-- 17. TRIGGER DE AUDITORÍA AUTOMÁTICA
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.trigger_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    BEGIN
        v_user_id := auth.uid();
    EXCEPTION WHEN OTHERS THEN
        v_user_id := NULL;
    END;

    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO public.auditoria_cambios(usuario_id, tabla, registro_id, accion, valores_anteriores, valores_nuevos)
        VALUES (v_user_id, TG_TABLE_NAME::text, NEW.id, TG_OP, to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO public.auditoria_cambios(usuario_id, tabla, registro_id, accion, valores_anteriores, valores_nuevos)
        VALUES (v_user_id, TG_TABLE_NAME::text, OLD.id, TG_OP, to_jsonb(OLD), NULL);
        RETURN OLD;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO public.auditoria_cambios(usuario_id, tabla, registro_id, accion, valores_anteriores, valores_nuevos)
        VALUES (v_user_id, TG_TABLE_NAME::text, NEW.id, TG_OP, NULL, to_jsonb(NEW));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$;

-- Auditoría sobre parámetros y cambios críticos en inspecciones
DROP TRIGGER IF EXISTS trg_audit_parametros ON public.parametros_cubicacion;
CREATE TRIGGER trg_audit_parametros
AFTER INSERT OR UPDATE OR DELETE ON public.parametros_cubicacion
FOR EACH ROW EXECUTE FUNCTION public.trigger_audit_log();

DROP TRIGGER IF EXISTS trg_audit_inspecciones ON public.inspecciones;
CREATE TRIGGER trg_audit_inspecciones
AFTER INSERT OR UPDATE OR DELETE ON public.inspecciones
FOR EACH ROW EXECUTE FUNCTION public.trigger_audit_log();

-- ==============================================================================
-- 18. POLÍTICAS ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE public.usuarios_perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zonas_inspeccion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elementos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspecciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fotos_inspeccion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parametros_cubicacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campanas_y_paquetes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intervenciones_cubicadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_cambios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metricas_infra_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracion_limites_infra ENABLE ROW LEVEL SECURITY;

-- Helper función rol usuario
CREATE OR REPLACE FUNCTION public.get_current_role()
RETURNS user_role_type
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        (SELECT rol FROM public.usuarios_perfiles WHERE id = auth.uid() AND activo = true),
        'consulta'::user_role_type
    );
$$;

-- Políticas de lectura (todos los usuarios autenticados con rol activo pueden leer datos maestros)
CREATE POLICY "Permitir lectura general a usuarios autenticados"
ON public.areas FOR SELECT TO authenticated USING (true);

CREATE POLICY "Permitir lectura planos a autenticados"
ON public.planos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Permitir lectura zonas a autenticados"
ON public.zonas_inspeccion FOR SELECT TO authenticated USING (true);

CREATE POLICY "Permitir lectura elementos a autenticados"
ON public.elementos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Permitir lectura inspecciones a autenticados"
ON public.inspecciones FOR SELECT TO authenticated USING (true);

CREATE POLICY "Permitir lectura fotos a autenticados"
ON public.fotos_inspeccion FOR SELECT TO authenticated USING (true);

CREATE POLICY "Permitir lectura parametros a autenticados"
ON public.parametros_cubicacion FOR SELECT TO authenticated USING (true);

-- Inspector puede insertar y actualizar inspecciones y fotos
CREATE POLICY "Inspector puede crear inspecciones"
ON public.inspecciones FOR INSERT TO authenticated
WITH CHECK (public.get_current_role() IN ('inspector', 'ingeniero', 'admin'));

CREATE POLICY "Inspector puede subir fotos"
ON public.fotos_inspeccion FOR INSERT TO authenticated
WITH CHECK (public.get_current_role() IN ('inspector', 'ingeniero', 'admin'));

-- Ingeniero y Admin pueden validar y modificar planos, parámetros y cubicaciones
CREATE POLICY "Ingeniero y Admin gestionan planos"
ON public.planos FOR ALL TO authenticated
USING (public.get_current_role() IN ('ingeniero', 'admin'))
WITH CHECK (public.get_current_role() IN ('ingeniero', 'admin'));

CREATE POLICY "Ingeniero y Admin gestionan zonas"
ON public.zonas_inspeccion FOR ALL TO authenticated
USING (public.get_current_role() IN ('ingeniero', 'admin'))
WITH CHECK (public.get_current_role() IN ('ingeniero', 'admin'));

CREATE POLICY "Ingeniero y Admin gestionan parametros"
ON public.parametros_cubicacion FOR ALL TO authenticated
USING (public.get_current_role() IN ('ingeniero', 'admin'))
WITH CHECK (public.get_current_role() IN ('ingeniero', 'admin'));

-- Admin exclusivo para auditoria y limites infra
CREATE POLICY "Solo admin gestiona limites y ve auditoria"
ON public.configuracion_limites_infra FOR ALL TO authenticated
USING (public.get_current_role() = 'admin')
WITH CHECK (public.get_current_role() = 'admin');

CREATE POLICY "Admin ve auditoria"
ON public.auditoria_cambios FOR SELECT TO authenticated
USING (public.get_current_role() = 'admin');

-- ==============================================================================
-- 19. SEMILLAS INICIALES (Límites por defecto & Catálogos base)
-- ==============================================================================
INSERT INTO public.configuracion_limites_infra (clave, valor_limite, unidad, descripcion) VALUES
('supabase_db_bytes', 524288000, 'bytes', 'Límite Supabase DB Free Tier (500 MB)'),
('supabase_storage_bytes', 1073741824, 'bytes', 'Límite Supabase Storage Free Tier (1 GB)'),
('supabase_egress_bytes_mes', 5368709120, 'bytes', 'Límite Transferencia Supabase Egress (5 GB/mes)'),
('render_web_ram_mb', 512, 'MB', 'Límite RAM Render Web Service Free Tier (512 MB)'),
('render_api_ram_mb', 512, 'MB', 'Límite RAM Render API Service Free Tier (512 MB)')
ON CONFLICT (clave) DO NOTHING;

INSERT INTO public.parametros_cubicacion (categoria, clave, valor_numerico, unidad, descripcion) VALUES
('rendimientos', 'hh_por_m2_pintura_epoxi', 0.4500, 'HH/m2', 'Horas-Hombre por m2 de limpieza mecánica St2 y pintura epoxi'),
('rendimientos', 'hh_por_kg_acero_reemplazo', 0.1200, 'HH/kg', 'Horas-Hombre de calderería, corte y montaje de acero'),
('costos', 'costo_hh_oficial_montador', 28.5000, 'USD/HH', 'Tarifa horaria cuadrilla de montaje industrial'),
('costos', 'costo_m2_sistema_epoxi_poliuretano', 18.2000, 'USD/m2', 'Costo de insumos y consumibles de pintura de alta resistencia'),
('costos', 'costo_kg_acero_perfileria', 3.4000, 'USD/kg', 'Costo de provisión de perfil laminado estructural'),
('andamios', 'costo_m3_andamio_mes', 12.0000, 'USD/m3', 'Costo de alquiler y armado de andamio multidireccional por m3')
ON CONFLICT (clave) DO NOTHING;

-- Áreas iniciales de planta
INSERT INTO public.areas (codigo, nombre, ubicacion_tecnica_erp, descripcion) VALUES
('131', 'Efluentes y Tratamiento', 'PLT-131-EFLU', 'Área de piletas de neutralización, bombas de lodos y torres de enfriamiento'),
('411', 'Blanqueo y Reactivos', 'PLT-411-BLAN', 'Torres de dióxido de cloro, digestor y cañerías de reactivos químicos'),
('471', 'Caustificación y Cal', 'PLT-471-CAUS', 'Clarificadores de licor verde/blanco, hornos de cal y tolvas de transporte')
ON CONFLICT (codigo) DO NOTHING;
