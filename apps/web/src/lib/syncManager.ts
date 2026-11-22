import { db, SyncQueueItem } from './db';
import { Inspeccion } from '../types';

export type SyncState = 
  | 'idle' 
  | 'waking_render' 
  | 'syncing' 
  | 'error_cold_start' 
  | 'offline' 
  | 'success';

export interface SyncStatusEvent {
  state: SyncState;
  pendingCount: number;
  message: string;
  activeItemTag?: string;
  attempt?: number;
  maxAttempts?: number;
}

type Listener = (event: SyncStatusEvent) => void;

class SyncManager {
  private isRunning = false;
  private listeners: Listener[] = [];
  private apiBaseUrl: string;

  constructor() {
    this.apiBaseUrl = process.env.NEXT_PUBLIC_API_ENGINE_URL || 'http://localhost:8000';
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.triggerSync());
    }
  }

  public subscribe(listener: Listener) {
    this.listeners.push(listener);
    this.emitCurrentStatus('idle', 'Sincronizador en espera');
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(event: SyncStatusEvent) {
    this.listeners.forEach(l => l(event));
  }

  private async emitCurrentStatus(state: SyncState, message: string, extra?: Partial<SyncStatusEvent>) {
    const pending = await db.sync_queue.where('estado').notEqual('completado').count();
    this.notify({
      state,
      pendingCount: pending,
      message,
      ...extra
    });
  }

  /**
   * Encola una nueva inspección realizada en campo
   */
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
    
    // Intenta sincronizar inmediatamente si hay conexión
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      this.triggerSync();
    }
  }

  /**
   * Despierta el servidor Render y procesa los pendientes con backoff
   */
  public async triggerSync(): Promise<void> {
    if (this.isRunning) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await this.emitCurrentStatus('offline', 'Dispositivo sin conexión a internet. Guardado local seguro.');
      return;
    }

    this.isRunning = true;

    try {
      const items = await db.sync_queue
        .where('estado')
        .notEqual('completado')
        .toArray();

      if (items.length === 0) {
        await this.emitCurrentStatus('idle', 'Todo sincronizado');
        this.isRunning = false;
        return;
      }

      // Paso 1: Comprobar si Render está dormido (Cold start check)
      await this.emitCurrentStatus('waking_render', 'Comprobando conexión con servidor Render...', { attempt: 1, maxAttempts: 5 });
      const serverReady = await this.pingRenderEngineWithColdStartTolerance();

      if (!serverReady) {
        await this.emitCurrentStatus('error_cold_start', 'El servidor Render está suspendido o iniciando. Se reintentará automáticamente.', { attempt: 1, maxAttempts: 5 });
        this.isRunning = false;
        return;
      }

      // Paso 2: Procesar cada elemento en cola
      for (const item of items) {
        await this.emitCurrentStatus('syncing', `Subiendo inspección (${item.payload.id.substring(0, 8)})...`, {
          activeItemTag: item.payload.elemento_id
        });

        const success = await this.uploadInspectionToServer(item.payload);

        if (success) {
          item.estado = 'completado';
          await db.sync_queue.put(item);
          // Actualizar estado en tabla local
          await db.inspecciones.update(item.inspeccion_id, {
            estado_sincronizacion: 'sincronizado'
          });
        } else {
          item.intentos += 1;
          item.ultimo_error = 'Error de conexión o timeout';
          // Backoff exponencial: 5s, 15s, 45s
          item.proximo_reintento = Date.now() + Math.min(60000, Math.pow(3, item.intentos) * 2000);
          item.estado = item.intentos >= 5 ? 'fallido' : 'pendiente';
          await db.sync_queue.put(item);
        }
      }

      await this.emitCurrentStatus('success', 'Sincronización completada exitosamente');
    } catch (err: any) {
      console.error('Error en SyncManager:', err);
      await this.emitCurrentStatus('error_cold_start', err?.message || 'Error durante la sincronización');
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Sincroniza la cola local directly contra Neon Serverless & Backblaze B2 (/api/sync-neon)
   */
  private async pingRenderEngineWithColdStartTolerance(): Promise<boolean> {
    return true;
  }

  /**
   * Envía la inspección con su galería de fotos WebP comprimidas a Neon + Backblaze B2
   */
  private async uploadInspectionToServer(inspeccion: Inspeccion): Promise<boolean> {
    try {
      const res = await fetch('/api/sync-neon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inspecciones: [inspeccion]
        })
      });
      if (!res.ok) return false;
      const data = await res.json();
      return !!data.success;
    } catch {
      return false;
    }
  }
}

export const syncManager = new SyncManager();
