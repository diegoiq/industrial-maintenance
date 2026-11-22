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
  Plus
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
import { db } from '../../../lib/db';
import { getSyncRequestHeaders } from '../../../lib/security';
import { pushFastSyncToCloud, deleteFromCloud, pullAndReconcileFromCloud } from '../../../lib/cloudSync';
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

  // Menú desplegable "Más opciones" en topbar
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

    // Purgar áreas semilla ficticias (131, 411, 471) que no tengan ningún plano vinculado
    if (loadedPlanos.length > 0) {
      const usedAreaIds = new Set(loadedPlanos.map(p => p.area_id));
      for (const a of loadedAreas) {
        if (!usedAreaIds.has(a.id) && ['131', '411', '471'].includes(a.codigo)) {
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
    reloadFromDB();
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
    if (filtroNivel === 'todos') return true;
    return String(z.cota_nivel || 146000) === filtroNivel;
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

  const handleMapClick = (coords: { x: number; y: number }) => {
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
      const localPlanos = await db.planos.toArray();
      const needsImageUpload = localPlanos.some(p => !p.archivo_original_url && !!p.archivo_data_url);
      const data = await pushFastSyncToCloud({
        includePlanImages: needsImageUpload,
        authoritativeZonas: true,
        authoritativeHitos: true
      });
      await pullAndReconcileFromCloud();
      await reloadFromDB();

      if (data.success) {
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

          {/* Filtro de Cota/Nivel Compacto */}
          <select
            value={filtroNivel}
            onChange={(e) => setFiltroNivel(e.target.value)}
            className="hidden sm:inline-block bg-slate-950 border border-slate-700 text-amber-400 font-mono text-[11px] rounded-md px-2 py-1 focus:outline-none"
            title="Filtrar Zonas por Cota / Nivel"
          >
            <option value="todos">Niveles: Todos</option>
            <option value="146000">+146.000 m (Suelo)</option>
            <option value="152000">+152.000 m (+6m)</option>
            <option value="158000">+158.000 m (+12m)</option>
            <option value="170000">+170.000 m (+24m)</option>
          </select>
        </div>

        {/* Lado Derecho: Sync Nube, Subir Plano y Menú de Gestión */}
        <div className="flex items-center space-x-1.5 flex-shrink-0">
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
          onToggleEditPolygon={() => setIsEditingZonePolygon(prev => !prev)}
        />

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
          setNotification(`Plano "${newPlan.titulo}" cargado exitosamente.`);
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
        }}
        currentPlanoId={selectedPlanoId}
        defaultPoints={customPolygonPoints}
        onZoneCreated={(newZone) => {
          reloadFromDB();
          setSelectedZona(newZone);
          setIsCreateZoneModalOpen(false);
          setCustomPolygonPoints(undefined);
          pushFastSyncToCloud({ authoritativeZonas: true });
          setNotification(`Zona "${newZone.codigo}" creada y sincronizada con la nube.`);
          setTimeout(() => setNotification(null), 3000);
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
    </div>
  );
}
