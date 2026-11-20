import Dexie, { Table } from 'dexie';
import { Area, Plano, ZonaInspeccion, Elemento, Inspeccion, ParametroCubicacion, HitoGeografico } from '../types';

export interface SyncQueueItem {
  id: string; // uuid
  inspeccion_id: string;
  payload: Inspeccion;
  estado: 'pendiente' | 'en_progreso' | 'completado' | 'fallido';
  intentos: number;
  proximo_reintento: number; // timestamp
  ultimo_error?: string;
  created_at: number;
}

export class IndustrialInspectionDB extends Dexie {
  areas!: Table<Area, string>;
  planos!: Table<Plano, string>;
  zonas!: Table<ZonaInspeccion, string>;
  elementos!: Table<Elemento, string>;
  inspecciones!: Table<Inspeccion, string>;
  sync_queue!: Table<SyncQueueItem, string>;
  parametros!: Table<ParametroCubicacion, string>;
  hitos!: Table<HitoGeografico, string>;

  constructor() {
    super('IndustrialMaintenanceOfflineDB');
    this.version(1).stores({
      areas: 'id, codigo',
      planos: 'id, area_id, activo',
      zonas: 'id, plano_id, codigo',
      elementos: 'id, zona_id, tag_codigo, qr_token, estado_actual',
      inspecciones: 'id, elemento_id, estado_sincronizacion, fecha_inspeccion',
      sync_queue: 'id, inspeccion_id, estado, proximo_reintento, intentos',
      parametros: 'id, clave, categoria',
      hitos: 'id, codigo, tipo, plano_id'
    });
  }
}

export const db = new IndustrialInspectionDB();
