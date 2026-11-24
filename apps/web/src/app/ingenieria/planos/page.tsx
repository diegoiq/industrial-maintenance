'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Building2, 
  Map as MapIcon, 
  Upload, 
  Layers, 
  CheckCircle2, 
  Trash2, 
  FileDown, 
  FileSpreadsheet, 
  Globe, 
  RefreshCw, 
  CloudUpload,
  MoreVertical,
  Plus,
  HardDrive
} from 'lucide-react';
import { InteractivePlantMap } from '../../../components/ingenieria/InteractivePlantMap';
import { ZoneDrawer } from '../../../components/ingenieria/ZoneDrawer';
import { QRLabelGeneratorModal } from '../../../components/ingenieria/QRLabelGeneratorModal';
import { UploadPlanModal } from '../../../components/ingenieria/UploadPlanModal';
import { ReplacePlanFileModal } from '../../../components/ingenieria/ReplacePlanFileModal';
import { CreateElementModal } from '../../../components/ingenieria/CreateElementModal';
import { CreateZoneModal } from '../../../components/ingenieria/CreateZoneModal';
import { EditZoneModal } from '../../../components/ingenieria/EditZoneModal';
import { CreateHitoModal } from '../../../components/ingenieria/CreateHitoModal';
import { ReporteRelevamientoModal } from '../../../components/campo/ReporteRelevamientoModal';
import { HitosMapsModal } from '../../../components/ingenieria/HitosMapsModal';
import { SyncComparatorModal } from '../../../components/ingenieria/SyncComparatorModal';
import { AreasManagerModal } from '../../../components/ingenieria/AreasManagerModal';
import { db } from '../../../lib/db';
import { getSyncRequestHeaders } from '../../../lib/security';
import { getOrInitGeoreferencia, getPolygonCentroid, latLngToPixel, pixelToLatLng } from '../../../lib/georeferenceEngine';
import {
  pushFastSyncToCloud,
  deleteFromCloud,
  pullAndReconcileFromCloud,
  markLocalEntityPendingPush,
  smartEdgeHeartbeatSync
} from '../../../lib/cloudSync';
import { Area, Plano, ZonaInspeccion, Elemento, Inspeccion, HitoGeografico } from '../../../types';

export default function PlanosIngenieriaPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [zonas, setZonas] = useState<ZonaInspeccion[]>([]);
  const [elementos, setElementos] = useState<Elemento[]>([]);
  const [hitos, setHitos] = useState<HitoGeografico[]>([]);
  const [inspecciones, setInspecciones] = useState<Inspeccion[]>([]);

  const [selectedAreaId, setSelectedAreaId] = useState<string>('');
  const [selectedPlanoId, setSelectedPlanoId] = useState<string>('');
  const [selectedZona, setSelectedZona] = useState<ZonaInspeccion | undefined>(undefined);
  const [selectedElemento, setSelectedElemento] = useState<Elemento | undefined>(undefined);
  const [selectedHito, setSelectedHito] = useState<HitoGeografico | undefined>(undefined);

  // Modos de interacción: 'inspect' | 'add_pin' | 'add_zone' | 'add_hito'
  const [activeMode, setActiveMode] = useState<'inspect' | 'add_pin' | 'add_zone' | 'add_hito'>('inspect');
  const [customPolygonPoints, setCustomPolygonPoints] = useState<{ x: number; y: number }[] | undefined>(undefined);
  const [isEditingZonePolygon, setIsEditingZonePolygon] = useState<boolean>(false);

  // Menú desplegable "Más opciones" en topbar y Menú Contextual sobre el mapa
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [contextMenu, setContextMenu] = useState<{
    type: 'zona' | 'elemento' | 'hito';
    item: any;
    x: number;
    y: number;
    confirmDelete?: boolean;
    editMode?: 'tag' | 'hito_info' | 'hito_gps';
    field1?: string;
    field2?: string;
  } | null>(null);
  const [relocatingEntity, setRelocatingEntity] = useState<{
    type: 'elemento' | 'hito' | 'zona';
    item: any;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
        setRelocatingEntity(null);
        setActiveMode('inspect');
        setDefaultAreaForNewZone(undefined);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  // Modales
  const [isUploadPlanModalOpen, setIsUploadPlanModalOpen] = useState<boolean>(false);
  const [isReplacePlanModalOpen, setIsReplacePlanModalOpen] = useState<boolean>(false);
  const [isCreateElementModalOpen, setIsCreateElementModalOpen] = useState<boolean>(false);
  const [pendingPinCoords, setPendingPinCoords] = useState<{ x: number; y: number } | null>(null);
  const [isCreateHitoModalOpen, setIsCreateHitoModalOpen] = useState<boolean>(false);
  const [pendingHitoCoords, setPendingHitoCoords] = useState<{ x: number; y: number } | null>(null);
  const [isQRModalOpen, setIsQRModalOpen] = useState<boolean>(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [isHitosModalOpen, setIsHitosModalOpen] = useState<boolean>(false);
  const [isSyncComparatorOpen, setIsSyncComparatorOpen] = useState<boolean>(false);
  const [isAreasModalOpen, setIsAreasModalOpen] = useState<boolean>(false);
  const [defaultAreaForNewZone, setDefaultAreaForNewZone] = useState<string | undefined>(undefined);
  const [isCreateZoneModalOpen, setIsCreateZoneModalOpen] = useState<boolean>(false);
  const [isEditZoneModalOpen, setIsEditZoneModalOpen] = useState<boolean>(false);
  const [zoneToEdit, setZoneToEdit] = useState<ZonaInspeccion | undefined>(undefined);

  // Filtro de semáforo y Cota/Nivel Multinivel
  const [filtroSemaforo, setFiltroSemaforo] = useState<string>('todos');
  const [filtroNivel, setFiltroNivel] = useState<string>('todos');
  const [notification, setNotification] = useState<string | null>(null);

  // Cargar datos persistentes desde IndexedDB (con hidratación automática desde Neon Cloud)
  const reloadFromDB = async () => {
    let loadedAreas = await db.areas.toArray();
    let loadedPlanos = await db.planos.toArray();
    let loadedZonas = await db.zonas.toArray();
    let loadedElementos = await db.elementos.toArray();
    let loadedHitos = await db.hitos.toArray();
    let loadedInspecciones = await db.inspecciones.toArray();

    // Purgar únicamente los UUIDs semilla iniciales si no tienen plano vinculado
    if (loadedPlanos.length > 0) {
      const usedAreaIds = new Set(loadedPlanos.map(p => p.area_id));
      const SEED_AREA_IDS = [
        '35a9360f-48db-4bbd-8ef6-c920d5da9e75',
        '5aed1762-75a2-46c4-89c6-924ab3697b70',
        '8ea03de9-f30c-49ed-93ad-39ffa4f64c21'
      ];
      for (const a of loadedAreas) {
        if (!usedAreaIds.has(a.id) && SEED_AREA_IDS.includes(a.id)) {
          await db.areas.delete(a.id);
        }
      }
      loadedAreas = await db.areas.toArray();
    }

    // Si el almacenamiento local del dispositivo está vacío, hidratar desde Neon Cloud
    if (loadedPlanos.length === 0) {
      try {
        const res = await fetch('/api/sync-neon', { headers: getSyncRequestHeaders() });
        const json = await res.json();
        if (json.success && json.data.planos && json.data.planos.length > 0) {
          for (const a of (json.data.areas || [])) await db.areas.put(a);
          for (const p of (json.data.planos || [])) await db.planos.put(p);
          for (const z of (json.data.zonas || [])) await db.zonas.put(z);
          for (const e of (json.data.elementos || [])) await db.elementos.put(e);
          for (const h of (json.data.hitos || [])) await db.hitos.put(h);
          for (const i of (json.data.inspecciones || [])) await db.inspecciones.put(i);

          loadedAreas = await db.areas.toArray();
          loadedPlanos = await db.planos.toArray();
          loadedZonas = await db.zonas.toArray();
          loadedElementos = await db.elementos.toArray();
          loadedHitos = await db.hitos.toArray();
          loadedInspecciones = await db.inspecciones.toArray();
        }
      } catch (err) {
        console.warn("Fallo hidratación automática desde Neon:", err);
      }
    }

    setAreas(loadedAreas);
    setPlanos(loadedPlanos);
    setZonas(loadedZonas);
    setElementos(loadedElementos);
    setHitos(loadedHitos);
    setInspecciones(loadedInspecciones);

    if (loadedAreas.length > 0 && (!selectedAreaId || !loadedAreas.some(a => a.id === selectedAreaId))) {
      setSelectedAreaId(loadedAreas[0].id);
    }

    if (loadedPlanos.length > 0 && (!selectedPlanoId || !loadedPlanos.some(p => p.id === selectedPlanoId))) {
      setSelectedPlanoId(loadedPlanos[0].id);
    }
  };

  useEffect(() => {
    reloadFromDB().then(() => {
      // Al entrar, comparar manifiesto ligero (~500 bytes) y traer solo deltas si la nube tiene cambios
      smartEdgeHeartbeatSync().then(res => {
        if (res.changed) reloadFromDB();
      });
    });

    // Polling inteligente cada 7 segundos en el borde (solo consulta ~500 bytes si la pantalla está activa)
    const interval = setInterval(() => {
      smartEdgeHeartbeatSync().then(res => {
        if (res.changed) reloadFromDB();
      });
    }, 7000);

    const onFocus = () => {
      smartEdgeHeartbeatSync().then(res => {
        if (res.changed) reloadFromDB();
      });
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const currentArea = areas.find(a => a.id === selectedAreaId);
  const currentPlano = planos.find(p => p.id === selectedPlanoId);
  const hitosPlano = hitos.filter(h => currentPlano ? (!h.plano_id || h.plano_id === currentPlano.id) : true);
  const zonasPlano = zonas.filter(z => currentPlano ? z.plano_id === currentPlano.id : true);
  const elementosPlano = elementos.filter(e => {
    const zona = zonas.find(z => z.id === e.zona_id);
    return currentPlano ? (!zona || zona.plano_id === currentPlano.id) : true;
  });

  const zonasFiltradas = zonasPlano.filter(z => {
    if (filtroNivel !== 'todos' && String(z.cota_nivel || 146000) !== filtroNivel) return false;
    if (
      currentArea &&
      currentArea.codigo !== 'PLANTA GENERAL' &&
      currentPlano?.area_id !== currentArea.id
    ) {
      const zArea = (z.area_planta || '').toLowerCase().trim();
      const targetArea = currentArea.nombre.toLowerCase().trim();
      if (!zArea || (!zArea.includes(targetArea) && !targetArea.includes(zArea))) {
        return false;
      }
    }
    return true;
  });

  const elementosFiltrados = elementosPlano.filter(e => {
    if (filtroSemaforo !== 'todos' && e.estado_actual !== filtroSemaforo) return false;
    return true;
  });

  const handleSelectZona = (zona: ZonaInspeccion) => {
    setSelectedZona(zona);
    setSelectedElemento(undefined);
    setIsEditingZonePolygon(false);
  };

  const handleSelectElemento = (elem: Elemento) => {
    setSelectedElemento(elem);
    const z = zonas.find(zona => zona.id === elem.zona_id);
    setSelectedZona(z);
  };

  const handleMapClick = async (coords: { x: number; y: number }) => {
    if (relocatingEntity) {
      const geoCal = getOrInitGeoreferencia(currentPlano, hitosPlano);
      const newGps = pixelToLatLng(coords.x, coords.y, geoCal);

      if (relocatingEntity.type === 'elemento') {
        const elem: Elemento = relocatingEntity.item;
        const updated: Elemento = {
          ...elem,
          coordenadas_pin: { x: Math.round(coords.x), y: Math.round(coords.y) },
          coordenadas_gps: { lat: newGps.lat, lng: newGps.lng }
        };
        await db.elementos.put(updated);
        setElementos(prev => prev.map(el => (el.id === updated.id ? updated : el)));
        if (selectedElemento?.id === updated.id) setSelectedElemento(updated);
        pushFastSyncToCloud({ includePlanImages: false, authoritativeZonas: false, authoritativeHitos: false }).catch(() => null);
        setNotification(`Pin "${updated.tag_codigo}" reubicado en el plano.`);
      } else if (relocatingEntity.type === 'hito') {
        const hito: HitoGeografico = relocatingEntity.item;
        const updated: HitoGeografico = {
          ...hito,
          lat: newGps.lat,
          lng: newGps.lng,
          coordenadas_plano: { x: Math.round(coords.x), y: Math.round(coords.y) }
        };
        markLocalEntityPendingPush('hito', updated.id);
        await db.hitos.put(updated);
        setHitos(prev => prev.map(h => (h.id === updated.id ? updated : h)));
        if (selectedHito?.id === updated.id) setSelectedHito(updated);
        pushFastSyncToCloud({ authoritativeHitos: true }).catch(() => null);
        setNotification(`Hito GPS "${updated.codigo}" reubicado en el plano.`);
      } else if (relocatingEntity.type === 'zona') {
        const z: ZonaInspeccion = relocatingEntity.item;
        const pts = z.poligono_svg?.puntos || [];
        const centroid = getPolygonCentroid(pts);
        const dx = Math.round(coords.x - centroid.x);
        const dy = Math.round(coords.y - centroid.y);
        const newPuntos = pts.map(p => ({ x: Math.round(p.x + dx), y: Math.round(p.y + dy) }));
        await handleUpdateZonePolygon(z.id, newPuntos);
      }

      setRelocatingEntity(null);
      setTimeout(() => setNotification(null), 3500);
      return;
    }

    if (activeMode === 'add_pin') {
      setPendingPinCoords(coords);
      setIsCreateElementModalOpen(true);
      setActiveMode('inspect');
      return;
    }

    if (activeMode === 'add_hito') {
      setPendingHitoCoords(coords);
      setIsCreateHitoModalOpen(true);
      setActiveMode('inspect');
      return;
    }
  };

  const handleOpenQRModal = (elem: Elemento) => {
    setSelectedElemento(elem);
    setIsQRModalOpen(true);
  };

  const handleUpdateZonePolygon = async (zonaId: string, puntos: { x: number; y: number }[]) => {
    const target = zonas.find(z => z.id === zonaId);
    if (!target) return;
    const updated = {
      ...target,
      poligono_svg: { puntos }
    };
    markLocalEntityPendingPush('zona', zonaId);
    await db.zonas.put(updated);
    setZonas(prev => prev.map(z => z.id === zonaId ? updated : z));
    if (selectedZona?.id === zonaId) {
      setSelectedZona(updated);
    }
    pushFastSyncToCloud({ authoritativeZonas: true });
    setNotification(`Contorno de zona "${target.codigo}" actualizado y sincronizado.`);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleAddVertexToZone = async (zonaId: string) => {
    const target = zonas.find(z => z.id === zonaId);
    if (!target) return;
    const pts = target.poligono_svg?.puntos || [];
    if (pts.length < 2) return;
    const last = pts[pts.length - 1];
    const first = pts[0];
    const newPt = {
      x: Math.round((last.x + first.x) / 2),
      y: Math.round((last.y + first.y) / 2)
    };
    const updatedPts = [...pts, newPt];
    await handleUpdateZonePolygon(zonaId, updatedPts);
  };

  const handleDeleteZone = async (zonaId: string) => {
    const target = zonas.find(z => z.id === zonaId);
    if (!target) return;
    if (window.confirm(`¿Seguro que deseas eliminar la Zona "${target.codigo} - ${target.nombre}"?`)) {
      await db.zonas.delete(zonaId);
      await db.elementos.where('zona_id').equals(zonaId).delete();
      await deleteFromCloud('zona', zonaId);
      await pushFastSyncToCloud({ authoritativeZonas: true });
      await reloadFromDB();
      setSelectedZona(undefined);
      setSelectedElemento(undefined);
      setNotification(`Zona "${target.codigo}" eliminada en PC y Nube.`);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handlePolygonCreated = (puntos: { x: number; y: number }[]) => {
    setCustomPolygonPoints(puntos);
    setIsCreateZoneModalOpen(true);
    setActiveMode('inspect');
  };

  const handleZoneUpdated = async (updatedZone: ZonaInspeccion) => {
    markLocalEntityPendingPush('zona', updatedZone.id);
    await db.zonas.put(updatedZone);
    setZonas(prev => prev.map(z => z.id === updatedZone.id ? updatedZone : z));
    if (selectedZona?.id === updatedZone.id) {
      setSelectedZona(updatedZone);
    }
    pushFastSyncToCloud({ authoritativeZonas: true });
    setNotification(`Zona "${updatedZone.codigo}" actualizada y sincronizada.`);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleDeleteCurrentPlano = async () => {
    if (!currentPlano) return;
    const confirmMsg = `¿Eliminar ÚNICAMENTE el plano "${currentPlano.titulo}"?\n\nLos demás planos y áreas se conservarán.`;
    if (window.confirm(confirmMsg)) {
      await db.planos.delete(currentPlano.id);
      const zonasDelPlano = zonas.filter(z => z.plano_id === currentPlano.id);
      for (const z of zonasDelPlano) {
        await db.zonas.delete(z.id);
        await db.elementos.where('zona_id').equals(z.id).delete();
      }
      await reloadFromDB();
      setSelectedPlanoId('');
      setNotification(`Plano "${currentPlano.titulo}" eliminado.`);
      setTimeout(() => setNotification(null), 4000);
    }
  };

  const handleWipeData = async () => {
    if (window.confirm("¿Seguro que deseas vaciar todos los planos, áreas y activos locales para empezar desde cero?")) {
      await db.areas.clear();
      await db.planos.clear();
      await db.zonas.clear();
      await db.elementos.clear();
      await reloadFromDB();
      setSelectedAreaId('');
      setSelectedPlanoId('');
      setSelectedZona(undefined);
      setSelectedElemento(undefined);
      setNotification("Se limpiaron todos los datos.");
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleExportPlantJSON = async () => {
    const backupData = {
      version: 1,
      fecha: new Date().toISOString(),
      areas: await db.areas.toArray(),
      planos: await db.planos.toArray(),
      zonas: await db.zonas.toArray(),
      elementos: await db.elementos.toArray()
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PLANTA_INDUSTRIAL_BACKUP_${new Date().toISOString().substring(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setNotification("Respaldo exportado en formato JSON.");
    setTimeout(() => setNotification(null), 3000);
  };

  // Sincronización completa con Neon PostgreSQL y Backblaze B2 Storage
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);

  const handleSyncToCloud = async () => {
    try {
      setIsSyncingCloud(true);
      // 1. Primero enviamos sincronización rápida (~4 KB) de zonas, áreas, elementos, hitos y metadatos de planos
      // para garantizar que nunca exceda el límite de 4.5 MB de Vercel Serverless ni se pierda ninguna zona nueva.
      const data = await pushFastSyncToCloud({
        includePlanImages: false,
        authoritativeZonas: true,
        authoritativeHitos: true
      });

      if (data.success) {
        // 2. Solo reconciliamos de vuelta si el push a Neon fue exitoso (evita borrar zonas locales no sincronizadas)
        await pullAndReconcileFromCloud();
        await reloadFromDB();
        setNotification(`⚡ ¡Sincronización Instantánea! (${data.synced?.zonas || 0} zonas exactas espejadas con Nube y Celular).`);
      } else {
        alert("Error en sincronización: " + (data.error || "Desconocido"));
      }
    } catch (err: any) {
      alert("Error de conexión al sincronizar con la nube: " + err?.message);
    } finally {
      setIsSyncingCloud(false);
      setTimeout(() => setNotification(null), 4000);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-[#070b13] relative">
      {/* Toast Flotante de Notificaciones (No empuja el lienzo) */}
      {notification && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-emerald-950/95 border border-emerald-500/80 px-4 py-2 rounded-xl text-emerald-200 text-xs flex items-center space-x-2 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span className="font-medium">{notification}</span>
        </div>
      )}

      {/* TOPBAR UNIFICADA (48px / 1 fila compacta) */}
      <header className="h-12 bg-slate-900 border-b border-slate-800 px-3 pl-12 lg:pl-3 flex items-center justify-between gap-2 flex-shrink-0 z-20">
        {/* Lado Izquierdo: Selectores de Área y Plano */}
        <div className="flex items-center space-x-2 min-w-0">
          {/* Selector de Área (Visible en Desktop) */}
          <div className="hidden md:flex items-center space-x-1.5 flex-shrink-0">
            <Building2 className="w-3.5 h-3.5 text-amber-500" />
            {areas.length > 0 ? (
              <select
                value={selectedAreaId}
                onChange={(e) => {
                  setSelectedAreaId(e.target.value);
                  const planosDeArea = planos.filter(p => p.area_id === e.target.value);
                  if (planosDeArea.length > 0) setSelectedPlanoId(planosDeArea[0].id);
                }}
                className="bg-slate-950 border border-slate-700 text-[11px] font-bold text-slate-200 rounded-md px-2 py-1 focus:border-amber-400 focus:outline-none max-w-[130px] truncate"
              >
                {areas.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.codigo} - {a.nombre}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          {/* Selector de Plano */}
          <div className="flex items-center space-x-1.5 min-w-0">
            <MapIcon className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
            {planos.length > 0 ? (
              <select
                value={selectedPlanoId}
                onChange={(e) => {
                  const target = planos.find(p => p.id === e.target.value);
                  if (target) {
                    setSelectedPlanoId(target.id);
                    setSelectedAreaId(target.area_id);
                  }
                }}
                className="bg-slate-950 border border-slate-700 text-xs text-white rounded-md px-2 py-1 focus:border-sky-400 focus:outline-none max-w-[160px] sm:max-w-xs truncate font-semibold"
              >
                {planos.map(p => {
                  const zonasCount = zonas.filter(z => z.plano_id === p.id).length;
                  const iconEmoji = p.tipo_plano === 'layout_general' ? '🗺️' : p.tipo_plano === 'elevacion_isometrico' ? '📐' : '🏢';
                  return (
                    <option key={p.id} value={p.id}>
                      {iconEmoji} {p.titulo} ({zonasCount} zonas)
                    </option>
                  );
                })}
              </select>
            ) : (
              <span className="text-xs text-slate-500 italic">Sin planos</span>
            )}
          </div>

          {/* Filtro de Cota/Nivel Compacto (incluye cotas manuales registradas) */}
          <select
            value={filtroNivel}
            onChange={(e) => setFiltroNivel(e.target.value)}
            className="hidden sm:inline-block bg-slate-950 border border-slate-700 text-amber-400 font-mono text-[11px] rounded-md px-2 py-1 focus:outline-none"
            title="Filtrar Zonas por Cota / Nivel"
          >
            <option value="todos">Niveles: Todos</option>
            {Array.from(
              new Set([
                146000,
                152000,
                158000,
                170000,
                ...zonasPlano.map(z => Number(z.cota_nivel || 146000))
              ])
            )
              .sort((a, b) => a - b)
              .map(cota => (
                <option key={cota} value={String(cota)}>
                  +{(cota / 1000).toFixed(3)} m
                </option>
              ))}
          </select>
        </div>

        {/* Lado Derecho: Comparador Caché vs Nube, Sync Nube, Subir Plano y Menú de Gestión */}
        <div className="flex items-center space-x-1.5 flex-shrink-0">
          {/* Botón Comparador Caché Local vs. Nube */}
          <button
            type="button"
            onClick={() => setIsSyncComparatorOpen(true)}
            className="flex items-center space-x-1 px-2 py-1 bg-slate-950 hover:bg-slate-800 border border-indigo-500/50 text-indigo-300 font-mono font-bold text-[11px] rounded-md transition"
            title="Comparar qué hay en la Caché Local de este equipo vs. Base de Datos Neon e Imágenes"
          >
            <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden lg:inline">Caché ({zonasPlano.length}Z)</span>
          </button>

          {/* Botón Sincronizar Nube */}
          <button
            type="button"
            onClick={handleSyncToCloud}
            disabled={isSyncingCloud}
            className="flex items-center space-x-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-md shadow transition"
            title="Sincronizar datos y planos con Neon PostgreSQL y Backblaze B2"
          >
            <CloudUpload className={`w-3.5 h-3.5 ${isSyncingCloud ? 'animate-bounce' : ''}`} />
            <span className="hidden md:inline">{isSyncingCloud ? 'Sincronizando...' : 'Sincronizar'}</span>
          </button>

          {/* Botón Subir Plano */}
          <button
            type="button"
            onClick={() => setIsUploadPlanModalOpen(true)}
            className="flex items-center space-x-1 px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-md shadow transition"
            title="Subir nuevo plano (PDF, DXF, SVG o Imagen)"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Plano</span>
          </button>

          {/* Menú Desplegable "Más Opciones" */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-md border border-slate-700/80 transition"
              title="Herramientas y gestión de planta"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {isMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-56 bg-slate-900 border border-slate-700/90 rounded-xl shadow-2xl py-1 text-xs text-slate-200 z-50 divide-y divide-slate-800 animate-in fade-in zoom-in-95">
                <div className="py-1">
                  <button
                    onClick={() => { setIsAreasModalOpen(true); setIsMenuOpen(false); }}
                    className="w-full flex items-center space-x-2.5 px-3 py-2 hover:bg-slate-800 text-left text-slate-200 hover:text-white"
                  >
                    <Building2 className="w-3.5 h-3.5 text-sky-400" />
                    <span>Gestionar Áreas y Zonas</span>
                  </button>
                  <button
                    onClick={() => { setIsHitosModalOpen(true); setIsMenuOpen(false); }}
                    className="w-full flex items-center space-x-2.5 px-3 py-2 hover:bg-slate-800 text-left text-slate-200 hover:text-white"
                  >
                    <Globe className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Hitos Maps (GPS)</span>
                  </button>
                  <button
                    onClick={() => { setIsReportModalOpen(true); setIsMenuOpen(false); }}
                    className="w-full flex items-center space-x-2.5 px-3 py-2 hover:bg-slate-800 text-left text-slate-200 hover:text-white"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
                    <span>Generar Reporte Técnico</span>
                  </button>
                  <button
                    onClick={() => { setIsReplacePlanModalOpen(true); setIsMenuOpen(false); }}
                    disabled={!currentPlano}
                    className="w-full flex items-center space-x-2.5 px-3 py-2 hover:bg-slate-800 text-left text-slate-200 hover:text-white disabled:opacity-40"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
                    <span>Reemplazar Archivo (DXF/PDF)</span>
                  </button>
                  <button
                    onClick={() => { handleExportPlantJSON(); setIsMenuOpen(false); }}
                    className="w-full flex items-center space-x-2.5 px-3 py-2 hover:bg-slate-800 text-left text-slate-200 hover:text-white"
                  >
                    <FileDown className="w-3.5 h-3.5 text-purple-400" />
                    <span>Exportar Respaldo JSON</span>
                  </button>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => { handleDeleteCurrentPlano(); setIsMenuOpen(false); }}
                    disabled={!currentPlano}
                    className="w-full flex items-center space-x-2.5 px-3 py-2 hover:bg-red-950/40 text-left text-red-400 hover:text-red-300 disabled:opacity-40"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar plano actual</span>
                  </button>
                  <button
                    onClick={() => { handleWipeData(); setIsMenuOpen(false); }}
                    className="w-full flex items-center space-x-2.5 px-3 py-2 hover:bg-red-950/40 text-left text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Vaciar datos (Reset)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ÁREA DEL PLANO: 100% Edge-to-Edge */}
      <div className="flex-1 w-full h-[calc(100vh-48px)] relative overflow-hidden">
        <InteractivePlantMap
          plano={currentPlano}
          zonas={zonasFiltradas}
          elementos={elementosFiltrados}
          hitos={hitosPlano}
          selectedZonaId={selectedZona?.id}
          selectedElementoId={selectedElemento?.id}
          selectedHitoId={selectedHito?.id}
          activeMode={activeMode}
          onChangeMode={(mode) => setActiveMode(mode)}
          onSelectZona={handleSelectZona}
          onSelectElemento={handleSelectElemento}
          onSelectHito={(h) => {
            setSelectedHito(h);
            setNotification(`Hito GPS "${h.codigo}": ${h.lat}, ${h.lng} (${h.nombre})`);
            setTimeout(() => setNotification(null), 4000);
          }}
          onMapClick={handleMapClick}
          onOpenUploadModal={() => setIsUploadPlanModalOpen(true)}
          onPlanUpdated={() => {
            reloadFromDB();
            pushFastSyncToCloud({ authoritativeZonas: true });
          }}
          onUpdateZonePolygon={handleUpdateZonePolygon}
          onPolygonCreated={handlePolygonCreated}
          isEditingPolygon={isEditingZonePolygon}
          isRelocating={Boolean(relocatingEntity)}
          onToggleEditPolygon={() => setIsEditingZonePolygon(prev => !prev)}
          onEntityContextMenu={({ type, item, clientX, clientY }) => {
            setContextMenu({
              type,
              item,
              x: Math.min(clientX, window.innerWidth - 250),
              y: Math.min(clientY, window.innerHeight - 240)
            });
          }}
        />

        {/* Banner activo mientras se elige nueva ubicación en el plano */}
        {relocatingEntity && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 px-4 py-2 bg-emerald-950/95 border-2 border-emerald-400 rounded-xl shadow-2xl flex items-center space-x-3 text-xs text-emerald-100">
            <span>
              🎯 Hacé clic en el nuevo lugar del plano para mover{' '}
              <strong className="text-white font-mono">
                {relocatingEntity.type === 'elemento'
                  ? relocatingEntity.item.tag_codigo
                  : relocatingEntity.item.codigo}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => setRelocatingEntity(null)}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-bold text-[11px]"
            >
              Cancelar (Esc)
            </button>
          </div>
        )}

        {/* Menú Contextual de Clic Derecho sobre Pines, Hitos GPS y Zonas */}
        {contextMenu && (
          <div
            ref={contextMenuRef}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ left: contextMenu.x, top: contextMenu.y }}
            className="fixed z-50 w-60 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1.5 text-xs text-slate-200 backdrop-blur-md"
          >
            <div className="px-3 py-1.5 border-b border-slate-800 text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold truncate">
              {contextMenu.type === 'elemento' && `Pin: ${contextMenu.item.tag_codigo}`}
              {contextMenu.type === 'hito' && `GPS: ${contextMenu.item.codigo}`}
              {contextMenu.type === 'zona' && `Zona: ${contextMenu.item.codigo}`}
            </div>

            {contextMenu.confirmDelete ? (
              <div className="p-3 space-y-2.5 bg-red-950/30">
                <p className="text-[11px] text-red-200 font-semibold leading-snug">
                  ⚠️ ¿Confirmás eliminar permanentemente{' '}
                  <strong className="text-white">
                    {contextMenu.type === 'elemento'
                      ? contextMenu.item.tag_codigo
                      : contextMenu.item.codigo}
                  </strong>
                  ?
                </p>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const { type, item } = contextMenu;
                      setContextMenu(null);
                      if (type === 'elemento') {
                        await db.elementos.delete(item.id);
                        setElementos(prev => prev.filter(el => el.id !== item.id));
                        if (selectedElemento?.id === item.id) setSelectedElemento(undefined);
                        await deleteFromCloud('elemento', item.id);
                        setNotification(`Pin "${item.tag_codigo}" eliminado.`);
                      } else if (type === 'hito') {
                        await db.hitos.delete(item.id);
                        setHitos(prev => prev.filter(h => h.id !== item.id));
                        if (selectedHito?.id === item.id) setSelectedHito(undefined);
                        await deleteFromCloud('hito', item.id);
                        setNotification(`Hito GPS "${item.codigo}" eliminado.`);
                      } else if (type === 'zona') {
                        await db.zonas.delete(item.id);
                        await db.elementos.where('zona_id').equals(item.id).delete();
                        setZonas(prev => prev.filter(z => z.id !== item.id));
                        setElementos(prev => prev.filter(el => el.zona_id !== item.id));
                        if (selectedZona?.id === item.id) setSelectedZona(undefined);
                        setSelectedElemento(undefined);
                        await deleteFromCloud('zona', item.id);
                        setNotification(`Zona "${item.codigo}" eliminada.`);
                      }
                      setTimeout(() => setNotification(null), 3500);
                    }}
                    className="flex-1 py-1.5 px-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-[11px]"
                  >
                    Sí, eliminar
                  </button>
                  <button
                    type="button"
                    onClick={() => setContextMenu(prev => (prev ? { ...prev, confirmDelete: false } : null))}
                    className="py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : contextMenu.editMode ? (
              <div className="p-3 space-y-2.5 bg-slate-950/80">
                {contextMenu.editMode === 'tag' && (
                  <>
                    <label className="text-[10px] font-bold text-slate-400 block uppercase">Tag / Código del Pin</label>
                    <input
                      type="text"
                      value={contextMenu.field1 || ''}
                      onChange={(e) => setContextMenu(prev => (prev ? { ...prev, field1: e.target.value } : null))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                      autoFocus
                    />
                  </>
                )}

                {contextMenu.editMode === 'hito_info' && (
                  <>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block uppercase mb-0.5">Código Hito</label>
                      <input
                        type="text"
                        value={contextMenu.field1 || ''}
                        onChange={(e) => setContextMenu(prev => (prev ? { ...prev, field1: e.target.value } : null))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block uppercase mb-0.5">Nombre</label>
                      <input
                        type="text"
                        value={contextMenu.field2 || ''}
                        onChange={(e) => setContextMenu(prev => (prev ? { ...prev, field2: e.target.value } : null))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs"
                      />
                    </div>
                  </>
                )}

                {contextMenu.editMode === 'hito_gps' && (
                  <>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block uppercase mb-0.5">Latitud</label>
                      <input
                        type="number"
                        step="any"
                        value={contextMenu.field1 || ''}
                        onChange={(e) => setContextMenu(prev => (prev ? { ...prev, field1: e.target.value } : null))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block uppercase mb-0.5">Longitud</label>
                      <input
                        type="number"
                        step="any"
                        value={contextMenu.field2 || ''}
                        onChange={(e) => setContextMenu(prev => (prev ? { ...prev, field2: e.target.value } : null))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                      />
                    </div>
                  </>
                )}

                <div className="flex items-center space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={async () => {
                      const { editMode, item, field1, field2 } = contextMenu;
                      if (editMode === 'tag') {
                        const nuevoTag = (field1 || '').trim().toUpperCase();
                        if (!nuevoTag) return;
                        const updated: Elemento = { ...item, tag_codigo: nuevoTag };
                        await db.elementos.put(updated);
                        setElementos(prev => prev.map(el => (el.id === updated.id ? updated : el)));
                        if (selectedElemento?.id === updated.id) setSelectedElemento(updated);
                        pushFastSyncToCloud({ includePlanImages: false, authoritativeZonas: false, authoritativeHitos: false }).catch(() => null);
                        setNotification(`Pin renombrado a "${updated.tag_codigo}".`);
                      } else if (editMode === 'hito_info') {
                        const nuevoCod = (field1 || '').trim().toUpperCase();
                        if (!nuevoCod) return;
                        const updated: HitoGeografico = { ...item, codigo: nuevoCod, nombre: (field2 || item.nombre).trim() };
                        markLocalEntityPendingPush('hito', updated.id);
                        await db.hitos.put(updated);
                        setHitos(prev => prev.map(h => (h.id === updated.id ? updated : h)));
                        if (selectedHito?.id === updated.id) setSelectedHito(updated);
                        pushFastSyncToCloud({ authoritativeHitos: true }).catch(() => null);
                        setNotification(`Hito GPS "${updated.codigo}" actualizado.`);
                      } else if (editMode === 'hito_gps') {
                        const newLat = Number(field1);
                        const newLng = Number(field2);
                        if (Number.isNaN(newLat) || Number.isNaN(newLng)) return;
                        const geoCal = getOrInitGeoreferencia(currentPlano, hitosPlano);
                        const newPixel = latLngToPixel(newLat, newLng, geoCal);
                        const updated: HitoGeografico = {
                          ...item,
                          lat: newLat,
                          lng: newLng,
                          coordenadas_plano: { x: Math.round(newPixel.x), y: Math.round(newPixel.y) }
                        };
                        markLocalEntityPendingPush('hito', updated.id);
                        await db.hitos.put(updated);
                        setHitos(prev => prev.map(h => (h.id === updated.id ? updated : h)));
                        if (selectedHito?.id === updated.id) setSelectedHito(updated);
                        pushFastSyncToCloud({ authoritativeHitos: true }).catch(() => null);
                        setNotification(`Coordenadas GPS de "${updated.codigo}" actualizadas.`);
                      }
                      setContextMenu(null);
                      setTimeout(() => setNotification(null), 3500);
                    }}
                    className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[11px]"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => setContextMenu(prev => (prev ? { ...prev, editMode: undefined } : null))}
                    className="py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                {contextMenu.type === 'elemento' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const elem: Elemento = contextMenu.item;
                        setContextMenu(null);
                        setRelocatingEntity({ type: 'elemento', item: elem });
                        setNotification(`Hacé clic en el plano para mover "${elem.tag_codigo}" (Esc para cancelar).`);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center space-x-2 text-emerald-300 font-semibold"
                    >
                      <span>🎯 Mover posición en el plano</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setContextMenu(prev =>
                          prev ? { ...prev, editMode: 'tag', field1: prev.item.tag_codigo } : null
                        )
                      }
                      className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center space-x-2"
                    >
                      <span>✏️ Editar Tag / Código</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const elem: Elemento = contextMenu.item;
                        setContextMenu(null);
                        handleSelectElemento(elem);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center space-x-2"
                    >
                      <span>📍 Ver / Editar GPS en Ficha</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const elem: Elemento = contextMenu.item;
                        setContextMenu(null);
                        handleOpenQRModal(elem);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center space-x-2"
                    >
                      <span>🔲 Etiqueta QR</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setContextMenu(prev => (prev ? { ...prev, confirmDelete: true } : null))}
                      className="w-full px-3 py-2 text-left hover:bg-red-950/60 text-red-400 flex items-center space-x-2 border-t border-slate-800 mt-1"
                    >
                      <span>🗑️ Eliminar Pin</span>
                    </button>
                  </>
                )}

                {contextMenu.type === 'hito' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const hito: HitoGeografico = contextMenu.item;
                        setContextMenu(null);
                        setRelocatingEntity({ type: 'hito', item: hito });
                        setNotification(`Hacé clic en el plano para mover Hito "${hito.codigo}" (Esc para cancelar).`);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center space-x-2 text-emerald-300 font-semibold"
                    >
                      <span>🎯 Mover posición en el plano</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setContextMenu(prev =>
                          prev
                            ? { ...prev, editMode: 'hito_info', field1: prev.item.codigo, field2: prev.item.nombre }
                            : null
                        )
                      }
                      className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center space-x-2"
                    >
                      <span>✏️ Editar Código / Nombre</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setContextMenu(prev =>
                          prev
                            ? {
                                ...prev,
                                editMode: 'hito_gps',
                                field1: String(prev.item.lat),
                                field2: String(prev.item.lng)
                              }
                            : null
                        )
                      }
                      className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center space-x-2"
                    >
                      <span>📍 Corregir Lat / Lng</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setContextMenu(prev => (prev ? { ...prev, confirmDelete: true } : null))}
                      className="w-full px-3 py-2 text-left hover:bg-red-950/60 text-red-400 flex items-center space-x-2 border-t border-slate-800 mt-1"
                    >
                      <span>🗑️ Eliminar Hito GPS</span>
                    </button>
                  </>
                )}

                {contextMenu.type === 'zona' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const z: ZonaInspeccion = contextMenu.item;
                        setContextMenu(null);
                        setRelocatingEntity({ type: 'zona', item: z });
                        setNotification(`Hacé clic en el plano para desplazar la Zona "${z.codigo}" (Esc para cancelar).`);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center space-x-2 text-emerald-300 font-semibold"
                    >
                      <span>🎯 Mover posición en el plano</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const z: ZonaInspeccion = contextMenu.item;
                        setContextMenu(null);
                        setZoneToEdit(z);
                        setIsEditZoneModalOpen(true);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center space-x-2"
                    >
                      <span>✏️ Editar Propiedades de Zona</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const z: ZonaInspeccion = contextMenu.item;
                        setContextMenu(null);
                        handleSelectZona(z);
                        setIsEditingZonePolygon(true);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center space-x-2"
                    >
                      <span>📐 Editar Vértices en Plano</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setContextMenu(prev => (prev ? { ...prev, confirmDelete: true } : null))}
                      className="w-full px-3 py-2 text-left hover:bg-red-950/60 text-red-400 flex items-center space-x-2 border-t border-slate-800 mt-1"
                    >
                      <span>🗑️ Eliminar Zona</span>
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Panel Lateral Drawer Flotante */}
        <ZoneDrawer
          zona={selectedZona}
          elemento={selectedElemento}
          currentPlano={currentPlano}
          hitos={hitosPlano}
          planos={planos}
          onClose={() => {
            setSelectedZona(undefined);
            setSelectedElemento(undefined);
          }}
          onOpenQRModal={handleOpenQRModal}
          onSelectPlano={(planoId) => {
            setSelectedPlanoId(planoId);
            const p = planos.find(pl => pl.id === planoId);
            if (p) setSelectedAreaId(p.area_id);
            setSelectedZona(undefined);
          }}
          onOpenUploadPlanModal={() => setIsUploadPlanModalOpen(true)}
          onAddVertexToZone={handleAddVertexToZone}
          onDeleteZone={handleDeleteZone}
          onDeleteElemento={async (elementoId) => {
            const target = elementos.find(el => el.id === elementoId);
            if (!target) return;
            if (!window.confirm(`¿Eliminar el pin "${target.tag_codigo}"?`)) return;
            await db.elementos.delete(elementoId);
            setElementos(prev => prev.filter(el => el.id !== elementoId));
            setSelectedElemento(undefined);
            await deleteFromCloud('elemento', elementoId);
            setNotification(`Pin "${target.tag_codigo}" eliminado.`);
            setTimeout(() => setNotification(null), 3000);
          }}
          isEditingPolygon={isEditingZonePolygon}
          onToggleEditPolygon={() => setIsEditingZonePolygon(prev => !prev)}
          onOpenEditZoneModal={(z) => {
            setZoneToEdit(z);
            setIsEditZoneModalOpen(true);
          }}
          onUpdateZoneData={handleZoneUpdated}
          onUpdateElementoData={async (updatedElem) => {
            await db.elementos.put(updatedElem);
            setElementos(prev => prev.map(el => el.id === updatedElem.id ? updatedElem : el));
            setSelectedElemento(updatedElem);
            setNotification(`Coordenadas de activo "${updatedElem.tag_codigo}" actualizadas.`);
            setTimeout(() => setNotification(null), 3000);
          }}
        />
      </div>

      {/* Modales Existentes */}
      <UploadPlanModal
        isOpen={isUploadPlanModalOpen}
        onClose={() => setIsUploadPlanModalOpen(false)}
        areas={areas}
        onPlanCreated={(newPlan, newArea) => {
          reloadFromDB();
          if (newArea) setSelectedAreaId(newArea.id);
          setSelectedPlanoId(newPlan.id);
          setIsUploadPlanModalOpen(false);
          pushFastSyncToCloud({ includePlanImages: true, authoritativeZonas: true });
          setNotification(`Plano "${newPlan.titulo}" cargado y sincronizado.`);
          setTimeout(() => setNotification(null), 3000);
        }}
      />

      <ReplacePlanFileModal
        isOpen={isReplacePlanModalOpen}
        onClose={() => setIsReplacePlanModalOpen(false)}
        currentPlano={currentPlano}
        onPlanReplaced={(updated) => {
          reloadFromDB();
          setIsReplacePlanModalOpen(false);
          pushFastSyncToCloud({ includePlanImages: true, authoritativeZonas: true });
          setNotification(`Archivo del plano actualizado a v${updated.version}.`);
          setTimeout(() => setNotification(null), 3000);
        }}
      />

      <CreateElementModal
        isOpen={isCreateElementModalOpen}
        onClose={() => {
          setIsCreateElementModalOpen(false);
          setPendingPinCoords(null);
        }}
        coordinates={pendingPinCoords}
        zonas={zonasPlano}
        currentPlanoId={selectedPlanoId}
        onElementCreated={(newElem) => {
          reloadFromDB();
          setSelectedElemento(newElem);
          setIsCreateElementModalOpen(false);
          setPendingPinCoords(null);
          setNotification(`Activo "${newElem.tag_codigo}" registrado.`);
          setTimeout(() => setNotification(null), 3000);
        }}
      />

      <CreateZoneModal
        isOpen={isCreateZoneModalOpen}
        onClose={() => {
          setIsCreateZoneModalOpen(false);
          setCustomPolygonPoints(undefined);
          setDefaultAreaForNewZone(undefined);
        }}
        currentPlanoId={selectedPlanoId}
        currentPlano={currentPlano}
        hitos={hitosPlano}
        defaultPoints={customPolygonPoints}
        defaultAreaPlanta={defaultAreaForNewZone}
        onZoneCreated={(newZone) => {
          markLocalEntityPendingPush('zona', newZone.id);
          reloadFromDB();
          setSelectedZona(newZone);
          setIsCreateZoneModalOpen(false);
          setCustomPolygonPoints(undefined);
          setDefaultAreaForNewZone(undefined);
          pushFastSyncToCloud({ authoritativeZonas: true });
          setNotification(`Zona "${newZone.codigo}" creada y sincronizada con la nube.`);
          setTimeout(() => setNotification(null), 3000);
        }}
      />

      <AreasManagerModal
        isOpen={isAreasModalOpen}
        onClose={() => setIsAreasModalOpen(false)}
        areas={areas}
        zonas={zonas}
        currentPlanoId={selectedPlanoId}
        onUpdated={reloadFromDB}
        onStartDrawZoneInArea={(areaNombre) => {
          setDefaultAreaForNewZone(areaNombre);
          setActiveMode('add_zone');
          setNotification(`Trazá los vértices de la nueva zona para el área "${areaNombre}" sobre el plano.`);
        }}
        onOpenCreateZoneInArea={(areaNombre) => {
          setDefaultAreaForNewZone(areaNombre);
          setCustomPolygonPoints(undefined);
          setIsCreateZoneModalOpen(true);
        }}
      />

      <CreateHitoModal
        isOpen={isCreateHitoModalOpen}
        onClose={() => {
          setIsCreateHitoModalOpen(false);
          setPendingHitoCoords(null);
        }}
        coordinates={pendingHitoCoords}
        currentPlano={currentPlano}
        onHitoCreated={(newHito) => {
          markLocalEntityPendingPush('hito', newHito.id);
          reloadFromDB();
          setSelectedHito(newHito);
          setIsCreateHitoModalOpen(false);
          setPendingHitoCoords(null);
          pushFastSyncToCloud({ authoritativeHitos: true });
          setNotification(`Hito Geográfico "${newHito.codigo}" georreferenciado y sincronizado.`);
          setTimeout(() => setNotification(null), 4000);
        }}
      />

      <EditZoneModal
        isOpen={isEditZoneModalOpen}
        onClose={() => {
          setIsEditZoneModalOpen(false);
          setZoneToEdit(undefined);
        }}
        zona={zoneToEdit}
        onZoneUpdated={handleZoneUpdated}
      />

      {selectedElemento && (
        <QRLabelGeneratorModal
          isOpen={isQRModalOpen}
          onClose={() => setIsQRModalOpen(false)}
          elemento={selectedElemento}
        />
      )}

      <ReporteRelevamientoModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        area={currentArea}
        plano={currentPlano}
        elementos={elementos}
        inspecciones={inspecciones}
      />

      <HitosMapsModal
        isOpen={isHitosModalOpen}
        onClose={() => setIsHitosModalOpen(false)}
        currentPlano={currentPlano}
      />

      <SyncComparatorModal
        isOpen={isSyncComparatorOpen}
        onClose={() => setIsSyncComparatorOpen(false)}
        onSyncCompleted={() => reloadFromDB()}
      />
    </div>
  );
}
