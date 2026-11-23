import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';
import { uploadToB2 } from '@/lib/b2';
import { getSessionFromRequest } from '@/lib/auth';
import {
  isValidEntityId,
  sanitizeSvgContent,
  validateBase64DataUrl
} from '@/lib/security';
import { Area, Plano, ZonaInspeccion, Elemento, Inspeccion, HitoGeografico, ParametroCubicacion } from '@/types';

export const dynamic = 'force-dynamic';

const MAX_PLAN_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB máx por plano
const MAX_PHOTO_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB máx por foto WebP
const ALLOWED_PLAN_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
const ALLOWED_PHOTO_MIMES = ['image/webp', 'image/jpeg', 'image/png'];

function verifySyncAuthorization(req: NextRequest, isMutation: boolean): NextResponse | null {
  const configuredToken = process.env.SYNC_API_TOKEN || process.env.NEXT_PUBLIC_SYNC_API_TOKEN;
  if (configuredToken) {
    const headerToken =
      req.headers.get('x-sync-token') ||
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (headerToken !== configuredToken) {
      return NextResponse.json(
        { success: false, error: 'No autorizado: token de sincronización inválido o ausente.' },
        { status: 401 }
      );
    }
  }

  if (isMutation) {
    const requestedWith = req.headers.get('x-requested-with');
    const origin = req.headers.get('origin');
    const host = req.headers.get('host');
    const isSameOrigin = origin && host ? origin.includes(host) : false;

    if (requestedWith !== 'industrial-maintenance-pwa' && !isSameOrigin) {
      return NextResponse.json(
        { success: false, error: 'Petición rechazada por protección CSRF / origen no autorizado.' },
        { status: 403 }
      );
    }
  }

  return null;
}

let schemaEnsured = false;

async function ensureExtendedSchema() {
  if (schemaEnsured) return;
  try {
    await sql`ALTER TABLE public.planos ADD COLUMN IF NOT EXISTS georeferencia JSONB DEFAULT NULL`;
    await sql`ALTER TABLE public.zonas_inspeccion ADD COLUMN IF NOT EXISTS area_planta VARCHAR(120) DEFAULT NULL`;
    await sql`ALTER TABLE public.zonas_inspeccion ADD COLUMN IF NOT EXISTS coordenadas_gps_override JSONB DEFAULT NULL`;
    await sql`ALTER TABLE public.elementos ADD COLUMN IF NOT EXISTS coordenadas_gps JSONB DEFAULT NULL`;
    await sql`ALTER TABLE public.inspecciones ADD COLUMN IF NOT EXISTS zona_id VARCHAR(100) DEFAULT NULL`;
    await sql`ALTER TABLE public.inspecciones ADD COLUMN IF NOT EXISTS zona_codigo VARCHAR(100) DEFAULT NULL`;
    await sql`ALTER TABLE public.inspecciones ADD COLUMN IF NOT EXISTS fotos_json JSONB DEFAULT '[]'::jsonb`;
    await sql`ALTER TABLE public.inspecciones ADD COLUMN IF NOT EXISTS coordenadas_gps JSONB DEFAULT NULL`;
    await sql`ALTER TABLE public.inspecciones ADD COLUMN IF NOT EXISTS historial_recorrido_gps JSONB DEFAULT '[]'::jsonb`;
    await sql`ALTER TABLE public.inspecciones ADD COLUMN IF NOT EXISTS evaluacion_civil JSONB DEFAULT NULL`;
    await sql`ALTER TABLE public.inspecciones ADD COLUMN IF NOT EXISTS inspector_nombre VARCHAR(120) DEFAULT NULL`;
    await sql`ALTER TABLE public.inspecciones ADD COLUMN IF NOT EXISTS muestreo_tramo JSONB DEFAULT NULL`;
    await sql`ALTER TABLE public.inspecciones ADD COLUMN IF NOT EXISTS antiguedad_anios INT DEFAULT NULL`;
    await sql`ALTER TABLE public.inspecciones ADD COLUMN IF NOT EXISTS ultimo_revestimiento_anios INT DEFAULT NULL`;
    await sql`ALTER TABLE public.inspecciones ADD COLUMN IF NOT EXISTS tasa_avance_anual_pct NUMERIC(6, 2) DEFAULT NULL`;
    await sql`ALTER TABLE public.inspecciones ADD COLUMN IF NOT EXISTS meses_ventana_intervencion INT DEFAULT NULL`;
    await sql`ALTER TABLE public.elementos ALTER COLUMN tipo_elemento TYPE VARCHAR(80) USING tipo_elemento::text`;
    await sql`ALTER TABLE public.inspecciones ALTER COLUMN elemento_id DROP NOT NULL`;
    await sql`ALTER TABLE public.inspecciones DROP CONSTRAINT IF EXISTS inspecciones_elemento_id_fkey`;
    await sql`ALTER TABLE public.zonas_inspeccion DROP CONSTRAINT IF EXISTS uq_plano_zona`;
    await sql`ALTER TABLE public.elementos DROP CONSTRAINT IF EXISTS uq_zona_tag`;
    await sql`ALTER TABLE public.elementos DROP CONSTRAINT IF EXISTS elementos_zona_id_fkey`;
    await sql`ALTER TABLE public.areas DROP CONSTRAINT IF EXISTS areas_codigo_key`;

    await sql`
      CREATE TABLE IF NOT EXISTS public.hitos_geograficos (
        id VARCHAR(100) PRIMARY KEY,
        codigo VARCHAR(100) NOT NULL,
        nombre VARCHAR(255) NOT NULL,
        tipo VARCHAR(50) NOT NULL DEFAULT 'referencia_general',
        lat NUMERIC(12, 7) NOT NULL,
        lng NUMERIC(12, 7) NOT NULL,
        cota_snm NUMERIC(10, 2) DEFAULT 146000,
        descripcion TEXT,
        plano_id VARCHAR(100),
        coordenadas_plano JSONB DEFAULT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS public.parametros_cubicacion (
        clave VARCHAR(100) PRIMARY KEY,
        id VARCHAR(100) NOT NULL,
        categoria VARCHAR(80) NOT NULL,
        valor_numerico NUMERIC(12, 4) NOT NULL,
        unidad VARCHAR(40) NOT NULL,
        descripcion TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
      )
    `;
  } catch (ddlErr) {
    // Si el rol de base de datos es de privilegio mínimo (solo DML), continuar usando el esquema existente
    console.warn('Aviso: omitiendo auto-migración DDL en runtime:', ddlErr);
  }
  schemaEnsured = true;
}

export async function GET(req: NextRequest) {
  const authError = verifySyncAuthorization(req, false);
  if (authError) return authError;

  try {
    await ensureExtendedSchema();
    const mode = req.nextUrl.searchParams.get('mode');
    const isLight = req.nextUrl.searchParams.get('light') === '1';

    // MODO MANIFEST (~500 bytes): Consulta ultra-liviana para comparar Caché Local vs. Nube cada 7s
    // sin transferir megabytes de planos CAD, SVGs ni fotografías base64.
    if (mode === 'manifest') {
      const areas = await sql`SELECT id, codigo, nombre FROM public.areas ORDER BY codigo`;
      const planos = await sql`
        SELECT id, area_id, titulo, version, tipo_plano,
               (archivo_original_url IS NOT NULL) AS has_b2_url,
               (svg_content IS NOT NULL OR archivo_data_url IS NOT NULL OR archivo_original_url IS NOT NULL) AS has_image,
               COALESCE(LENGTH(svg_content), LENGTH(archivo_data_url), 0) AS payload_bytes,
               georeferencia
        FROM public.planos
        ORDER BY created_at DESC
      `;
      const zonas = await sql`
        SELECT id, plano_id, area_planta, codigo, nombre, cota_nivel, estado_salud_apriori, superficie_estimada_m2
        FROM public.zonas_inspeccion
        ORDER BY codigo
      `;
      const elementos = await sql`
        SELECT id, zona_id, tag_codigo, tipo_elemento, estado_actual
        FROM public.elementos
        ORDER BY tag_codigo
      `;
      const hitos = await sql`
        SELECT id, codigo, nombre, lat, lng
        FROM public.hitos_geograficos
        ORDER BY created_at DESC
      `;
      const inspecciones = await sql`
        SELECT id, zona_id, zona_codigo, elemento_id, grado_corrosion, fecha_inspeccion,
               jsonb_array_length(COALESCE(fotos_json, '[]'::jsonb)) AS fotos_count
        FROM public.inspecciones
        ORDER BY fecha_inspeccion DESC
      `;

      const totalFotosCloud = inspecciones.reduce(
        (acc: number, row: any) => acc + Number(row.fotos_count || 0),
        0
      );

      return NextResponse.json({
        success: true,
        mode: 'manifest',
        timestamp: new Date().toISOString(),
        manifest: {
          areas,
          planos,
          zonas,
          elementos,
          hitos,
          inspecciones,
          counts: {
            areas: areas.length,
            planos: planos.length,
            zonas: zonas.length,
            elementos: elementos.length,
            hitos: hitos.length,
            inspecciones: inspecciones.length,
            fotos: totalFotosCloud
          }
        }
      });
    }

    const areas = await sql`SELECT * FROM public.areas ORDER BY codigo`;
    const planos = isLight
      ? await sql`
          SELECT id, area_id, titulo, archivo_original_url, svg_url, rotacion, tipo_plano,
                 dimensiones_viewbox, georeferencia, version, activo, created_at
          FROM public.planos
          ORDER BY created_at DESC
        `
      : await sql`SELECT * FROM public.planos ORDER BY created_at DESC`;

    const zonas = await sql`SELECT * FROM public.zonas_inspeccion ORDER BY codigo`;
    const elementos = await sql`SELECT * FROM public.elementos ORDER BY tag_codigo`;
    const hitos = await sql`SELECT * FROM public.hitos_geograficos ORDER BY created_at DESC`;
    const rawInspecciones = await sql`SELECT * FROM public.inspecciones ORDER BY fecha_inspeccion DESC`;
    const parametros = await sql`SELECT * FROM public.parametros_cubicacion ORDER BY categoria, clave`;

    const inspecciones = rawInspecciones.map((row: any) => ({
      ...row,
      porcentaje_afectado: row.porcentaje_afectado !== null && row.porcentaje_afectado !== undefined ? Number(row.porcentaje_afectado) : 0,
      tasa_avance_anual_pct: row.tasa_avance_anual_pct !== null && row.tasa_avance_anual_pct !== undefined ? Number(row.tasa_avance_anual_pct) : undefined,
      fotos: Array.isArray(row.fotos_json) ? row.fotos_json : []
    }));

    return NextResponse.json({
      success: true,
      light: isLight,
      data: {
        areas,
        planos: planos.map((p: any) => ({
          ...p,
          svg_content: p.svg_content ? sanitizeSvgContent(p.svg_content) : p.svg_content
        })),
        zonas,
        elementos,
        hitos: hitos.map((h: any) => ({
          ...h,
          lat: Number(h.lat),
          lng: Number(h.lng),
          cota_snm: h.cota_snm ? Number(h.cota_snm) : 146000
        })),
        inspecciones,
        parametros: parametros.map((p: any) => ({
          ...p,
          valor_numerico: Number(p.valor_numerico)
        })),
        elementosCount: elementos.length,
        inspeccionesCount: inspecciones.length,
      }
    });
  } catch (err: any) {
    console.error('Error fetching Neon data:', err);
    return NextResponse.json({ success: false, error: 'Error al consultar datos de sincronización en servidor.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const authError = verifySyncAuthorization(req, true);
  if (authError) return authError;

  try {
    await ensureExtendedSchema();
    const body = await req.json();
    const { type, id } = body;

    if (!type || !isValidEntityId(id)) {
      return NextResponse.json({ success: false, error: 'Parámetros type o id inválidos' }, { status: 400 });
    }

    const session = await getSessionFromRequest(req);
    if (session?.rol === 'inspector' && type !== 'elemento') {
      return NextResponse.json(
        { success: false, error: 'Permiso insuficiente: solo Ingeniería/Admin puede eliminar zonas, planos o hitos.' },
        { status: 403 }
      );
    }

    if (type === 'zona') {
      await sql`DELETE FROM public.elementos WHERE zona_id = ${id}`;
      await sql`DELETE FROM public.zonas_inspeccion WHERE id = ${id}`;
    } else if (type === 'elemento') {
      await sql`DELETE FROM public.elementos WHERE id = ${id}`;
    } else if (type === 'hito') {
      await sql`DELETE FROM public.hitos_geograficos WHERE id = ${id}`;
    } else if (type === 'plano') {
      await sql`DELETE FROM public.planos WHERE id = ${id}`;
    } else if (type === 'area') {
      await sql`DELETE FROM public.areas WHERE id = ${id}`;
    } else {
      return NextResponse.json({ success: false, error: 'Tipo de entidad no soportado' }, { status: 400 });
    }

    return NextResponse.json({ success: true, deleted: { type, id } });
  } catch (err: any) {
    console.error('Error deleting in Neon:', err);
    return NextResponse.json({ success: false, error: 'Error al eliminar el registro en servidor.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authError = verifySyncAuthorization(req, true);
  if (authError) return authError;

  try {
    await ensureExtendedSchema();

    const body = await req.json();
    const {
      areas = [],
      planos = [],
      zonas = [],
      elementos = [],
      hitos = [],
      inspecciones = [],
      parametros = [],
      authoritativeZonas = false,
      authoritativeHitos = false
    }: {
      areas?: Area[];
      planos?: Plano[];
      zonas?: ZonaInspeccion[];
      elementos?: Elemento[];
      hitos?: HitoGeografico[];
      inspecciones?: Inspeccion[];
      parametros?: ParametroCubicacion[];
      authoritativeZonas?: boolean;
      authoritativeHitos?: boolean;
    } = body;

    let b2UploadsCount = 0;

    // RBAC: Un inspector de campo no puede ejecutar sincronizaciones destructivas de zonas o hitos maestros
    const session = await getSessionFromRequest(req);
    if (session?.rol === 'inspector' && (authoritativeZonas || authoritativeHitos)) {
      return NextResponse.json(
        { success: false, error: 'Permiso insuficiente: solo Ingeniería/Admin puede sobrescribir zonas o hitos maestros.' },
        { status: 403 }
      );
    }

    // 1. Áreas
    for (const a of areas) {
      if (!isValidEntityId(a.id)) continue;
      await sql`
        INSERT INTO public.areas (id, codigo, nombre, ubicacion_tecnica_erp, descripcion)
        VALUES (${a.id}, ${a.codigo}, ${a.nombre}, ${a.ubicacion_tecnica_erp || null}, ${a.descripcion || null})
        ON CONFLICT (id) DO UPDATE SET
          codigo = EXCLUDED.codigo,
          nombre = EXCLUDED.nombre,
          ubicacion_tecnica_erp = EXCLUDED.ubicacion_tecnica_erp,
          descripcion = EXCLUDED.descripcion,
          updated_at = now()
      `;
    }

    // 2. Planos (Solo sube imagen a B2 si aún no tiene archivo_original_url en B2, validando ID, MIME y tamaño)
    for (const p of planos) {
      if (!isValidEntityId(p.id)) continue;
      let b2Url = p.archivo_original_url || null;

      if (!b2Url && p.archivo_data_url && p.archivo_data_url.startsWith('data:')) {
        try {
          const validated = validateBase64DataUrl(p.archivo_data_url, ALLOWED_PLAN_MIMES, MAX_PLAN_UPLOAD_BYTES);
          if (validated.valid) {
            const ext = validated.mimeType.includes('pdf')
              ? 'pdf'
              : validated.mimeType.includes('jpeg')
              ? 'jpg'
              : validated.mimeType.includes('webp')
              ? 'webp'
              : 'png';
            const key = `planos/${p.id}.${ext}`;

            b2Url = await uploadToB2(key, validated.buffer, validated.mimeType);
            b2UploadsCount++;
          } else {
            console.warn(`Archivo de plano ${p.id} rechazado por validación de seguridad:`, validated.error);
          }
        } catch (uploadErr) {
          console.warn(`Error subiendo archivo de plano ${p.id} a B2:`, uploadErr);
        }
      }

      const safeSvgContent = p.svg_content ? sanitizeSvgContent(p.svg_content) : null;
      // Si la imagen del plano ya está respaldada en Backblaze B2, no duplicar megabytes en Neon
      const storedDataUrl = b2Url ? null : (p.archivo_data_url || null);

      await sql`
        INSERT INTO public.planos (
          id, area_id, titulo, archivo_original_url, svg_content, archivo_data_url,
          rotacion, tipo_plano, dimensiones_viewbox, georeferencia, version, activo
        )
        VALUES (
          ${p.id},
          ${p.area_id},
          ${p.titulo},
          ${b2Url},
          ${safeSvgContent},
          ${storedDataUrl},
          ${p.rotacion || 0},
          ${p.tipo_plano || 'area_detalle'},
          ${JSON.stringify(p.dimensiones_viewbox || { width: 1600, height: 900 })},
          ${p.georeferencia ? JSON.stringify(p.georeferencia) : null},
          ${p.version || 1},
          ${p.activo !== false}
        )
        ON CONFLICT (id) DO UPDATE SET
          titulo = EXCLUDED.titulo,
          archivo_original_url = COALESCE(EXCLUDED.archivo_original_url, public.planos.archivo_original_url),
          svg_content = COALESCE(EXCLUDED.svg_content, public.planos.svg_content),
          archivo_data_url = COALESCE(EXCLUDED.archivo_data_url, public.planos.archivo_data_url),
          rotacion = EXCLUDED.rotacion,
          tipo_plano = EXCLUDED.tipo_plano,
          dimensiones_viewbox = EXCLUDED.dimensiones_viewbox,
          georeferencia = COALESCE(EXCLUDED.georeferencia, public.planos.georeferencia),
          version = EXCLUDED.version,
          activo = EXCLUDED.activo
      `;
    }

    // 3. Zonas (Protegido contra borrado masivo accidental cuando zonas viene vacío desde un cliente sin hidratar)
    if (authoritativeZonas && zonas.length > 0) {
      const currentNeonZonas = await sql`SELECT id FROM public.zonas_inspeccion`;
      const incomingIds = new Set(zonas.map(z => z.id));
      for (const row of currentNeonZonas) {
        if (!incomingIds.has(row.id)) {
          await sql`DELETE FROM public.zonas_inspeccion WHERE id = ${row.id}`;
        }
      }
    }

    for (const z of zonas) {
      if (!isValidEntityId(z.id)) continue;
      await sql`
        INSERT INTO public.zonas_inspeccion (
          id, plano_id, area_planta, codigo, nombre, cota_nivel, nombre_nivel,
          disciplinas_involucradas, estado_salud_apriori, superficie_estimada_m2,
          poligono_svg, nivel_acceso_andamio, coordenadas_gps_override
        )
        VALUES (
          ${z.id},
          ${z.plano_id},
          ${z.area_planta || null},
          ${z.codigo},
          ${z.nombre},
          ${z.cota_nivel || 146000},
          ${z.nombre_nivel || null},
          ${z.disciplinas_involucradas || []},
          ${z.estado_salud_apriori || 'regular'},
          ${z.superficie_estimada_m2 || 0},
          ${JSON.stringify(z.poligono_svg || { puntos: [] })},
          ${JSON.stringify(z.nivel_acceso_andamio || {})},
          ${z.coordenadas_gps_override ? JSON.stringify(z.coordenadas_gps_override) : null}
        )
        ON CONFLICT (id) DO UPDATE SET
          area_planta = COALESCE(EXCLUDED.area_planta, public.zonas_inspeccion.area_planta),
          codigo = EXCLUDED.codigo,
          nombre = EXCLUDED.nombre,
          cota_nivel = EXCLUDED.cota_nivel,
          nombre_nivel = EXCLUDED.nombre_nivel,
          disciplinas_involucradas = EXCLUDED.disciplinas_involucradas,
          estado_salud_apriori = EXCLUDED.estado_salud_apriori,
          superficie_estimada_m2 = EXCLUDED.superficie_estimada_m2,
          poligono_svg = EXCLUDED.poligono_svg,
          nivel_acceso_andamio = EXCLUDED.nivel_acceso_andamio,
          coordenadas_gps_override = COALESCE(EXCLUDED.coordenadas_gps_override, public.zonas_inspeccion.coordenadas_gps_override)
      `;
    }

    // 4. Elementos
    for (const e of elementos) {
      if (!isValidEntityId(e.id)) continue;
      const cleanTipo = String(e.tipo_elemento || 'acero_estructural').trim().slice(0, 80) || 'acero_estructural';

      await sql`
        INSERT INTO public.elementos (
          id, zona_id, tag_codigo, codigo_equipo_erp, qr_token,
          tipo_elemento, coordenadas_pin, geometria_parametros,
          criticidad_activo, estado_actual, coordenadas_gps
        )
        VALUES (
          ${e.id},
          ${e.zona_id},
          ${e.tag_codigo},
          ${e.codigo_equipo_erp || null},
          ${e.qr_token || `QR-${e.id}`},
          ${cleanTipo},
          ${JSON.stringify(e.coordenadas_pin || { x: 0, y: 0 })},
          ${JSON.stringify(e.geometria_parametros || {})},
          ${e.criticidad_activo || 3},
          ${e.estado_actual || 'gris'},
          ${e.coordenadas_gps ? JSON.stringify(e.coordenadas_gps) : null}
        )
        ON CONFLICT (id) DO UPDATE SET
          tag_codigo = EXCLUDED.tag_codigo,
          codigo_equipo_erp = EXCLUDED.codigo_equipo_erp,
          coordenadas_pin = EXCLUDED.coordenadas_pin,
          geometria_parametros = EXCLUDED.geometria_parametros,
          criticidad_activo = EXCLUDED.criticidad_activo,
          estado_actual = EXCLUDED.estado_actual,
          coordenadas_gps = COALESCE(EXCLUDED.coordenadas_gps, public.elementos.coordenadas_gps),
          updated_at = now()
      `;
    }

    // 5. Hitos Geográficos (GPS) (Protegido contra borrado masivo accidental cuando hitos viene vacío)
    if (authoritativeHitos && hitos.length > 0) {
      const currentNeonHitos = await sql`SELECT id FROM public.hitos_geograficos`;
      const incomingHitoIds = new Set(hitos.map(h => h.id));
      for (const row of currentNeonHitos) {
        if (!incomingHitoIds.has(row.id)) {
          await sql`DELETE FROM public.hitos_geograficos WHERE id = ${row.id}`;
        }
      }
    }

    for (const h of hitos) {
      if (!isValidEntityId(h.id)) continue;
      await sql`
        INSERT INTO public.hitos_geograficos (
          id, codigo, nombre, tipo, lat, lng, cota_snm, descripcion, plano_id, coordenadas_plano
        )
        VALUES (
          ${h.id},
          ${h.codigo},
          ${h.nombre},
          ${h.tipo || 'referencia_general'},
          ${h.lat},
          ${h.lng},
          ${h.cota_snm || 146000},
          ${h.descripcion || null},
          ${h.plano_id || null},
          ${h.coordenadas_plano ? JSON.stringify(h.coordenadas_plano) : null}
        )
        ON CONFLICT (id) DO UPDATE SET
          codigo = EXCLUDED.codigo,
          nombre = EXCLUDED.nombre,
          tipo = EXCLUDED.tipo,
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          cota_snm = EXCLUDED.cota_snm,
          descripcion = EXCLUDED.descripcion,
          coordenadas_plano = EXCLUDED.coordenadas_plano
      `;
    }

    // 6. Inspecciones y Galería Multi-Foto en Backblaze B2
    for (const insp of inspecciones) {
      if (!isValidEntityId(insp.id)) continue;
      const processedFotos = [];
      if (Array.isArray(insp.fotos)) {
        const maxPhotosPerInsp = Math.min(insp.fotos.length, 30);
        for (let idx = 0; idx < maxPhotosPerInsp; idx++) {
          const f = insp.fotos[idx];
          let storageUrl = f.storage_url || null;
          if (!storageUrl && f.thumbnail_data_url && f.thumbnail_data_url.startsWith('data:')) {
            try {
              const validated = validateBase64DataUrl(f.thumbnail_data_url, ALLOWED_PHOTO_MIMES, MAX_PHOTO_UPLOAD_BYTES);
              if (validated.valid) {
                const key = `inspecciones/${insp.id}/foto_${idx + 1}.webp`;
                storageUrl = await uploadToB2(key, validated.buffer, validated.mimeType);
                b2UploadsCount++;
              } else {
                console.warn(`Foto #${idx + 1} de inspección ${insp.id} rechazada:`, validated.error);
              }
            } catch (e) {
              console.warn('Error subiendo foto de inspección a B2:', e);
            }
          }
          // Una vez confirmada la foto HD en Backblaze B2, en Neon guardamos solo la URL + micro-miniatura (~15 KB)
          const lightweightThumb = storageUrl
            ? (f.micro_thumbnail_data_url || (f.thumbnail_data_url && f.thumbnail_data_url.length < 35000 ? f.thumbnail_data_url : ''))
            : f.thumbnail_data_url;

          processedFotos.push({
            id: f.id || `foto_${idx + 1}`,
            storage_url: storageUrl,
            thumbnail_data_url: lightweightThumb,
            peso_bytes: f.peso_bytes || 0,
            comentario: f.comentario || '',
            anotaciones_canvas: f.anotaciones_canvas || []
          });
        }
      }

      await sql`
        INSERT INTO public.inspecciones (
          id, elemento_id, zona_id, zona_codigo, inspector_id, inspector_nombre, fecha_inspeccion,
          estado_sincronizacion, clasificacion_sustrato, clasificacion_recubrimiento,
          grado_corrosion, requiere_reemplazo, porcentaje_afectado,
          criticidad_calculada, antiguedad_anios, ultimo_revestimiento_anios,
          tasa_avance_anual_pct, meses_ventana_intervencion,
          observaciones, diagnostico_ia, fotos_json,
          coordenadas_gps, historial_recorrido_gps, evaluacion_civil, muestreo_tramo
        )
        VALUES (
          ${insp.id},
          ${insp.elemento_id || null},
          ${insp.zona_id || null},
          ${insp.zona_codigo || null},
          ${insp.inspector_id || null},
          ${insp.inspector_nombre || null},
          ${insp.fecha_inspeccion || new Date().toISOString()},
          'sincronizado',
          ${insp.clasificacion_sustrato || 'acero_al_carbono'},
          ${insp.clasificacion_recubrimiento || 'epoxi_poliamida'},
          ${insp.grado_corrosion || 'Ri 3'},
          ${insp.requiere_reemplazo || false},
          ${insp.porcentaje_afectado || 0},
          ${insp.criticidad_calculada || 3},
          ${insp.antiguedad_anios ?? null},
          ${insp.ultimo_revestimiento_anios ?? null},
          ${insp.tasa_avance_anual_pct ?? null},
          ${insp.meses_ventana_intervencion ?? null},
          ${insp.observaciones || null},
          ${insp.diagnostico_ia ? JSON.stringify(insp.diagnostico_ia) : null},
          ${JSON.stringify(processedFotos)},
          ${insp.coordenadas_gps ? JSON.stringify(insp.coordenadas_gps) : null},
          ${insp.historial_recorrido_gps ? JSON.stringify(insp.historial_recorrido_gps) : '[]'},
          ${insp.evaluacion_civil ? JSON.stringify(insp.evaluacion_civil) : null},
          ${insp.muestreo_tramo ? JSON.stringify(insp.muestreo_tramo) : null}
        )
        ON CONFLICT (id) DO UPDATE SET
          estado_sincronizacion = 'sincronizado',
          zona_id = COALESCE(EXCLUDED.zona_id, public.inspecciones.zona_id),
          zona_codigo = COALESCE(EXCLUDED.zona_codigo, public.inspecciones.zona_codigo),
          inspector_nombre = COALESCE(EXCLUDED.inspector_nombre, public.inspecciones.inspector_nombre),
          clasificacion_sustrato = EXCLUDED.clasificacion_sustrato,
          clasificacion_recubrimiento = EXCLUDED.clasificacion_recubrimiento,
          grado_corrosion = EXCLUDED.grado_corrosion,
          requiere_reemplazo = EXCLUDED.requiere_reemplazo,
          porcentaje_afectado = EXCLUDED.porcentaje_afectado,
          criticidad_calculada = EXCLUDED.criticidad_calculada,
          antiguedad_anios = COALESCE(EXCLUDED.antiguedad_anios, public.inspecciones.antiguedad_anios),
          ultimo_revestimiento_anios = COALESCE(EXCLUDED.ultimo_revestimiento_anios, public.inspecciones.ultimo_revestimiento_anios),
          tasa_avance_anual_pct = COALESCE(EXCLUDED.tasa_avance_anual_pct, public.inspecciones.tasa_avance_anual_pct),
          meses_ventana_intervencion = COALESCE(EXCLUDED.meses_ventana_intervencion, public.inspecciones.meses_ventana_intervencion),
          observaciones = EXCLUDED.observaciones,
          diagnostico_ia = EXCLUDED.diagnostico_ia,
          fotos_json = EXCLUDED.fotos_json,
          coordenadas_gps = COALESCE(EXCLUDED.coordenadas_gps, public.inspecciones.coordenadas_gps),
          historial_recorrido_gps = COALESCE(EXCLUDED.historial_recorrido_gps, public.inspecciones.historial_recorrido_gps),
          evaluacion_civil = COALESCE(EXCLUDED.evaluacion_civil, public.inspecciones.evaluacion_civil),
          muestreo_tramo = COALESCE(EXCLUDED.muestreo_tramo, public.inspecciones.muestreo_tramo)
      `;
    }

    // 7. Parámetros de Cubicación y Tarifas (Fuente única compartida)
    for (const prm of parametros) {
      if (!prm.clave) continue;
      await sql`
        INSERT INTO public.parametros_cubicacion (
          clave, id, categoria, valor_numerico, unidad, descripcion, updated_at
        )
        VALUES (
          ${prm.clave},
          ${prm.id || prm.clave},
          ${prm.categoria || 'general'},
          ${Number(prm.valor_numerico) || 0},
          ${prm.unidad || 'USD'},
          ${prm.descripcion || ''},
          now()
        )
        ON CONFLICT (clave) DO UPDATE SET
          valor_numerico = EXCLUDED.valor_numerico,
          unidad = EXCLUDED.unidad,
          descripcion = EXCLUDED.descripcion,
          updated_at = now()
      `;
    }

    return NextResponse.json({
      success: true,
      message: 'Sincronización rápida con Neon y Backblaze B2 completada.',
      synced: {
        areas: areas.length,
        planos: planos.length,
        zonas: zonas.length,
        elementos: elementos.length,
        hitos: hitos.length,
        inspecciones: inspecciones.length,
        b2Uploads: b2UploadsCount
      }
    });

  } catch (err: any) {
    console.error('Error in sync-neon endpoint:', err);
    return NextResponse.json({
      success: false,
      error: 'Error procesando sincronización en el servidor.'
    }, { status: 500 });
  }
}
