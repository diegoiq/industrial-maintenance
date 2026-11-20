'use client';

import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Map as MapIcon, 
  Upload, 
  Plus, 
  Filter, 
  QrCode, 
  Layers, 
  CheckCircle2, 
  AlertCircle,
  FileCode2,
  HardHat,
  Crosshair,
  MousePointer,
  Trash2,
  DownloadCloud,
  FileDown,
  FileSpreadsheet,
  Globe,
  RefreshCw,
  CloudUpload,
  Cloud
} from 'lucide-react';
import { InteractivePlantMap } from '../../../components/ingenieria/InteractivePlantMap';
import { ZoneDrawer } from '../../../components/ingenieria/ZoneDrawer';
import { QRLabelGeneratorModal } from '../../../components/ingenieria/QRLabelGeneratorModal';
import { UploadPlanModal } from '../../../components/ingenieria/UploadPlanModal';
import { ReplacePlanFileModal } from '../../../components/ingenieria/ReplacePlanFileModal';
import { CreateElementModal } from '../../../components/ingenieria/CreateElementModal';
import { CreateZoneModal } from '../../../components/ingenieria/CreateZoneModal';
import { EditZoneModal } from '../../../components/ingenieria/EditZoneModal';
import { ReporteRelevamientoModal } from '../../../components/campo/ReporteRelevamientoModal';
import { HitosMapsModal } from '../../../components/ingenieria/HitosMapsModal';
import { db } from '../../../lib/db';
import { Area, Plano, ZonaInspeccion, Elemento, Inspeccion } from '../../../types';

export default function PlanosIngenieriaPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [zonas, setZonas] = useState<ZonaInspeccion[]>([]);
  const [elementos, setElementos] = useState<Elemento[]>([]);
  const [inspecciones, setInspecciones] = useState<Inspeccion[]>([]);

  const [selectedAreaId, setSelectedAreaId] = useState<string>('');
  const [selectedPlanoId, setSelectedPlanoId] = useState<string>('');
  const [selectedZona, setSelectedZona] = useState<ZonaInspeccion | undefined>(undefined);
  const [selectedElemento, setSelectedElemento] = useState<Elemento | undefined>(undefined);

  // Modos del Editor de Planta: inspect (navegar y drawer), add_pin (colocar pin con clic), add_zone
  const [activeMode, setActiveMode] = useState<'inspect' | 'add_pin' | 'add_zone'>('inspect');

  // Modales
  const [isUploadPlanModalOpen, setIsUploadPlanModalOpen] = useState(false);
  const [isReplacePlanModalOpen, setIsReplacePlanModalOpen] = useState(false);
  const [isCreateElementModalOpen, setIsCreateElementModalOpen] = useState(false);
  const [isCreateZoneModalOpen, setIsCreateZoneModalOpen] = useState(false);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isHitosModalOpen, setIsHitosModalOpen] = useState(false);
  const [targetElementForQR, setTargetElementForQR] = useState<Elemento | null>(null);
  const [clickCoordinates, setClickCoordinates] = useState<{ x: number; y: number } | null>(null);
  const [customPolygonPoints, setCustomPolygonPoints] = useState<{ x: number; y: number }[] | null>(null);
  const [isEditingZonePolygon, setIsEditingZonePolygon] = useState<boolean>(false);
  const [isEditZoneModalOpen, setIsEditZoneModalOpen] = useState<boolean>(false);
  const [zoneToEdit, setZoneToEdit] = useState<ZonaInspeccion | undefined>(undefined);

  // Filtro de semáforo y Cota/Nivel Multinivel
  const [filtroSemaforo, setFiltroSemaforo] = useState<string>('todos');
  const [filtroNivel, setFiltroNivel] = useState<string>('todos');
  const [notification, setNotification] = useState<string | null>(null);

  // Cargar datos persistentes desde IndexedDB
  const reloadFromDB = async () => {
    const loadedAreas = await db.areas.toArray();
    const loadedPlanos = await db.planos.toArray();
    const loadedZonas = await db.zonas.toArray();
    const loadedElementos = await db.elementos.toArray();
    const loadedInspecciones = await db.inspecciones.toArray();

    setAreas(loadedAreas);
    setPlanos(loadedPlanos);
    setZonas(loadedZonas);
    setElementos(loadedElementos);
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
  const zonasPlano = zonas.filter(z => currentPlano ? z.plano_id === currentPlano.id : true);
  const elementosPlano = elementos.filter(e => {
    // Si la zona pertenece al plano o no hay zona asignada
    const zona = zonas.find(z => z.id === e.zona_id);
    return currentPlano ? (!zona || zona.plano_id === currentPlano.id) : true;
  });

  const zonasFiltradas = zonasPlano.filter(z => {
    if (filtroNivel === 'todos') return true;
    return String(z.cota_nivel || 146000) === filtroNivel;
  });

  const elementosFiltrados = elementosPlano.filter(e => {
    if (filtroSemaforo !== 'todos' && e.estado_actual !== filtroSemaforo) return false;
    if (filtroNivel !== 'todos') {
      const zona = zonas.find(z => z.id === e.zona_id);
      const cota = e.cota_nivel || zona?.cota_nivel || 146000;
      return String(cota) === filtroNivel;
    }
    return true;
  });

  // Manejo de clic en el mapa según el modo
  const handleMapClick = (coords: { x: number; y: number }) => {
    setClickCoordinates(coords);
    if (activeMode === 'add_pin') {
      setIsCreateElementModalOpen(true);
    } else if (activeMode === 'add_zone') {
      setIsCreateZoneModalOpen(true);
    }
  };

  const handleSelectZona = (zona: ZonaInspeccion) => {
    setSelectedZona(zona);
    setIsEditingZonePolygon(false); // Inicia bloqueado para que no se muevan los vértices accidentalmente
    const primerElementoDeZona = elementos.find(e => e.zona_id === zona.id);
    if (primerElementoDeZona) {
      setSelectedElemento(primerElementoDeZona);
    }
  };

  const handleSelectElemento = (elem: Elemento) => {
    setSelectedElemento(elem);
    const zonaElem = zonas.find(z => z.id === elem.zona_id);
    if (zonaElem) {
      setSelectedZona(zonaElem);
    }
  };

  const handleOpenQRModal = (elem: Elemento) => {
    setTargetElementForQR(elem);
    setIsQRModalOpen(true);
  };

  // Callback al crear un plano
  const handlePlanCreated = async (newPlano: Plano, newArea?: Area) => {
    await reloadFromDB();
    if (newArea) {
      setSelectedAreaId(newArea.id);
    }
    setSelectedPlanoId(newPlano.id);
    setNotification(`¡Plano "${newPlano.titulo}" cargado exitosamente! Ahora puedes colocar pines y delimitar zonas.`);
    setTimeout(() => setNotification(null), 5000);
  };

  // Callback al reemplazar el archivo/fondo de un plano existente conservando zonas
  const handlePlanReplaced = async (updatedPlano: Plano) => {
    await reloadFromDB();
    setSelectedPlanoId(updatedPlano.id);
    setNotification(`Archivo del plano "${updatedPlano.titulo}" actualizado exitosamente. Todas tus zonas y pines se conservan intactos.`);
    setTimeout(() => setNotification(null), 5000);
  };

  // Callback al crear un elemento
  const handleElementCreated = async (newElem: Elemento) => {
    await reloadFromDB();
    setSelectedElemento(newElem);
    setActiveMode('inspect');
    setNotification(`Activo "${newElem.tag_codigo}" colocado en el plano con código QR generado.`);
    setTimeout(() => setNotification(null), 4000);
  };

  // Callback al crear una zona
  const handleZoneCreated = async (newZone: ZonaInspeccion) => {
    await reloadFromDB();
    setSelectedZona(newZone);
    setActiveMode('inspect');
    setCustomPolygonPoints(null);
    setNotification(`Zona "${newZone.codigo} - ${newZone.nombre}" trazada en el plano. Ahora puedes ajustar sus vértices arrastrándolos.`);
    setTimeout(() => setNotification(null), 4000);
  };

  // Callback para actualizar los vértices arrastrados en el plano
  const handleUpdateZonePolygon = async (zonaId: string, nuevosPuntos: { x: number; y: number }[]) => {
    await db.zonas.update(zonaId, {
      poligono_svg: { puntos: nuevosPuntos }
    });
    setZonas(prev => prev.map(z => z.id === zonaId ? { ...z, poligono_svg: { puntos: nuevosPuntos } } : z));
    if (selectedZona?.id === zonaId) {
      setSelectedZona(prev => prev ? { ...prev, poligono_svg: { puntos: nuevosPuntos } } : prev);
    }
  };

  // Añadir un vértice adicional a una zona seleccionada desde el Drawer
  const handleAddVertexToZone = async (zonaId: string) => {
    const targetZona = zonas.find(z => z.id === zonaId);
    if (!targetZona?.poligono_svg?.puntos || targetZona.poligono_svg.puntos.length < 3) return;
    const pts = targetZona.poligono_svg.puntos;
    const p1 = pts[pts.length - 1];
    const p2 = pts[0];
    const newPt = {
      x: Math.round((p1.x + p2.x) / 2),
      y: Math.round((p1.y + p2.y) / 2)
    };
    const nuevosPuntos = [...pts, newPt];
    await handleUpdateZonePolygon(zonaId, nuevosPuntos);
    setNotification(`Vértice P${nuevosPuntos.length} añadido a la zona "${targetZona.nombre}". Arrástralo en el plano para darle forma.`);
    setTimeout(() => setNotification(null), 3000);
  };

  // Eliminar una zona de inspección
  const handleDeleteZone = async (zonaId: string) => {
    await db.zonas.delete(zonaId);
    if (selectedZona?.id === zonaId) {
      setSelectedZona(undefined);
    }
    await reloadFromDB();
    setNotification("Zona de inspección eliminada correctamente.");
    setTimeout(() => setNotification(null), 3000);
  };

  // Callback cuando se finaliza el trazado libre o rectángulo inicial
  const handlePolygonCreated = (puntos: { x: number; y: number }[]) => {
    setCustomPolygonPoints(puntos);
    setIsCreateZoneModalOpen(true);
    setActiveMode('inspect');
  };

  // Callback cuando se editan los datos y cálculo de andamios de una zona
  const handleZoneUpdated = async (updatedZone: ZonaInspeccion) => {
    await db.zonas.put(updatedZone);
    setZonas(prev => prev.map(z => z.id === updatedZone.id ? updatedZone : z));
    if (selectedZona?.id === updatedZone.id) {
      setSelectedZona(updatedZone);
    }
    setNotification(`Zona "${updatedZone.codigo}" y cálculo de andamio actualizados exitosamente.`);
    setTimeout(() => setNotification(null), 4000);
  };

  // Eliminar únicamente el plano actual con advertencia clara
  const handleDeleteCurrentPlano = async () => {
    if (!currentPlano) return;
    const zonasDelPlano = zonas.filter(z => z.plano_id === currentPlano.id);
    const pinesDelPlano = elementos.filter(e => {
      const z = zonas.find(zona => zona.id === e.zona_id);
      return z ? z.plano_id === currentPlano.id : true;
    });

    const confirmMsg = `¿Deseas eliminar ÚNICAMENTE el plano:\n"${currentPlano.titulo}"?\n\n` +
      `• Zonas en este plano: ${zonasDelPlano.length}\n` +
      `• Activos mapeados: ${pinesDelPlano.length}\n\n` +
      `NOTA DE SEGURIDAD: Todos los demás planos y áreas de la planta permanecerán intactos sin borrarse.`;

    if (window.confirm(confirmMsg)) {
      await db.planos.delete(currentPlano.id);
      for (const z of zonasDelPlano) {
        await db.zonas.delete(z.id);
        await db.elementos.where('zona_id').equals(z.id).delete();
      }
      await reloadFromDB();
      setSelectedPlanoId('');
      setNotification(`Plano "${currentPlano.titulo}" eliminado con éxito.`);
      setTimeout(() => setNotification(null), 4000);
    }
  };

  // Limpiar y resetear todos los datos de planta a cero (Hard Reset)
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
      setNotification("Se limpiaron todos los datos. La planta está lista para cargar planos nuevos desde cero.");
      setTimeout(() => setNotification(null), 4000);
    }
  };

  // Exportar configuración completa a JSON para backup o compartir
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
    setNotification("Respaldo de planta exportado en formato JSON.");
    setTimeout(() => setNotification(null), 3000);
  };

  // Sincronización completa con Neon PostgreSQL y Backblaze B2 Storage
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);

  const handleSyncToCloud = async () => {
    try {
      setIsSyncingCloud(true);
      const allAreas = await db.areas.toArray();
      const allPlanos = await db.planos.toArray();
      const allZonas = await db.zonas.toArray();
      const allElementos = await db.elementos.toArray();
      const allInspecciones = await db.inspecciones.toArray();

      const res = await fetch('/api/sync-neon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          areas: allAreas,
          planos: allPlanos,
          zonas: allZonas,
          elementos: allElementos,
          inspecciones: allInspecciones
        })
      });

      const data = await res.json();
      if (data.success) {
        setNotification(`¡Sincronizado con Neon y Backblaze B2! (${data.synced?.planos || 0} planos, ${data.synced?.zonas || 0} zonas, ${data.synced?.elementos || 0} activos respaldados en la nube).`);
      } else {
        alert("Error en sincronización: " + (data.error || "Desconocido"));
      }
    } catch (err: any) {
      alert("Error de conexión al sincronizar con la nube: " + err?.message);
    } finally {
      setIsSyncingCloud(false);
      setTimeout(() => setNotification(null), 5000);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      {/* Barra Superior de Control de Planta y Modos */}
      <header className="px-6 py-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          {/* Selector de Área */}
          <div className="flex items-center space-x-2">
            <Building2 className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-bold text-slate-400 uppercase">Área / Nave:</span>
            {areas.length > 0 ? (
              <select
                value={selectedAreaId}
                onChange={(e) => {
                  setSelectedAreaId(e.target.value);
                  const planosDeArea = planos.filter(p => p.area_id === e.target.value);
                  if (planosDeArea.length > 0) setSelectedPlanoId(planosDeArea[0].id);
                }}
                className="bg-slate-950 border border-slate-700 text-xs font-bold text-white rounded-lg px-2.5 py-1.5 focus:border-amber-400 focus:outline-none"
              >
                {areas.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.codigo} - {a.nombre}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-slate-500 italic">Sin áreas aún</span>
            )}
          </div>

          {/* Selector de Plano */}
          <div className="flex items-center space-x-2">
            <MapIcon className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-bold text-slate-400 uppercase">Plano:</span>
            {planos.length > 0 ? (
              <div className="flex items-center space-x-1.5">
                <select
                  value={selectedPlanoId}
                  onChange={(e) => {
                    const target = planos.find(p => p.id === e.target.value);
                    if (target) {
                      setSelectedPlanoId(target.id);
                      setSelectedAreaId(target.area_id);
                    }
                  }}
                  className="bg-slate-950 border border-slate-700 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:border-sky-400 focus:outline-none max-w-xs truncate font-medium"
                >
                  {planos.map(p => {
                    const areaDelPlano = areas.find(a => a.id === p.area_id);
                    const zonasCount = zonas.filter(z => z.plano_id === p.id).length;
                    const pinesCount = elementos.filter(e => {
                      const z = zonas.find(zona => zona.id === e.zona_id);
                      return z ? z.plano_id === p.id : true;
                    }).length;
                    const iconEmoji = p.tipo_plano === 'layout_general' ? '🗺️' : p.tipo_plano === 'elevacion_isometrico' ? '📐' : '🏢';
                    return (
                      <option key={p.id} value={p.id}>
                        {iconEmoji} {p.titulo} ({pinesCount} activos, {zonasCount} zonas) {areaDelPlano ? `· [${areaDelPlano.nombre}]` : ''}
                      </option>
                    );
                  })}
                </select>
                <button
                  type="button"
                  onClick={() => setIsReplacePlanModalOpen(true)}
                  disabled={!currentPlano}
                  className="flex items-center space-x-1 px-2.5 py-1.5 bg-slate-950 hover:bg-slate-800 text-sky-400 hover:text-sky-300 rounded-lg border border-sky-500/40 text-xs font-bold transition shadow disabled:opacity-30"
                  title="Reemplazar el archivo o fondo de este plano por un nuevo .DXF o PDF Ultra HD (tus zonas y pines se conservan intactos)"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reemplazar Archivo (DXF)</span>
                </button>
                <button
                  type="button"
                  onClick={handleDeleteCurrentPlano}
                  disabled={!currentPlano}
                  className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-950/40 rounded border border-slate-800 transition disabled:opacity-30"
                  title="Eliminar únicamente este plano (los demás planos y áreas se conservan intactos)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <span className="text-xs text-slate-500 italic">Sin planos cargados</span>
            )}
          </div>

          {/* Botón Principal para Subir Plano */}
          <button
            type="button"
            onClick={() => setIsUploadPlanModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-lg shadow transition"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Subir Plano / Nueva Área</span>
          </button>
        </div>

        {/* Selector de Modo de Interacción en el Plano */}
        <div className="flex items-center space-x-2 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setActiveMode('inspect')}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded font-semibold transition ${
              activeMode === 'inspect' ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-400 hover:text-white'
            }`}
            title="Modo Consulta: Navega y haz clic en pines para ver su ficha técnica"
          >
            <MousePointer className="w-3.5 h-3.5" />
            <span>Inspeccionar</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('add_pin')}
            disabled={!currentPlano}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded font-semibold transition disabled:opacity-40 ${
              activeMode === 'add_pin' ? 'bg-amber-500 text-black font-bold' : 'text-amber-400 hover:bg-slate-900'
            }`}
            title="Haz clic sobre el plano para colocar un nuevo Pin de Activo"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>+ Colocar Pin Activo</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('add_zone')}
            disabled={!currentPlano}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded font-semibold transition disabled:opacity-40 ${
              activeMode === 'add_zone' ? 'bg-sky-500 text-black font-bold' : 'text-sky-400 hover:bg-slate-900'
            }`}
            title="Haz clic sobre el plano para crear una Zona de Inspección"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>+ Crear Zona</span>
          </button>
        </div>

        {/* Acciones de gestión, Hitos Maps, Reporte y Backup */}
        <div className="flex items-center space-x-2 text-xs">
          <button
            type="button"
            onClick={() => setIsHitosModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-lg shadow transition"
            title="Gestionar hitos geográficos y puntos de referencia desde Google Maps"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Hitos Maps (GPS)</span>
          </button>

          <button
            type="button"
            onClick={handleSyncToCloud}
            disabled={isSyncingCloud}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-extrabold text-xs rounded-lg shadow transition"
            title="Sincronizar planos, zonas y activos locales con Neon PostgreSQL y Backblaze B2"
          >
            <CloudUpload className={`w-3.5 h-3.5 ${isSyncingCloud ? 'animate-bounce' : ''}`} />
            <span>{isSyncingCloud ? 'Sincronizando...' : 'Sincronizar Nube'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsReportModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs rounded-lg shadow transition"
            title="Generar e imprimir informe técnico ejecutivo de relevamiento"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Generar Reporte</span>
          </button>

          <button
            type="button"
            onClick={handleExportPlantJSON}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded border border-slate-800"
            title="Exportar respaldo de planta (JSON)"
          >
            <FileDown className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleWipeData}
            className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-950/50 rounded border border-slate-800"
            title="Vaciar datos y empezar desde cero"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Banner de Notificaciones */}
      {notification && (
        <div className="bg-emerald-950/90 border-b border-emerald-500/50 px-6 py-2 text-emerald-200 text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Área Central: Plano SVG Interactivo + Panel Lateral Drawer */}
      <div className="flex-1 flex overflow-hidden">
        {/* Contenedor del Plano */}
        <div className="flex-1 p-6 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-white tracking-tight flex items-center space-x-2">
                  <span>{currentPlano ? currentPlano.titulo : "Visor de Planta y Relevamiento"}</span>
                  {currentPlano && (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800">
                      v{currentPlano.version} · {currentPlano.dimensiones_viewbox.width}x{currentPlano.dimensiones_viewbox.height}
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {activeMode === 'add_pin' 
                    ? '👉 Haz clic en cualquier punto del plano para colocar un nuevo Pin de Activo físico (viga, columna, baranda, etc.).'
                    : activeMode === 'add_zone'
                    ? '👉 Haz clic en el plano para definir los vértices de una nueva Zona de Inspección con requerimientos de andamio.'
                    : 'Modo Inspección: Selecciona una zona o pin para consultar su ficha técnica, historial y generar su etiqueta QR.'}
                </p>
              </div>

              {/* Filtro de Nivel / Cota y Métricas Rápidas */}
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
                  <span className="text-slate-400 font-bold uppercase text-[10px]">Cota / Nivel:</span>
                  <select
                    value={filtroNivel}
                    onChange={(e) => setFiltroNivel(e.target.value)}
                    className="bg-slate-950 border border-slate-700 text-amber-400 font-mono font-bold text-xs rounded px-2 py-1 focus:outline-none"
                  >
                    <option value="todos">🏢 Todos los Niveles (Multicapa)</option>
                    <option value="146000">🟢 Cota +146.000 m (Nivel Suelo Base)</option>
                    <option value="152000">🟡 Cota +152.000 m (+6.00 m Pasarelas)</option>
                    <option value="158000">🟠 Cota +158.000 m (+12.00 m Operación)</option>
                    <option value="170000">🔴 Cota +170.000 m (+24.00 m Nivel Superior)</option>
                  </select>
                </div>

                <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
                  <span className="text-slate-400 block text-[10px]">Activos Visibles</span>
                  <span className="font-mono font-bold text-white">{elementosFiltrados.length} Activos</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
                  <span className="text-slate-400 block text-[10px]">Zonas Visibles</span>
                  <span className="font-mono font-bold text-sky-400">{zonasFiltradas.length} Zonas</span>
                </div>
              </div>
            </div>

            {/* Componente del Visor SVG Interactivo */}
            <InteractivePlantMap
              plano={currentPlano}
              zonas={zonasFiltradas}
              elementos={elementosFiltrados}
              selectedZonaId={selectedZona?.id}
              selectedElementoId={selectedElemento?.id}
              activeMode={activeMode}
              onSelectZona={handleSelectZona}
              onSelectElemento={handleSelectElemento}
              onMapClick={handleMapClick}
              onOpenUploadModal={() => setIsUploadPlanModalOpen(true)}
              onPlanUpdated={() => reloadFromDB()}
              onUpdateZonePolygon={handleUpdateZonePolygon}
              onPolygonCreated={handlePolygonCreated}
              isEditingPolygon={isEditingZonePolygon}
              onToggleEditPolygon={() => setIsEditingZonePolygon(prev => !prev)}
            />
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-slate-500 border-t border-slate-800/80 pt-3">
            <span>Soporta planos generales de fábrica en SVG, DXF/CAD o planos arquitectónicos escaneados (PNG/JPG).</span>
            <span className="font-mono">Persistencia activa en IndexedDB</span>
          </div>
        </div>

        {/* Panel Lateral Drawer con Métricas en Vivo y Drill-down */}
        <ZoneDrawer
          zona={selectedZona}
          elemento={selectedElemento}
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
        />
      </div>

      {/* Modal para Subir Plano y Crear Áreas */}
      <UploadPlanModal
        isOpen={isUploadPlanModalOpen}
        onClose={() => setIsUploadPlanModalOpen(false)}
        areas={areas}
        onPlanCreated={handlePlanCreated}
      />

      {/* Modal para Reemplazar Archivo del Plano Actual conservando zonas y pines */}
      <ReplacePlanFileModal
        isOpen={isReplacePlanModalOpen}
        onClose={() => setIsReplacePlanModalOpen(false)}
        currentPlano={currentPlano}
        onPlanReplaced={handlePlanReplaced}
      />

      {/* Modal para Colocar Pin de Activo */}
      <CreateElementModal
        isOpen={isCreateElementModalOpen}
        onClose={() => {
          setIsCreateElementModalOpen(false);
          setClickCoordinates(null);
          setCustomPolygonPoints(null);
        }}
        coordinates={clickCoordinates}
        zonas={zonasPlano}
        currentPlanoId={selectedPlanoId}
        onElementCreated={handleElementCreated}
      />

      {/* Modal para Crear Zona de Inspección */}
      <CreateZoneModal
        isOpen={isCreateZoneModalOpen}
        onClose={() => {
          setIsCreateZoneModalOpen(false);
          setClickCoordinates(null);
          setCustomPolygonPoints(null);
        }}
        currentPlanoId={selectedPlanoId}
        defaultPoints={customPolygonPoints || (clickCoordinates ? [
          { x: clickCoordinates.x - 150, y: clickCoordinates.y - 100 },
          { x: clickCoordinates.x + 150, y: clickCoordinates.y - 100 },
          { x: clickCoordinates.x + 150, y: clickCoordinates.y + 100 },
          { x: clickCoordinates.x - 150, y: clickCoordinates.y + 100 }
        ] : undefined)}
        onZoneCreated={handleZoneCreated}
      />

      {/* Modal para Editar Datos de la Zona y Cálculo de Andamio */}
      <EditZoneModal
        isOpen={isEditZoneModalOpen}
        onClose={() => {
          setIsEditZoneModalOpen(false);
          setZoneToEdit(undefined);
        }}
        zona={zoneToEdit || selectedZona}
        onZoneUpdated={handleZoneUpdated}
      />

      {/* Modal Generador e Impresor de Etiquetas QR */}
      <QRLabelGeneratorModal
        elemento={targetElementForQR}
        isOpen={isQRModalOpen}
        onClose={() => {
          setIsQRModalOpen(false);
          setTargetElementForQR(null);
        }}
      />

      {/* Modal de Reporte Ejecutivo de Relevamiento */}
      <ReporteRelevamientoModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        area={currentArea}
        elementos={elementosPlano}
        inspecciones={inspecciones}
        plano={currentPlano}
      />

      {/* Modal de Gestión de Hitos Geográficos Maps (Admin) */}
      <HitosMapsModal
        isOpen={isHitosModalOpen}
        onClose={() => setIsHitosModalOpen(false)}
        currentPlano={currentPlano}
        onHitosUpdated={() => reloadFromDB()}
      />
    </div>
  );
}
