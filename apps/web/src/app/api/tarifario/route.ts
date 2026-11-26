import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';
import { DEFAULT_TARIFARIO } from '@/lib/computoEngine';
import { getSessionFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

let tarifarioSchemaEnsured = false;

async function ensureTarifarioTable() {
  if (tarifarioSchemaEnsured) return;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS public.tarifario_config (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) DEFAULT 'Tarifario Base Planta',
        config_json JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
  } catch (e) {
    console.warn('Aviso DDL tarifario_config:', e);
  }
  tarifarioSchemaEnsured = true;
}

export async function GET() {
  try {
    await ensureTarifarioTable();
    const rows = await sql`SELECT * FROM public.tarifario_config ORDER BY id ASC LIMIT 1`;
    if (rows.length === 0) {
      await sql`
        INSERT INTO public.tarifario_config (nombre, config_json)
        VALUES ('Tarifario Base Planta', ${JSON.stringify(DEFAULT_TARIFARIO)})
      `;
      return NextResponse.json({ success: true, tarifario: DEFAULT_TARIFARIO });
    }
    return NextResponse.json({
      success: true,
      tarifario: { ...DEFAULT_TARIFARIO, ...(rows[0].config_json || {}) },
      updated_at: rows[0].updated_at
    });
  } catch (err: any) {
    console.error('Error GET /api/tarifario:', err);
    return NextResponse.json({ success: false, error: 'Error consultando tarifario.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (session?.rol === 'inspector') {
      return NextResponse.json({ success: false, error: 'Permiso insuficiente para editar tarifario.' }, { status: 403 });
    }
    await ensureTarifarioTable();
    const body = await req.json();
    const config = { ...DEFAULT_TARIFARIO, ...(body.tarifario || body) };

    const rows = await sql`SELECT id FROM public.tarifario_config ORDER BY id ASC LIMIT 1`;
    if (rows.length === 0) {
      await sql`
        INSERT INTO public.tarifario_config (nombre, config_json, updated_at)
        VALUES ('Tarifario Base Planta', ${JSON.stringify(config)}, NOW())
      `;
    } else {
      await sql`
        UPDATE public.tarifario_config
        SET config_json = ${JSON.stringify(config)}, updated_at = NOW()
        WHERE id = ${rows[0].id}
      `;
    }

    return NextResponse.json({ success: true, tarifario: config });
  } catch (err: any) {
    console.error('Error PUT /api/tarifario:', err);
    return NextResponse.json({ success: false, error: 'Error guardando tarifario.' }, { status: 500 });
  }
}
