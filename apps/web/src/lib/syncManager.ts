import { db, SyncQueueItem } from './db';
import { getSyncRequestHeaders } from './security';
import { Inspeccion } from '../types';

export type SyncState = 'idle' | 'waking_render' | 'syncing' | 'error_cold_start' | 'success' | 'offline';

export interface SyncStatusEvent {
  state: SyncState;
  pendingCount: number;
  message: string;
  attempt?: number;
  maxAttempts?: number;
  activeItemTag?: string;
  activeInspeccionId?: string;
  currentPhoto?: number;
  totalPhotos?: number;
}

type Listener = (event: SyncStatusEvent) => void;

class OfflineSyncManager {
  private listeners: Set<Listener> = new Set();
  private isRunning = false;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.emitCurrentStatus('idle', 'Conexión restablecida. Iniciando sincronización...');
        this.triggerSync();
      });
      window.addEventListener('offline', () => {
        this.emitCurrentStatus('offline', 'Sin conexión. Modo Offline IndexedDB activo.');
      });
    }
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    this.emitCurrentStatus('idle', 'Listo');
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async emitCurrentStatus(
    state: SyncState,
    message: string,
    extra?: Partial<SyncStatusEvent>
  ) {
    let pendingCount = 0;
    try {
      pendingCount = await db.sync_queue.where('estado').notEqual('completado').count();
    } catch {
      pendingCount = 0;
    }

    const event: SyncStatusEvent = {
      state,
      pendingCount,
      message,
      ...extra
    };
    this.listeners.forEach(l => l(event));
  }

  public async enqueueInspection(inspeccion: Inspeccion): Promise<void> {
    await db.inspecciones.put(inspeccion);

    const queueItem: SyncQueueItem = {
      id: `sync_${inspeccion.id}`,
      inspeccion_id: inspeccion.id,
      payload: inspeccion,
      estado: 'pendiente',
      intentos: 0,
      proximo_reintento: Date.now(),
      created_at: Date.now()
    };

    await db.sync_queue.put(queueItem);
    await this.emitCurrentStatus('idle', 'Inspección guardada localmente en IndexedDB');

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      this.triggerSync();
    }
  }

  /**
   * Re-encola inspecciones pendientes que no estén en sync_queue y procesa todo hacia Neon + B2
   */
  public async triggerSync(): Promise<void> {
    if (this.isRunning) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await this.emitCurrentStatus('offline', 'Dispositivo sin conexión a internet. Guardado local seguro.');
      return;
    }

    this.isRunning = true;

    try {
      // Asegurar que cualquier inspección marcada como 'pendiente' o 'error' tenga su ítem en cola
      const pendingInsps = await db.inspecciones
        .where('estado_sincronizacion')
        .anyOf('pendiente', 'error')
        .toArray();
      for (const insp of pendingInsps) {
        const existing = await db.sync_queue.get(`sync_${insp.id}`);
        if (!existing || existing.estado === 'completado') {
          await db.sync_queue.put({
            id: `sync_${insp.id}`,
            inspeccion_id: insp.id,
            payload: insp,
            estado: 'pendiente',
            intentos: 0,
            proximo_reintento: Date.now(),
            created_at: Date.now()
          });
        }
      }

      const items = await db.sync_queue
        .where('estado')
        .notEqual('completado')
        .toArray();

      if (items.length === 0) {
        await this.emitCurrentStatus('idle', 'Todo sincronizado');
        this.isRunning = false;
        return;
      }

      let failedCount = 0;
      let lastErrorMsg = '';

      for (const item of items) {
        const latestLocal = await db.inspecciones.get(item.inspeccion_id);
        const payload = latestLocal || item.payload;

        await this.emitCurrentStatus('syncing', `Subiendo ${payload.zona_codigo || payload.id.substring(0, 10)}...`, {
          activeItemTag: payload.elemento_id
        });

        const result = await this.uploadInspectionToServer(payload);

        if (result.ok) {
          item.estado = 'completado';
          item.ultimo_error = undefined;
          await db.sync_queue.put(item);
          await db.inspecciones.update(item.inspeccion_id, {
            estado_sincronizacion: 'sincronizado'
          });
        } else {
          failedCount++;
          lastErrorMsg = result.error || 'Error de conexión o límite de tamaño';
          item.intentos += 1;
          item.ultimo_error = lastErrorMsg;
          item.proximo_reintento = Date.now() + Math.min(60000, Math.pow(3, item.intentos) * 2000);
          item.estado = 'pendiente';
          await db.sync_queue.put(item);
        }
      }

      if (failedCount > 0) {
        await this.emitCurrentStatus('error_cold_start', `No se pudo subir (${failedCount} pendiente): ${lastErrorMsg}`);
      } else {
        await this.emitCurrentStatus('success', 'Sincronización completada exitosamente');
      }
    } catch (err: any) {
      console.error('Error en SyncManager:', err);
      await this.emitCurrentStatus('error_cold_start', err?.message || 'Error durante la sincronización');
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Estrategia Two-Phase Sync:
   * Fase A: Sube primero el JSON liviano de la inspección a Neon (confirmación rápida incluso con señal débil).
   * Fase B: Sube las fotos WebP a Backblaze B2 en lotes de máximo 2 en paralelo y actualiza las storage_url en Neon.
   */
  private async uploadInspectionToServer(inspeccion: Inspeccion): Promise<{ ok: boolean; error?: string }> {
    try {
      const fotos = Array.isArray(inspeccion.fotos) ? inspeccion.fotos : [];

      // Fase A: Guardar primero el registro liviano en Neon sin los dataUrl pesados (idempotente: omitir si ya tiene remote_id)
      if (!inspeccion.remote_id) {
        const skeletonFotos = fotos.map(f => ({
          ...f,
          thumbnail_data_url: f.storage_url ? (f.micro_thumbnail_data_url || '') : (f.micro_thumbnail_data_url || '')
        }));

        const resA = await fetch('/api/sync-neon', {
          method: 'POST',
          headers: getSyncRequestHeaders(),
          body: JSON.stringify({
            inspecciones: [{ ...inspeccion, fotos: skeletonFotos }]
          })
        }).catch(() => null);

        if (resA && resA.ok) {
          inspeccion.remote_id = inspeccion.id;
          await db.inspecciones.update(inspeccion.id, { remote_id: inspeccion.id }).catch(() => null);
        }
      }

      // Fase B: Subir fotos a Backblaze B2 en cola con máximo 2 en paralelo
      const resolvedUrls: (string | undefined)[] = fotos.map(f => f.storage_url);
      let completedPhotos = 0;

      const uploadOnePhoto = async (idx: number): Promise<string | undefined> => {
        const f = fotos[idx];
        if (f.storage_url || !f.thumbnail_data_url || !f.thumbnail_data_url.startsWith('data:')) {
          return f.storage_url;
        }
        const photoRes = await fetch('/api/sync-neon', {
          method: 'POST',
          headers: getSyncRequestHeaders(),
          body: JSON.stringify({
            uploadPhotoOnly: {
              inspeccionId: inspeccion.id,
              fotoIndex: idx + 1,
              dataUrl: f.thumbnail_data_url
            }
          })
        });
        if (!photoRes.ok) {
          const errJson = await photoRes.json().catch(() => null);
          throw new Error(errJson?.error || `HTTP ${photoRes.status} subiendo foto ${idx + 1}`);
        }
        const photoJson = await photoRes.json();
        completedPhotos++;
        await this.emitCurrentStatus(
          'syncing',
          `Subiendo foto ${completedPhotos} de ${fotos.length} (${inspeccion.zona_codigo || inspeccion.id.substring(0, 8)})...`,
          {
            activeInspeccionId: inspeccion.id,
            currentPhoto: completedPhotos,
            totalPhotos: fotos.length
          }
        );
        return photoJson.storage_url;
      };

      for (let i = 0; i < fotos.length; i += 2) {
        const batchIndices = [i];
        if (i + 1 < fotos.length) batchIndices.push(i + 1);
        const batchUrls = await Promise.all(batchIndices.map(idx => uploadOnePhoto(idx)));
        batchIndices.forEach((idx, bIdx) => {
          resolvedUrls[idx] = batchUrls[bIdx];
        });
      }

      const lightFotos = fotos.map((f, idx) => {
        const storageUrl = resolvedUrls[idx];
        return {
          ...f,
          storage_url: storageUrl,
          thumbnail_data_url: storageUrl
            ? (f.micro_thumbnail_data_url || (f.thumbnail_data_url && f.thumbnail_data_url.length < 35000 ? f.thumbnail_data_url : ''))
            : f.thumbnail_data_url
        };
      });

      const lightInspection: Inspeccion = {
        ...inspeccion,
        fotos: lightFotos
      };

      const res = await fetch('/api/sync-neon', {
        method: 'POST',
        headers: getSyncRequestHeaders(),
        body: JSON.stringify({
          inspecciones: [lightInspection]
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        return {
          ok: false,
          error: errJson?.error || `HTTP ${res.status} al guardar inspección`
        };
      }
      const data = await res.json();
      if (!data.success) {
        return { ok: false, error: data.error || 'Respuesta inválida del servidor' };
      }
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Error de red' };
    }
  }
}

export const syncManager = new OfflineSyncManager();
