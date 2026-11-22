import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';
import { uploadToB2 } from '@/lib/b2';
import { Area, Plano, ZonaInspeccion, Elemento, Inspeccion, HitoGeografico } from '@/types';

export const dynamic = 'force-dynamic';

let schemaEnsured = false;

async function ensureExtendedSchema() {
  if (schemaEnsured) return;
  await sql`ALTER TABLE public.planos ADD COLUMN IF NOT EXISTS georeferencia JSONB DEFAULT NULL`;
  await sql`ALTER TABLE public.zonas_inspeccion ADD COLUMN IF NOT EXISTS coordenadas_gps_override JSONB DEFAULT NULL`;
  await sql`ALTER TABLE public.elementos ADD COLUMN IF NOT EXISTS coordenadas_gps JSONB DEFAULT NULL`;
  await sql`ALTER TABLE public.inspecciones ADD COLUMN IF NOT EXISTS zona_id VARCHAR(100) DEFAULT NULL`;
  await sql`ALTER TABLE public.inspecciones ADD COLUMN IF NOT EXISTS zona_codigo VARCHAR(100) DEFAULT NULL`;
  await sql`ALTER TABLE public.inspecciones ADD COLUMN IF NOT EXISTS fotos_json JSONB DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE public.inspecciones ALTER COLUMN elemento_id DROP NOT NULL`;
  await sql`ALTER TABLE public.inspecciones DROP CONSTRAINT IF EXISTS inspecciones_elemento_id_fkey`;

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
  schemaEnsured = true;
}

export async function GET(req: NextRequest) {
  try {
    await ensureExtendedSchema();
    const isLight = req.nextUrl.searchParams.get('light') === '1';

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

    const inspecciones = rawInspecciones.map((row: any) => ({
      ...row,
      fotos: Array.isArray(row.fotos_json) ? row.fotos_json : []
    }));

    return NextResponse.json({
      success: true,
      light: isLight,
      data: {
        areas,
        planos,
        zonas,
        elementos,
        hitos: hitos.map((h: any) => ({
          ...h,
          lat: Number(h.lat),
          lng: Number(h.lng),
          cota_snm: h.cota_snm ? Number(h.cota_snm) : 146000
        })),
        inspecciones,
        elementosCount: elementos.length,
        inspeccionesCount: inspecciones.length,
      }
    });
  } catch (err: any) {
    console.error('Error fetching Neon data:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Error en consulta Neon' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await ensureExtendedSchema();
    const body = await req.json();
    const { type, id } = body;

    if (!type || !id) {
      return NextResponse.json({ success: false, error: 'Falta type o id' }, { status: 400 });
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
    }

    return NextResponse.json({ success: true, deleted: { type, id } });
  } catch (err: any) {
    console.error('Error deleting in Neon:', err);
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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
      authoritativeZonas = false,
      authoritativeHitos = false
    }: {
      areas?: Area[];
      planos?: Plano[];
      zonas?: ZonaInspeccion[];
      elementos?: Elemento[];
      hitos?: HitoGeografico[];
      inspecciones?: Inspeccion[];
      authoritativeZonas?: boolean;
      authoritativeHitos?: boolean;
    } = body;

    let b2UploadsCount = 0;

    // 1. Áreas
    for (const a of areas) {
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

    // 2. Planos (Solo sube imagen a B2 si aún no tiene archivo_original_url en B2, evitando demoras en syncs frecuentes)
    for (const p of planos) {
      let b2Url = p.archivo_original_url || null;

      if (!b2Url && p.archivo_data_url && p.archivo_data_url.startsWith('data:')) {
        try {
          const match = p.archivo_data_url.match(/^data:(.*?);base64,(.*)$/);
          if (match) {
            const mimeType = match[1] || 'image/png';
            const base64Data = match[2];
            const buffer = Buffer.from(base64Data, 'base64');
            const ext = mimeType.includes('pdf') ? 'pdf' : (mimeType.includes('jpeg') ? 'jpg' : 'png');
            const key = `planos/${p.id}.${ext}`;

            b2Url = await uploadToB2(key, buffer, mimeType);
            b2UploadsCount++;
          }
        } catch (uploadErr) {
          console.warn(`Error subiendo archivo de plano ${p.id} a B2:`, uploadErr);
        }
      }

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
          ${p.svg_content || null},
          ${p.archivo_data_url || null},
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

    // 3. Zonas (Con reconciliación exacta: si authoritativeZonas === true, elimina en Neon las zonas borradas en PC)
    if (authoritativeZonas) {
      const currentNeonZonas = await sql`SELECT id FROM public.zonas_inspeccion`;
      const incomingIds = new Set(zonas.map(z => z.id));
      for (const row of currentNeonZonas) {
        if (!incomingIds.has(row.id)) {
          await sql`DELETE FROM public.zonas_inspeccion WHERE id = ${row.id}`;
        }
      }
    }

    for (const z of zonas) {
      await sql`
        INSERT INTO public.zonas_inspeccion (
          id, plano_id, codigo, nombre, cota_nivel, nombre_nivel,
          disciplinas_involucradas, estado_salud_apriori, superficie_estimada_m2,
          poligono_svg, nivel_acceso_andamio, coordenadas_gps_override
        )
        VALUES (
          ${z.id},
          ${z.plano_id},
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
      const validTipo = [
        'acero_estructural', 'baranda', 'plataforma', 'soporte', 'equipo', 'caneria', 'tanque'
      ].includes(e.tipo_elemento) ? e.tipo_elemento : 'acero_estructural';

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
          ${validTipo},
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

    // 5. Hitos Geográficos (GPS)
    if (authoritativeHitos) {
      const currentNeonHitos = await sql`SELECT id FROM public.hitos_geograficos`;
      const incomingHitoIds = new Set(hitos.map(h => h.id));
      for (const row of currentNeonHitos) {
        if (!incomingHitoIds.has(row.id)) {
          await sql`DELETE FROM public.hitos_geograficos WHERE id = ${row.id}`;
        }
      }
    }

    for (const h of hitos) {
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
      const processedFotos = [];
      if (Array.isArray(insp.fotos)) {
        for (let idx = 0; idx < insp.fotos.length; idx++) {
          const f = insp.fotos[idx];
          let storageUrl = f.storage_url || null;
          if (!storageUrl && f.thumbnail_data_url && f.thumbnail_data_url.startsWith('data:')) {
            try {
              const match = f.thumbnail_data_url.match(/^data:(.*?);base64,(.*)$/);
              if (match) {
                const mimeType = match[1] || 'image/webp';
                const buffer = Buffer.from(match[2], 'base64');
                const key = `inspecciones/${insp.id}/foto_${idx + 1}.webp`;
                storageUrl = await uploadToB2(key, buffer, mimeType);
                b2UploadsCount++;
              }
            } catch (e) {
              console.warn('Error subiendo foto de inspección a B2:', e);
            }
          }
          processedFotos.push({
            id: f.id || `foto_${idx + 1}`,
            storage_url: storageUrl,
            thumbnail_data_url: f.thumbnail_data_url,
            peso_bytes: f.peso_bytes || 0,
            comentario: f.comentario || '',
            anotaciones_canvas: f.anotaciones_canvas || []
          });
        }
      }

      await sql`
        INSERT INTO public.inspecciones (
          id, elemento_id, zona_id, zona_codigo, inspector_id, fecha_inspeccion,
          estado_sincronizacion, clasificacion_sustrato, clasificacion_recubrimiento,
          grado_corrosion, requiere_reemplazo, porcentaje_afectado,
          criticidad_calculada, observaciones, diagnostico_ia, fotos_json
        )
        VALUES (
          ${insp.id},
          ${insp.elemento_id || null},
          ${insp.zona_id || null},
          ${insp.zona_codigo || null},
          ${insp.inspector_id || null},
          ${insp.fecha_inspeccion || new Date().toISOString()},
          'sincronizado',
          ${insp.clasificacion_sustrato || 'acero_al_carbono'},
          ${insp.clasificacion_recubrimiento || 'epoxi_poliamida'},
          ${insp.grado_corrosion || 'Ri 3'},
          ${insp.requiere_reemplazo || false},
          ${insp.porcentaje_afectado || 0},
          ${insp.criticidad_calculada || 3},
          ${insp.observaciones || null},
          ${insp.diagnostico_ia ? JSON.stringify(insp.diagnostico_ia) : null},
          ${JSON.stringify(processedFotos)}
        )
        ON CONFLICT (id) DO UPDATE SET
          estado_sincronizacion = 'sincronizado',
          zona_id = COALESCE(EXCLUDED.zona_id, public.inspecciones.zona_id),
          zona_codigo = COALESCE(EXCLUDED.zona_codigo, public.inspecciones.zona_codigo),
          clasificacion_sustrato = EXCLUDED.clasificacion_sustrato,
          clasificacion_recubrimiento = EXCLUDED.clasificacion_recubrimiento,
          grado_corrosion = EXCLUDED.grado_corrosion,
          requiere_reemplazo = EXCLUDED.requiere_reemplazo,
          porcentaje_afectado = EXCLUDED.porcentaje_afectado,
          criticidad_calculada = EXCLUDED.criticidad_calculada,
          observaciones = EXCLUDED.observaciones,
          diagnostico_ia = EXCLUDED.diagnostico_ia,
          fotos_json = EXCLUDED.fotos_json
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
      error: err?.message || 'Error procesando sincronización en Neon'
    }, { status: 500 });
  }
}
