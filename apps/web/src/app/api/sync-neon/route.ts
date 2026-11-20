import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';
import { uploadToB2 } from '@/lib/b2';
import { Area, Plano, ZonaInspeccion, Elemento, Inspeccion } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const areas = await sql`SELECT * FROM public.areas ORDER BY codigo`;
    const planos = await sql`SELECT * FROM public.planos ORDER BY created_at DESC`;
    const zonas = await sql`SELECT * FROM public.zonas_inspeccion ORDER BY codigo`;
    const elementos = await sql`SELECT * FROM public.elementos ORDER BY tag_codigo`;
    const inspecciones = await sql`SELECT * FROM public.inspecciones ORDER BY fecha_inspeccion DESC`;

    return NextResponse.json({
      success: true,
      data: {
        areas,
        planos,
        zonas,
        elementos,
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      areas = [],
      planos = [],
      zonas = [],
      elementos = [],
      inspecciones = []
    }: {
      areas?: Area[];
      planos?: Plano[];
      zonas?: ZonaInspeccion[];
      elementos?: Elemento[];
      inspecciones?: Inspeccion[];
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

    // 2. Planos
    for (const p of planos) {
      let b2Url = p.archivo_original_url || null;

      // Si tiene archivo_data_url pesado (base64 rasterizado de PDF/imagen), subir a Backblaze B2
      if (p.archivo_data_url && p.archivo_data_url.startsWith('data:')) {
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
          rotacion, tipo_plano, dimensiones_viewbox, version, activo
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
          version = EXCLUDED.version,
          activo = EXCLUDED.activo
      `;
    }

    // 3. Zonas
    for (const z of zonas) {
      await sql`
        INSERT INTO public.zonas_inspeccion (
          id, plano_id, codigo, nombre, cota_nivel, nombre_nivel,
          disciplinas_involucradas, estado_salud_apriori, superficie_estimada_m2,
          poligono_svg, nivel_acceso_andamio
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
          ${JSON.stringify(z.nivel_acceso_andamio || {})}
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
          nivel_acceso_andamio = EXCLUDED.nivel_acceso_andamio
      `;
    }

    // 4. Elementos
    for (const e of elementos) {
      await sql`
        INSERT INTO public.elementos (
          id, zona_id, tag_codigo, codigo_equipo_erp, qr_token,
          tipo_elemento, coordenadas_pin, geometria_parametros,
          criticidad_activo, estado_actual
        )
        VALUES (
          ${e.id},
          ${e.zona_id},
          ${e.tag_codigo},
          ${e.codigo_equipo_erp || null},
          ${e.qr_token},
          ${e.tipo_elemento || 'acero_estructural'},
          ${JSON.stringify(e.coordenadas_pin || { x: 0, y: 0 })},
          ${JSON.stringify(e.geometria_parametros || {})},
          ${e.criticidad_activo || 3},
          ${e.estado_actual || 'gris'}
        )
        ON CONFLICT (id) DO UPDATE SET
          tag_codigo = EXCLUDED.tag_codigo,
          codigo_equipo_erp = EXCLUDED.codigo_equipo_erp,
          tipo_elemento = EXCLUDED.tipo_elemento,
          coordenadas_pin = EXCLUDED.coordenadas_pin,
          geometria_parametros = EXCLUDED.geometria_parametros,
          criticidad_activo = EXCLUDED.criticidad_activo,
          estado_actual = EXCLUDED.estado_actual,
          updated_at = now()
      `;
    }

    // 5. Inspecciones
    for (const insp of inspecciones) {
      await sql`
        INSERT INTO public.inspecciones (
          id, elemento_id, inspector_id, fecha_inspeccion,
          estado_sincronizacion, clasificacion_sustrato, clasificacion_recubrimiento,
          grado_corrosion, requiere_reemplazo, porcentaje_afectado,
          criticidad_calculada, observaciones, diagnostico_ia
        )
        VALUES (
          ${insp.id},
          ${insp.elemento_id},
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
          ${insp.diagnostico_ia ? JSON.stringify(insp.diagnostico_ia) : null}
        )
        ON CONFLICT (id) DO UPDATE SET
          estado_sincronizacion = 'sincronizado',
          clasificacion_sustrato = EXCLUDED.clasificacion_sustrato,
          clasificacion_recubrimiento = EXCLUDED.clasificacion_recubrimiento,
          grado_corrosion = EXCLUDED.grado_corrosion,
          requiere_reemplazo = EXCLUDED.requiere_reemplazo,
          porcentaje_afectado = EXCLUDED.porcentaje_afectado,
          criticidad_calculada = EXCLUDED.criticidad_calculada,
          observaciones = EXCLUDED.observaciones,
          diagnostico_ia = EXCLUDED.diagnostico_ia
      `;
    }

    return NextResponse.json({
      success: true,
      message: 'Sincronización con Neon y Backblaze B2 completada.',
      synced: {
        areas: areas.length,
        planos: planos.length,
        zonas: zonas.length,
        elementos: elementos.length,
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
