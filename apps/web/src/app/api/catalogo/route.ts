import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';
import { DEFAULT_CATALOG_SEED } from '@/lib/defaultCatalogSeed';
import { getSessionFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

let catalogoSchemaEnsured = false;

async function ensureCatalogoTableAndSeed() {
  if (!catalogoSchemaEnsured) {
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS public.catalogo_materiales (
          id SERIAL PRIMARY KEY,
          codigo VARCHAR(64) UNIQUE NOT NULL,
          categoria VARCHAR(32) NOT NULL,
          descripcion VARCHAR(180) NOT NULL,
          unidad VARCHAR(16) NOT NULL,
          peso_unitario_kg NUMERIC(10,3) NOT NULL DEFAULT 0,
          presentacion_comercial VARCHAR(80) NOT NULL,
          factor_comercial NUMERIC(10,3) NOT NULL DEFAULT 1,
          complejidad_default VARCHAR(24) DEFAULT 'ESTRUCTURAL',
          precio_ref_material NUMERIC(12,2),
          activo BOOLEAN DEFAULT TRUE,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `;
    } catch (e) {
      console.warn('Aviso DDL catalogo_materiales:', e);
    }
    catalogoSchemaEnsured = true;
  }

  const existing = await sql`SELECT COUNT(*)::int AS total FROM public.catalogo_materiales`;
  const total = Number(existing?.[0]?.total || 0);
  if (total === 0) {
    for (const item of DEFAULT_CATALOG_SEED) {
      await sql`
        INSERT INTO public.catalogo_materiales (
          codigo, categoria, descripcion, unidad, peso_unitario_kg,
          presentacion_comercial, factor_comercial, complejidad_default,
          precio_ref_material, activo
        )
        VALUES (
          ${item.codigo},
          ${item.categoria},
          ${item.descripcion},
          ${item.unidad},
          ${item.peso_unitario_kg},
          ${item.presentacion_comercial},
          ${item.factor_comercial},
          ${item.complejidad_default},
          ${item.precio_ref_material ?? null},
          ${item.activo}
        )
        ON CONFLICT (codigo) DO NOTHING
      `;
    }
  }
}

function mapCatalogRow(row: any) {
  return {
    id: row.id !== undefined ? Number(row.id) : undefined,
    codigo: String(row.codigo),
    categoria: row.categoria,
    descripcion: row.descripcion,
    unidad: row.unidad,
    peso_unitario_kg: Number(row.peso_unitario_kg || 0),
    presentacion_comercial: row.presentacion_comercial,
    factor_comercial: Number(row.factor_comercial || 1),
    complejidad_default: row.complejidad_default || 'ESTRUCTURAL',
    precio_ref_material: row.precio_ref_material !== null && row.precio_ref_material !== undefined ? Number(row.precio_ref_material) : undefined,
    activo: row.activo !== false,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : undefined
  };
}

export async function GET(req: NextRequest) {
  try {
    await ensureCatalogoTableAndSeed();
    const onlyActive = req.nextUrl.searchParams.get('active') === '1';
    const rows = onlyActive
      ? await sql`SELECT * FROM public.catalogo_materiales WHERE activo = TRUE ORDER BY categoria, codigo`
      : await sql`SELECT * FROM public.catalogo_materiales ORDER BY categoria, codigo`;

    return NextResponse.json({
      success: true,
      items: rows.map(mapCatalogRow)
    });
  } catch (err: any) {
    console.error('Error GET /api/catalogo:', err);
    return NextResponse.json({ success: false, error: 'Error consultando catálogo maestro.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (session?.rol === 'inspector') {
      return NextResponse.json({ success: false, error: 'Permiso insuficiente para editar el catálogo.' }, { status: 403 });
    }
    await ensureCatalogoTableAndSeed();
    const body = await req.json();
    const codigo = String(body.codigo || '').trim().toUpperCase().replace(/\s+/g, '_');
    if (!codigo || !body.descripcion) {
      return NextResponse.json({ success: false, error: 'Código y descripción son obligatorios.' }, { status: 400 });
    }

    const rows = await sql`
      INSERT INTO public.catalogo_materiales (
        codigo, categoria, descripcion, unidad, peso_unitario_kg,
        presentacion_comercial, factor_comercial, complejidad_default,
        precio_ref_material, activo, updated_at
      )
      VALUES (
        ${codigo},
        ${body.categoria || 'PERFIL'},
        ${String(body.descripcion).trim()},
        ${body.unidad || 'm'},
        ${Number(body.peso_unitario_kg) || 0},
        ${String(body.presentacion_comercial || 'Unidad').trim()},
        ${Math.max(0.001, Number(body.factor_comercial) || 1)},
        ${body.complejidad_default || 'ESTRUCTURAL'},
        ${body.precio_ref_material !== undefined && body.precio_ref_material !== '' && body.precio_ref_material !== null ? Number(body.precio_ref_material) : null},
        ${body.activo !== false},
        NOW()
      )
      ON CONFLICT (codigo) DO UPDATE SET
        categoria = EXCLUDED.categoria,
        descripcion = EXCLUDED.descripcion,
        unidad = EXCLUDED.unidad,
        peso_unitario_kg = EXCLUDED.peso_unitario_kg,
        presentacion_comercial = EXCLUDED.presentacion_comercial,
        factor_comercial = EXCLUDED.factor_comercial,
        complejidad_default = EXCLUDED.complejidad_default,
        precio_ref_material = EXCLUDED.precio_ref_material,
        activo = EXCLUDED.activo,
        updated_at = NOW()
      RETURNING *
    `;

    return NextResponse.json({ success: true, item: mapCatalogRow(rows[0]) });
  } catch (err: any) {
    console.error('Error POST /api/catalogo:', err);
    return NextResponse.json({ success: false, error: 'Error guardando material en catálogo.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  return POST(req);
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (session?.rol === 'inspector') {
      return NextResponse.json({ success: false, error: 'Permiso insuficiente.' }, { status: 403 });
    }
    await ensureCatalogoTableAndSeed();
    const codigo = req.nextUrl.searchParams.get('codigo') || (await req.json().catch(() => ({})))?.codigo;
    if (!codigo) {
      return NextResponse.json({ success: false, error: 'Falta código de material.' }, { status: 400 });
    }
    await sql`DELETE FROM public.catalogo_materiales WHERE codigo = ${String(codigo).trim().toUpperCase()}`;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Error DELETE /api/catalogo:', err);
    return NextResponse.json({ success: false, error: 'Error eliminando material.' }, { status: 500 });
  }
}
