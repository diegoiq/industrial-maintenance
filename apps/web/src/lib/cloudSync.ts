import { db } from './db';
import { getSyncRequestHeaders } from './security';

const PENDING_ZONAS_KEY = 'im_pending_zonas_ids';
const PENDING_HITOS_KEY = 'im_pending_hitos_ids';
const PENDING_AREAS_KEY = 'im_pending_areas_ids';

let isSyncInFlight = false;
let lastLocalMutationAt = 0;

function getPendingIds(storageKey: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function savePendingIds(storageKey: string, ids: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore
  }
}

/**
 * Marca una zona o hito recién creado/editado localmente como "Pendiente de Subir"
 * para que ningún polling automático lo borre antes de que llegue a Neon.
 */
export function markLocalEntityPendingPush(type: 'zona' | 'hito' | 'area', id: string) {
  lastLocalMutationAt = Date.now();
  const key = type === 'zona' ? PENDING_ZONAS_KEY : type === 'hito' ? PENDING_HITOS_KEY : PENDING_AREAS_KEY;
  const set = getPendingIds(key);
  set.add(id);
  savePendingIds(key, set);
}

export function markLocalMutation() {
  lastLocalMutationAt = Date.now();
}

export interface CloudManifestSummary {
  areas: { id: string; codigo: string; nombre: string }[];
  planos: {
    id: string;
    area_id: string;
    titulo: string;
    version: number;
    tipo_plano: string;
    has_b2_url: boolean;
    has_image: boolean;
    payload_bytes: number;
    georeferencia?: any;
  }[];
  zonas: {
    id: string;
    plano_id: string;
    codigo: string;
    nombre: string;
    cota_nivel: number;
    estado_salud_apriori: string;
    superficie_estimada_m2: number;
  }[];
  elementos: { id: string; zona_id: string; tag_codigo: string; tipo_elemento: string; estado_actual: string }[];
  hitos: { id: string; codigo: string; nombre: string; lat: number; lng: number }[];
  inspecciones: {
    id: string;
    zona_id?: string;
    zona_codigo?: string;
    elemento_id?: string;
    grado_corrosion: string;
    fecha_inspeccion: string;
    fotos_count: number;
  }[];
  counts: {
    areas: number;
    planos: number;
    zonas: number;
    elementos: number;
    hitos: number;
    inspecciones: number;
    fotos: number;
  };
}

export interface CacheComparisonReport {
  isAligned: boolean;
  hasLocalUnsyncedChanges: boolean;
  needsInitialPlanDownload: boolean;
  localCacheBytes: number;
  local: {
    planos: { id: string; titulo: string; version: number; cachedInEdge: boolean; sizeBytes: number }[];
    zonas: { id: string; codigo: string; nombre: string; status: 'synced' | 'local_only' }[];
    elementosCount: number;
    hitosCount: number;
    inspeccionesCount: number;
    fotosCount: number;
  };
  cloud: CloudManifestSummary | null;
  diff: {
    zonasOnlyLocal: { id: string; codigo: string; nombre: string }[];
    zonasOnlyCloud: { id: string; codigo: string; nombre: string }[];
    inspeccionesOnlyLocalCount: number;
    inspeccionesOnlyCloudCount: number;
  };
}

/**
 * Consulta únicamente el manifiesto ligero (~500 bytes) en Neon PostgreSQL
 */
export async function fetchCloudManifest(): Promise<CloudManifestSummary | null> {
  try {
    const res = await fetch('/api/sync-neon?mode=manifest', {
      cache: 'no-store',
      headers: getSyncRequestHeaders()
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.success || !json.manifest) return null;
    return json.manifest as CloudManifestSummary;
  } catch {
    return null;
  }
}

/**
 * Compara qué tenemos en la Caché Local (IndexedDB de PC o Celular) vs. qué hay en Neon y Backblaze B2
 */
export async function compareLocalCacheWithCloud(): Promise<CacheComparisonReport> {
  const [localPlanos, localZonas, localElementos, localHitos, localInspecciones, cloud] = await Promise.all([
    db.planos.toArray(),
    db.zonas.toArray(),
    db.elementos.toArray(),
    db.hitos.toArray(),
    db.inspecciones.toArray(),
    fetchCloudManifest()
  ]);

  let localCacheBytes = 0;
  const planosStatus = localPlanos.map(p => {
    const sizeBytes = (p.svg_content?.length || 0) + (p.archivo_data_url?.length || 0);
    localCacheBytes += sizeBytes;
    const cachedInEdge = !!(p.svg_content || p.archivo_data_url || p.archivo_original_url);
    return {
      id: p.id,
      titulo: p.titulo,
      version: p.version || 1,
      cachedInEdge,
      sizeBytes
    };
  });

  const localFotosCount = localInspecciones.reduce((acc, i) => {
    const fotos = i.fotos || [];
    for (const f of fotos) {
      localCacheBytes += f.thumbnail_data_url?.length || f.peso_bytes || 0;
    }
    return acc + fotos.length;
  }, 0);

  const cloudZonaIds = new Set((cloud?.zonas || []).map(z => z.id));
  const localZonaIds = new Set(localZonas.map(z => z.id));

  const zonasOnlyLocal = localZonas
    .filter(z => !cloudZonaIds.has(z.id))
    .map(z => ({ id: z.id, codigo: z.codigo, nombre: z.nombre }));

  const zonasOnlyCloud = (cloud?.zonas || [])
    .filter(z => !localZonaIds.has(z.id))
    .map(z => ({ id: z.id, codigo: z.codigo, nombre: z.nombre }));

  const cloudInspIds = new Set((cloud?.inspecciones || []).map(i => i.id));
  const localInspIds = new Set(localInspecciones.map(i => i.id));

  const inspeccionesOnlyLocalCount = localInspecciones.filter(i => !cloudInspIds.has(i.id)).length;
  const inspeccionesOnlyCloudCount = (cloud?.inspecciones || []).filter(i => !localInspIds.has(i.id)).length;

  const needsInitialPlanDownload =
    !!cloud &&
    cloud.planos.length > 0 &&
    (localPlanos.length === 0 || localPlanos.some(lp => !lp.svg_content && !lp.archivo_data_url && !lp.archivo_original_url));

  const hasLocalUnsyncedChanges = zonasOnlyLocal.length > 0 || inspeccionesOnlyLocalCount > 0;

  const isAligned =
    !!cloud &&
    !needsInitialPlanDownload &&
    zonasOnlyLocal.length === 0 &&
    zonasOnlyCloud.length === 0 &&
    inspeccionesOnlyLocalCount === 0 &&
    inspeccionesOnlyCloudCount === 0 &&
    localElementos.length === cloud.counts.elementos &&
    localHitos.length === cloud.counts.hitos;

  return {
    isAligned,
    hasLocalUnsyncedChanges,
    needsInitialPlanDownload,
    localCacheBytes,
    local: {
      planos: planosStatus,
      zonas: localZonas.map(z => ({
        id: z.id,
        codigo: z.codigo,
        nombre: z.nombre,
        status: cloudZonaIds.has(z.id) ? 'synced' : 'local_only'
      })),
      elementosCount: localElementos.length,
      hitosCount: localHitos.length,
      inspeccionesCount: localInspecciones.length,
      fotosCount: localFotosCount
    },
    cloud,
    diff: {
      zonasOnlyLocal,
      zonasOnlyCloud,
      inspeccionesOnlyLocalCount,
      inspeccionesOnlyCloudCount
    }
  };
}

/**
 * Envía una sincronización ultra-rápida (~4 KB, <200 ms) a Neon PostgreSQL.
 * Por defecto NO re-envía los megabytes del archivo_data_url/svg_content del plano (salvo al subir un plano nuevo).
 */
export async function pushFastSyncToCloud(options: {
  includePlanImages?: boolean;
  authoritativeZonas?: boolean;
  authoritativeHitos?: boolean;
} = {}): Promise<{ success: boolean; synced?: any; error?: string }> {
  isSyncInFlight = true;
  lastLocalMutationAt = Date.now();
  try {
    const allAreas = await db.areas.toArray();
    const rawPlanos = await db.planos.toArray();
    const allZonas = await db.zonas.toArray();
    const allElementos = await db.elementos.toArray();
    const allHitos = await db.hitos.toArray();
    const allInspecciones = await db.inspecciones.toArray();

    // Si no se pide expresamente subir la imagen pesada del plano, enviamos solo metadatos y georreferencia (~1 KB)
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

    const json = await res.json();
    if (json.success) {
      // Limpiar cola de IDs pendientes de subida porque ya están confirmados en Neon
      savePendingIds(PENDING_ZONAS_KEY, new Set());
      savePendingIds(PENDING_HITOS_KEY, new Set());
    }
    return json;
  } catch (err: any) {
    console.warn('Error en pushFastSyncToCloud:', err);
    return { success: false, error: err?.message };
  } finally {
    isSyncInFlight = false;
  }
}

/**
 * Elimina un registro inmediatamente en Neon PostgreSQL
 */
export async function deleteFromCloud(type: 'zona' | 'elemento' | 'hito' | 'plano' | 'area', id: string): Promise<void> {
  lastLocalMutationAt = Date.now();
  if (type === 'zona') {
    const pending = getPendingIds(PENDING_ZONAS_KEY);
    pending.delete(id);
    savePendingIds(PENDING_ZONAS_KEY, pending);
  } else if (type === 'hito') {
    const pendingH = getPendingIds(PENDING_HITOS_KEY);
    pendingH.delete(id);
    savePendingIds(PENDING_HITOS_KEY, pendingH);
  } else if (type === 'area') {
    const pendingA = getPendingIds(PENDING_AREAS_KEY);
    pendingA.delete(id);
    savePendingIds(PENDING_AREAS_KEY, pendingA);
  }
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
 * Descarga desde Neon y RECONCILIA la base de datos local (IndexedDB):
 * - Si el dispositivo ya tiene la imagen del plano en caché, usa ?light=1 (~4 KB)
 *   para NUNCA volver a descargar los megabytes del plano CAD/PDF.
 * - Protege cualquier zona local recién creada que esté en `im_pending_zonas_ids`.
 */
export async function pullAndReconcileFromCloud(options: { forceFullPlanDownload?: boolean } = {}): Promise<boolean> {
  if (isSyncInFlight) return false;
  isSyncInFlight = true;
  try {
    const localPlanos = await db.planos.toArray();
    const hasLocalPlanImage =
      !options.forceFullPlanDownload &&
      localPlanos.length > 0 &&
      localPlanos.every(p => !!(p.archivo_data_url || p.svg_content || p.archivo_original_url));

    const res = await fetch(`/api/sync-neon${hasLocalPlanImage ? '?light=1' : ''}`, {
      cache: 'no-store',
      headers: getSyncRequestHeaders()
    });
    const json = await res.json();
    if (!json.success || !json.data) return false;

    const { areas = [], planos = [], zonas = [], elementos = [], hitos = [], inspecciones = [] } = json.data;
    const pendingZonas = getPendingIds(PENDING_ZONAS_KEY);
    const pendingHitos = getPendingIds(PENDING_HITOS_KEY);

    // 1. Reconciliar Áreas (respetando áreas locales pendientes de subir)
    if (areas.length > 0) {
      const cloudAreaIds = new Set(areas.map((a: any) => a.id));
      const pendingAreas = getPendingIds(PENDING_AREAS_KEY);
      const localAreas = await db.areas.toArray();
      for (const la of localAreas) {
        if (!cloudAreaIds.has(la.id) && !pendingAreas.has(la.id)) {
          await db.areas.delete(la.id);
        } else if (cloudAreaIds.has(la.id) && pendingAreas.has(la.id)) {
          pendingAreas.delete(la.id);
        }
      }
      savePendingIds(PENDING_AREAS_KEY, pendingAreas);
      for (const a of areas) await db.areas.put(a);
    }

    // 2. Actualizar Planos (conservando archivo_data_url / svg_content local en caché de borde)
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

    // 3. Reconciliar Zonas (Respetando zonas nuevas creadas localmente que aún estén pendientes de push)
    if (planos.length > 0 || zonas.length > 0) {
      const cloudZonaIds = new Set(zonas.map((z: any) => z.id));
      const localZonas = await db.zonas.toArray();
      for (const lz of localZonas) {
        if (!cloudZonaIds.has(lz.id) && !pendingZonas.has(lz.id)) {
          await db.zonas.delete(lz.id);
        }
      }
      for (const z of zonas) await db.zonas.put(z);
    }

    // 4. Reconciliar Hitos GPS
    const cloudHitoIds = new Set(hitos.map((h: any) => h.id));
    const localHitos = await db.hitos.toArray();
    for (const lh of localHitos) {
      if (!cloudHitoIds.has(lh.id) && !pendingHitos.has(lh.id)) {
        await db.hitos.delete(lh.id);
      }
    }
    for (const h of hitos) await db.hitos.put(h);

    // 5. Elementos e Inspecciones
    for (const e of elementos) await db.elementos.put(e);
    for (const i of inspecciones) await db.inspecciones.put(i);

    return true;
  } catch (err) {
    console.warn('Error en pullAndReconcileFromCloud:', err);
    return false;
  } finally {
    isSyncInFlight = false;
  }
}

/**
 * SMART EDGE POLLING (Cada 7 segundos):
 * 1. Si hay una edición local reciente (< 4s) o un sync en curso, no interfiere.
 * 2. Consulta `/api/sync-neon?mode=manifest` (~500 bytes).
 * 3. Compara la huella de la nube con la Caché Local (IndexedDB):
 *    - Si hay cambios locales pendientes de subir -> los sube automáticamente (`pushFastSyncToCloud`).
 *    - Si la nube tiene zonas, pines, hitos o inspecciones nuevas -> descarga solo el delta (`pullAndReconcileFromCloud`).
 *    - Si todo está igual -> NO HACE NADA (0 bytes de descarga, trabajo 100% en el borde).
 */
export async function smartEdgeHeartbeatSync(): Promise<{
  action: 'noop' | 'pushed' | 'pulled' | 'initial_download';
  changed: boolean;
}> {
  if (isSyncInFlight || Date.now() - lastLocalMutationAt < 4000) {
    return { action: 'noop', changed: false };
  }
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return { action: 'noop', changed: false };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { action: 'noop', changed: false };
  }

  try {
    const report = await compareLocalCacheWithCloud();
    if (!report.cloud) return { action: 'noop', changed: false };

    // Caso A: Dispositivo nuevo (PC o Celular nuevo) que aún no tiene el archivo del plano en caché
    if (report.needsInitialPlanDownload) {
      const ok = await pullAndReconcileFromCloud({ forceFullPlanDownload: true });
      return { action: 'initial_download', changed: ok };
    }

    // Caso B: Hay zonas o inspecciones creadas en este dispositivo que aún no subieron a Neon
    const pendingZonas = getPendingIds(PENDING_ZONAS_KEY);
    if (pendingZonas.size > 0 || report.diff.inspeccionesOnlyLocalCount > 0) {
      await pushFastSyncToCloud({
        includePlanImages: false,
        authoritativeZonas: false,
        authoritativeHitos: false
      });
      if (report.diff.zonasOnlyCloud.length > 0 || report.diff.inspeccionesOnlyCloudCount > 0) {
        await pullAndReconcileFromCloud();
      }
      return { action: 'pushed', changed: true };
    }

    // Caso C: La nube tiene cambios (nuevas zonas, zonas eliminadas en PC o nuevas inspecciones de campo)
    if (!report.isAligned) {
      const ok = await pullAndReconcileFromCloud();
      return { action: 'pulled', changed: ok };
    }

    // Caso D: 100% alineado en el borde -> No se descarga nada
    return { action: 'noop', changed: false };
  } catch {
    return { action: 'noop', changed: false };
  }
}
