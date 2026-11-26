import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';
import { getSessionFromRequest } from '@/lib/auth';
import { isValidEntityId } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getSessionFromRequest(req);
    if (session?.rol === 'inspector') {
      return NextResponse.json({ success: false, error: 'Permiso insuficiente para aprobar BOM.' }, { status: 403 });
    }

    const resolvedParams = await Promise.resolve(context.params);
    const id = resolvedParams.id;
    if (!isValidEntityId(id)) {
      return NextResponse.json({ success: false, error: 'ID de inspección inválido.' }, { status: 400 });
    }

    const body = await req.json();

    await sql`ALTER TABLE public.inspecciones ADD COLUMN IF NOT EXISTS estrategia_intervencion VARCHAR(32) DEFAULT 'INTEGRAL_100'`;
    await sql`ALTER TABLE public.inspecciones ADD COLUMN IF NOT EXISTS grado_preparacion VARCHAR(32) DEFAULT 'ST2_ST3'`;
    await sql`ALTER TABLE public.inspecciones ADD COLUMN IF NOT EXISTS clasificacion_alcance VARCHAR(20) DEFAULT 'CRITICO'`;
    await sql`ALTER TABLE public.inspecciones ADD COLUMN IF NOT EXISTS superficie_computada_m2 NUMERIC(10,2)`;
    await sql`ALTER TABLE public.inspecciones ADD COLUMN IF NOT EXISTS accesos_json JSONB DEFAULT '[]'::jsonb`;
    await sql`ALTER TABLE public.inspecciones ADD COLUMN IF NOT EXISTS estado_bom VARCHAR(32) DEFAULT 'NO_APLICA'`;
    await sql`ALTER TABLE public.inspecciones ADD COLUMN IF NOT EXISTS nota_bom_campo TEXT`;
    await sql`ALTER TABLE public.inspecciones ADD COLUMN IF NOT EXISTS items_metalicos_json JSONB DEFAULT '[]'::jsonb`;
    await sql`ALTER TABLE public.inspecciones ADD COLUMN IF NOT EXISTS items_civil_json JSONB DEFAULT '[]'::jsonb`;

    const rows = await sql`
      UPDATE public.inspecciones
      SET
        estrategia_intervencion = COALESCE(${body.estrategia_intervencion ?? null}, estrategia_intervencion),
        grado_preparacion = COALESCE(${body.grado_preparacion ?? null}, grado_preparacion),
        clasificacion_alcance = COALESCE(${body.clasificacion_alcance ?? null}, clasificacion_alcance),
        superficie_computada_m2 = COALESCE(${body.superficie_computada_m2 !== undefined ? Number(body.superficie_computada_m2) : null}, superficie_computada_m2),
        accesos_json = COALESCE(${body.accesos !== undefined ? JSON.stringify(body.accesos) : null}::jsonb, accesos_json),
        estado_bom = COALESCE(${body.estado_bom ?? null}, estado_bom),
        nota_bom_campo = COALESCE(${body.nota_bom_campo ?? null}, nota_bom_campo),
        items_metalicos_json = COALESCE(${body.items_metalicos !== undefined ? JSON.stringify(body.items_metalicos) : null}::jsonb, items_metalicos_json),
        items_civil_json = COALESCE(${body.items_civil !== undefined ? JSON.stringify(body.items_civil) : null}::jsonb, items_civil_json),
        requiere_reemplazo = COALESCE(${typeof body.requiere_reemplazo === 'boolean' ? body.requiere_reemplazo : null}, requiere_reemplazo),
        observaciones = COALESCE(${body.observaciones ?? null}, observaciones)
      WHERE id = ${id}
      RETURNING id, estado_bom
    `;

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Inspección no encontrada en Neon.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, updated: rows[0] });
  } catch (err: any) {
    console.error('Error PATCH /api/inspections/[id]/computo:', err);
    return NextResponse.json({ success: false, error: 'Error actualizando cómputo e ingeniería BOM.' }, { status: 500 });
  }
}
