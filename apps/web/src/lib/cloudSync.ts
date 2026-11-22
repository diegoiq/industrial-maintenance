import { db } from './db';
import { getSyncRequestHeaders } from './security';

/**
 * Envía una sincronización ultra-rápida (~4 KB, <200 ms) a Neon PostgreSQL.
 * Por defecto NO re-envía los 2.4 MB del archivo_data_url del plano (a menos que sea un plano nuevo),
 * y aplica authoritativeZonas = true para que cualquier zona borrada en la PC se borre también en Neon.
 */
export async function pushFastSyncToCloud(options: {
  includePlanImages?: boolean;
  authoritativeZonas?: boolean;
  authoritativeHitos?: boolean;
} = {}): Promise<{ success: boolean; synced?: any; error?: string }> {
  try {
    const allAreas = await db.areas.toArray();
    const rawPlanos = await db.planos.toArray();
    const allZonas = await db.zonas.toArray();
    const allElementos = await db.elementos.toArray();
    const allHitos = await db.hitos.toArray();
    const allInspecciones = await db.inspecciones.toArray();

    // Si no se pide expresamente subir la imagen pesada del plano y ya fue subida, enviamos solo metadatos y georreferencia (~1 KB)
    const planosPayload = rawPlanos.map(p => {
      if (!options.includePlanImages) {
        return {
          ...p,
          archivo_data_url: undefined,
          svg_content: undefined
        };
      }
      return p;
    });

    const res = await fetch('/api/sync-neon', {
      method: 'POST',
      headers: getSyncRequestHeaders(),
      body: JSON.stringify({
        areas: allAreas,
        planos: planosPayload,
        zonas: allZonas,
        elementos: allElementos,
        hitos: allHitos,
        inspecciones: allInspecciones,
        authoritativeZonas: options.authoritativeZonas !== false && allZonas.length > 0,
        authoritativeHitos: options.authoritativeHitos !== false && allHitos.length > 0
      })
    });

    return await res.json();
  } catch (err: any) {
    console.warn('Error en pushFastSyncToCloud:', err);
    return { success: false, error: err?.message };
  }
}

/**
 * Elimina un registro inmediatamente en Neon PostgreSQL
 */
export async function deleteFromCloud(type: 'zona' | 'elemento' | 'hito' | 'plano' | 'area', id: string): Promise<void> {
  try {
    await fetch('/api/sync-neon', {
      method: 'DELETE',
      headers: getSyncRequestHeaders(),
      body: JSON.stringify({ type, id })
    });
  } catch (e) {
    console.warn('No se pudo eliminar en la nube en este momento:', e);
  }
}

/**
 * Descarga desde Neon y RECONCILIA exactamente la base de datos local (IndexedDB):
 * - Si el dispositivo ya tiene la imagen del plano en caché, usa ?light=1 (~4 KB, instantáneo)
 *   para no volver a descargar 2 MB de imagen en cada refresco.
 * - Elimina del teléfono o navegador cualquier Zona, Hito o Área que haya sido borrada en la nube.
 */
export async function pullAndReconcileFromCloud(): Promise<boolean> {
  try {
    const localPlanos = await db.planos.toArray();
    const hasLocalPlanImage = localPlanos.length > 0 && localPlanos.every(p => !!(p.archivo_data_url || p.svg_content || p.archivo_original_url));

    const res = await fetch(`/api/sync-neon${hasLocalPlanImage ? '?light=1' : ''}`, {
      cache: 'no-store',
      headers: getSyncRequestHeaders()
    });
    const json = await res.json();
    if (!json.success || !json.data) return false;

    const { areas = [], planos = [], zonas = [], elementos = [], hitos = [], inspecciones = [] } = json.data;

    // 1. Reconciliar Áreas
    if (areas.length > 0) {
      const cloudAreaIds = new Set(areas.map((a: any) => a.id));
      const localAreas = await db.areas.toArray();
      for (const la of localAreas) {
        if (!cloudAreaIds.has(la.id)) await db.areas.delete(la.id);
      }
      for (const a of areas) await db.areas.put(a);
    }

    // 2. Actualizar Planos (conservando archivo_data_url / svg_content local si fue una consulta light)
    if (planos.length > 0) {
      for (const cp of planos) {
        const existing = localPlanos.find(lp => lp.id === cp.id);
        await db.planos.put({
          ...existing,
          ...cp,
          archivo_data_url: cp.archivo_data_url || existing?.archivo_data_url,
          svg_content: cp.svg_content || existing?.svg_content,
          archivo_original_url: cp.archivo_original_url || existing?.archivo_original_url
        });
      }
    }

    // 3. Reconciliar Zonas (Elimina en el celular cualquier zona que haya sido borrada en la PC)
    if (planos.length > 0 || zonas.length > 0) {
      const cloudZonaIds = new Set(zonas.map((z: any) => z.id));
      const localZonas = await db.zonas.toArray();
      for (const lz of localZonas) {
        if (!cloudZonaIds.has(lz.id)) {
          await db.zonas.delete(lz.id);
        }
      }
      for (const z of zonas) await db.zonas.put(z);
    }

    // 4. Reconciliar Hitos GPS
    const cloudHitoIds = new Set(hitos.map((h: any) => h.id));
    const localHitos = await db.hitos.toArray();
    for (const lh of localHitos) {
      if (!cloudHitoIds.has(lh.id)) await db.hitos.delete(lh.id);
    }
    for (const h of hitos) await db.hitos.put(h);

    // 5. Elementos e Inspecciones
    for (const e of elementos) await db.elementos.put(e);
    for (const i of inspecciones) await db.inspecciones.put(i);

    return true;
  } catch (err) {
    console.warn('Error en pullAndReconcileFromCloud:', err);
    return false;
  }
}
