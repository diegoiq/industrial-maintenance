'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Camera, 
  QrCode, 
  DownloadCloud, 
  Save, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  HardHat, 
  Clock, 
  ChevronRight,
  ArrowLeft,
  Sparkles,
  Info,
  TrendingUp,
  FileSpreadsheet,
  MapPin,
  Navigation,
  Map as MapIcon,
  Globe,
  X
} from 'lucide-react';
import { db } from '../../lib/db';
import { compressInspectionPhoto, CompressedResult } from '../../lib/imageCompression';
import { syncManager } from '../../lib/syncManager';
import { SyncStatusBadge } from '../../components/campo/SyncStatusBadge';
import { VectorAnnotationCanvas } from '../../components/campo/VectorAnnotationCanvas';
import { QRScannerModal } from '../../components/campo/QRScannerModal';
import { ReporteRelevamientoModal } from '../../components/campo/ReporteRelevamientoModal';
import { AjustarZonaCampoModal } from '../../components/campo/AjustarZonaCampoModal';
import { 
  INITIAL_AREAS, 
  INITIAL_PLANOS, 
  INITIAL_ZONAS, 
  INITIAL_ELEMENTOS 
} from '../../lib/mockData';
import { Elemento, Area, Inspeccion, VectorAnnotation, FotoInspeccionLocal, Plano, TipoElemento, ZonaInspeccion } from '../../types';

export default function CampoPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [zonas, setZonas] = useState<ZonaInspeccion[]>([]);
  const [elementos, setElementos] = useState<Elemento[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string>('');
  const [selectedPlanoId, setSelectedPlanoId] = useState<string>('');
  const [selectedElemento, setSelectedElemento] = useState<Elemento | null>(null);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isAjustarZonaModalOpen, setIsAjustarZonaModalOpen] = useState(false);
  const [isDownloadingArea, setIsDownloadingArea] = useState(false);
  const [downloadSuccessMsg, setDownloadSuccessMsg] = useState('');
  const [viewMode, setViewMode] = useState<'lista' | 'mapa'>('lista');

  // Coordenadas GPS Satelital de Terreno
  const [gpsData, setGpsData] = useState<{ lat: number; lng: number; precision_m: number } | null>(null);
  const [isGettingGps, setIsGettingGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Capturar posición GPS física del inspector
  const handleCaptureGPS = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGpsError("Tu dispositivo no soporta geolocalización satelital.");
      return;
    }
    setIsGettingGps(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsData({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          precision_m: Math.round(pos.coords.accuracy)
        });
        setIsGettingGps(false);
      },
      (err) => {
        setGpsError("Señal GPS débil o permiso denegado: " + err.message);
        setIsGettingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  // Estados del formulario de inspección
  const [sustrato, setSustrato] = useState('acero_al_carbono');
  const [recubrimiento, setRecubrimiento] = useState('epoxi_poliamida');
  const [gradoCorrosion, setGradoCorrosion] = useState('Ri 3');
  const [porcentajeAfectado, setPorcentajeAfectado] = useState<number>(20);
  const [requiereReemplazo, setRequiereReemplazo] = useState(false);
  const [observaciones, setObservaciones] = useState('');

  // Filtro de Cota y Modal de Reportar Hallazgo en Terreno
  const [cotaFiltro, setCotaFiltro] = useState<string>('todos');
  const [isFieldPinModalOpen, setIsFieldPinModalOpen] = useState(false);
  const [fieldTag, setFieldTag] = useState('');
  const [fieldDisciplina, setFieldDisciplina] = useState<TipoElemento>('acero_estructural');
  const [fieldCota, setFieldCota] = useState<number>(146000);

  // Estimación de Andamio en Campo para el Activo
  const [requiereAndamioCampo, setRequiereAndamioCampo] = useState(false);
  const [tipoAccesoCampo, setTipoAccesoCampo] = useState<'suelo' | 'escalera' | 'manlift' | 'andamio_tubular' | 'andamio_colgante'>('andamio_tubular');
  const [alturaAndamioCampo, setAlturaAndamioCampo] = useState<number>(4.0);
  const [volumenAndamioCampo, setVolumenAndamioCampo] = useState<number>(60.0);

  // Crear hallazgo / pin dinámico directamente desde el celular
  const handleCreateFieldPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fieldTag.trim()) return;

    const newId = `elem_field_${Date.now()}`;
    const newPin: Elemento = {
      id: newId,
      zona_id: selectedAreaId || 'general',
      tag_codigo: fieldTag.trim().toUpperCase(),
      tipo_elemento: fieldDisciplina,
      qr_token: `QR-FIELD-${Date.now().toString(36).toUpperCase()}`,
      coordenadas_pin: { x: 800, y: 450 },
      cota_nivel: fieldCota,
      creado_en_campo: true,
      geometria_parametros: {
        perfil: fieldDisciplina === 'parral_caneria' ? 'Pipe-Rack W8' : fieldDisciplina === 'soporte' ? 'Soporte Silleta UPN' : 'Estándar',
        longitud_m: 3.0,
        m2_superficie: 8.5,
        peso_kg: 120
      },
      criticidad_activo: 3,
      estado_actual: 'gris',
      coordenadas_gps: gpsData || undefined
    };

    await db.elementos.put(newPin);
    const updated = await db.elementos.toArray();
    setElementos(updated);
    setSelectedElemento(newPin);
    setIsFieldPinModalOpen(false);
    setFieldTag('');
  };

  // Contador Temporal y Envejecimiento Estructural
  const [antiguedadAnios, setAntiguedadAnios] = useState<number>(10);
  const [ultimoRevestimientoAnios, setUltimoRevestimientoAnios] = useState<number>(3);
  const [tasaAvancePct, setTasaAvancePct] = useState<number>(5); // 5% por año
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  
  // Fotos y anotaciones
  const [compressedPhoto, setCompressedPhoto] = useState<CompressedResult | null>(null);
  const [annotations, setAnnotations] = useState<VectorAnnotation[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [inspeccionesLocales, setInspeccionesLocales] = useState<Inspeccion[]>([]);

  // Cargar datos reales desde IndexedDB
  useEffect(() => {
    async function initDB() {
      const loadedAreas = await db.areas.toArray();
      const loadedPlanos = await db.planos.toArray();
      const loadedZonas = await db.zonas.toArray();
      const loadedElementos = await db.elementos.toArray();
      const loadedInspecciones = await db.inspecciones.toArray();

      setAreas(loadedAreas);
      setPlanos(loadedPlanos);
      setZonas(loadedZonas);
      setElementos(loadedElementos);
      setInspeccionesLocales(loadedInspecciones);

      if (loadedAreas.length > 0 && !selectedAreaId) {
        setSelectedAreaId(loadedAreas[0].id);
      }

      if (loadedPlanos.length > 0 && !selectedPlanoId) {
        setSelectedPlanoId(loadedPlanos[0].id);
      }

      if (loadedElementos.length > 0 && !selectedElemento) {
        setSelectedElemento(loadedElementos[0]);
      }
    }

    initDB();
  }, []);

  // Comprobar y verificar cacheo local para operar 100% Offline
  const handleDownloadAreaOffline = async () => {
    setIsDownloadingArea(true);
    setDownloadSuccessMsg('');

    try {
      const count = await db.elementos.count();
      const areasCount = await db.areas.count();
      const planosCount = await db.planos.count();
      setDownloadSuccessMsg(`¡${areasCount} áreas, ${planosCount} planos y ${count} activos confirmados en memoria local (IndexedDB) para trabajo 100% offline!`);
      setTimeout(() => setDownloadSuccessMsg(''), 4500);
    } catch (err) {
      console.error(err);
    } finally {
      setIsDownloadingArea(false);
    }
  };

  // Manejo de captura de cámara / archivo fotográfico con compresión automática
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressing(true);
    try {
      const result = await compressInspectionPhoto(file);
      setCompressedPhoto(result);
      setAnnotations([]); // Reiniciar marcas para la nueva foto
    } catch (err) {
      console.error('Error al comprimir foto:', err);
    } finally {
      setIsCompressing(false);
    }
  };

  // Guardar inspección en IndexedDB y encolar en SyncManager
  const handleSaveInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedElemento) return;

    const nuevaFoto: FotoInspeccionLocal = {
      thumbnail_data_url: compressedPhoto?.thumbnailDataUrl || '',
      original_webp_blob: compressedPhoto?.blob,
      peso_bytes: compressedPhoto?.compressedSizeBytes || 0,
      anotaciones_canvas: annotations
    };

    const inspeccionId = `insp_${Date.now()}`;
    const mesesVentanaIntervencion = Math.max(1, Math.round(((Math.max(40, porcentajeAfectado + 10) - porcentajeAfectado) / Math.max(1, tasaAvancePct)) * 12));

    const nuevaInspeccion: Inspeccion = {
      id: inspeccionId,
      elemento_id: selectedElemento.id,
      inspector_nombre: 'Inspector de Turno (Planta)',
      fecha_inspeccion: new Date().toISOString(),
      estado_sincronizacion: 'pendiente',
      clasificacion_sustrato: sustrato,
      clasificacion_recubrimiento: recubrimiento,
      grado_corrosion: gradoCorrosion,
      requiere_reemplazo: requiereReemplazo,
      porcentaje_afectado: porcentajeAfectado,
      criticidad_calculada: requiereReemplazo ? 5 : gradoCorrosion === 'Ri 4' || gradoCorrosion === 'Ri 5' ? 4 : 3,
      antiguedad_anios: antiguedadAnios,
      ultimo_revestimiento_anios: ultimoRevestimientoAnios,
      tasa_avance_anual_pct: tasaAvancePct,
      meses_ventana_intervencion: mesesVentanaIntervencion,
      coordenadas_gps: gpsData || undefined,
      requiere_andamio: requiereAndamioCampo,
      tipo_acceso_sugerido: tipoAccesoCampo,
      altura_andamio_m: alturaAndamioCampo,
      volumen_andamio_m3: volumenAndamioCampo,
      observaciones: observaciones,
      fotos: compressedPhoto ? [nuevaFoto] : []
    };

    // Actualizar estado del elemento localmente con KPIs de envejecimiento y GPS
    const nuevoEstado = requiereReemplazo ? 'rojo' : gradoCorrosion === 'Ri 4' ? 'naranja' : gradoCorrosion === 'Ri 3' ? 'amarillo' : 'verde';
    await db.elementos.update(selectedElemento.id, { 
      estado_actual: nuevoEstado,
      antiguedad_anios: antiguedadAnios,
      ultimo_revestimiento_anios: ultimoRevestimientoAnios,
      tasa_avance_anual_pct: tasaAvancePct,
      ultima_inspeccion_fecha: new Date().toISOString(),
      coordenadas_gps: gpsData || undefined
    });

    // Guardar en Dexie y encolar en SyncManager resiliente
    await syncManager.enqueueInspection(nuevaInspeccion);

    // Actualizar lista local
    const actualizadas = await db.inspecciones.toArray();
    setInspeccionesLocales(actualizadas);

    // Feedback visual
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      // Limpiar formulario fotográfico
      setCompressedPhoto(null);
      setAnnotations([]);
      setObservaciones('');
    }, 2500);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col pb-20">
      {/* 1. Header con indicador de red y sync */}
      <SyncStatusBadge />

      {/* 2. Barra de Navegación Móvil de Alto Contraste */}
      <header className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Link href="/" className="p-1 text-slate-400 hover:text-white rounded">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center space-x-1.5">
            <HardHat className="w-5 h-5 text-amber-500" />
            <span className="font-black text-sm tracking-wider uppercase">CAMPO | INSPECCIÓN</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsQRModalOpen(true)}
          className="flex items-center space-x-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs rounded-lg shadow-md transition"
        >
          <QrCode className="w-4 h-4" />
          <span>Escanear QR</span>
        </button>
      </header>

      {/* 3. Botón de Descarga Offline */}
      <div className="p-4 bg-slate-900/60 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <DownloadCloud className="w-5 h-5 text-sky-400 flex-shrink-0" />
          <div className="text-xs">
            <span className="font-bold text-slate-200">Trabajo en Zona Ciega (Sin Señal)</span>
            <p className="text-slate-400">Descarga los activos para relevar sin interrupciones en sótanos o naves industriales.</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDownloadAreaOffline}
          disabled={isDownloadingArea}
          className="w-full sm:w-auto px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-lg transition disabled:opacity-50 whitespace-nowrap shadow"
        >
          {isDownloadingArea ? 'Guardando en IndexedDB...' : 'Descargar Área para Trabajo Offline'}
        </button>
      </div>

      {downloadSuccessMsg && (
        <div className="mx-4 mt-3 p-3 bg-emerald-950 border border-emerald-500/50 rounded-lg text-emerald-300 text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
          <span>{downloadSuccessMsg}</span>
        </div>
      )}

      {/* 4. Barra de Progreso del Relevamiento y Botón de Reporte Automático */}
      <div className="mx-4 mt-3 p-3.5 bg-slate-900 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="w-full sm:w-2/3 space-y-1.5">
          <div className="flex justify-between font-bold">
            <span className="text-slate-300">Progreso del Relevamiento en Planta:</span>
            <span className="text-emerald-400 font-mono">
              {elementos.filter(e => e.estado_actual !== 'gris').length} de {elementos.length} Activos Relevados ({elementos.length > 0 ? Math.round((elementos.filter(e => e.estado_actual !== 'gris').length / elementos.length) * 100) : 0}%)
            </span>
          </div>
          <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden flex border border-slate-800">
            <div 
              className="bg-emerald-500 h-full transition-all duration-500" 
              style={{ width: `${elementos.length > 0 ? Math.round((elementos.filter(e => e.estado_actual !== 'gris').length / elementos.length) * 100) : 0}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsReportModalOpen(true)}
          className="w-full sm:w-auto px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-extrabold rounded-lg flex items-center justify-center space-x-2 shadow-lg transition"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Generar Reporte Automático</span>
        </button>
      </div>

      {/* 5. Formulario de Inspección Táctil */}
      <main className="p-4 max-w-xl mx-auto w-full space-y-6">
        {/* Timeline / Stepper del Proceso de Relevamiento */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-300">
            <span className="flex items-center space-x-1.5 uppercase tracking-wider">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>Timeline de Inspección del Activo</span>
            </span>
            <span className="text-[11px] font-mono text-emerald-400">
              {savedSuccess ? '✅ PASO 4: CERRADO' : compressedPhoto ? 'PASO 3: EVALUACIÓN' : selectedElemento ? 'PASO 2: FOTO' : 'PASO 1: SELECCIÓN'}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] font-bold">
            <div className={`p-1.5 rounded-lg border transition ${selectedElemento ? 'bg-emerald-950 text-emerald-300 border-emerald-500' : 'bg-slate-950 text-slate-400 border-slate-800'}`}>
              ① Activo / QR
            </div>
            <div className={`p-1.5 rounded-lg border transition ${compressedPhoto ? 'bg-emerald-950 text-emerald-300 border-emerald-500' : 'bg-slate-950 text-slate-400 border-slate-800'}`}>
              ② Foto WebP
            </div>
            <div className={`p-1.5 rounded-lg border transition ${gradoCorrosion ? 'bg-amber-950 text-amber-300 border-amber-500' : 'bg-slate-950 text-slate-400 border-slate-800'}`}>
              ③ ISO & Tiempo
            </div>
            <div className={`p-1.5 rounded-lg border transition ${savedSuccess ? 'bg-emerald-500 text-black border-emerald-400' : 'bg-slate-950 text-slate-500 border-slate-800'}`}>
              ④ Cierre
            </div>
          </div>
        </div>

        {/* Selector de Elemento Activo (Lista o Mini-Mapa) */}
        <div className="bg-slate-900 border-2 border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Activo en Inspección</span>
            <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px]">
              <button
                type="button"
                onClick={() => setViewMode('lista')}
                className={`px-2.5 py-1 rounded font-bold transition ${viewMode === 'lista' ? 'bg-amber-500 text-black' : 'text-slate-400 hover:text-white'}`}
              >
                📋 Lista
              </button>
              <button
                type="button"
                onClick={() => setViewMode('mapa')}
                className={`px-2.5 py-1 rounded font-bold transition ${viewMode === 'mapa' ? 'bg-sky-500 text-black' : 'text-slate-400 hover:text-white'}`}
              >
                🗺️ Mini-Mapa
              </button>
            </div>
          </div>

          {viewMode === 'mapa' && planos.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Toca un pin sobre el plano para seleccionarlo:</span>
                {planos.length > 1 && (
                  <select
                    value={selectedPlanoId}
                    onChange={(e) => setSelectedPlanoId(e.target.value)}
                    className="bg-slate-950 border border-slate-700 text-[11px] text-white rounded p-1"
                  >
                    {planos.map(p => (
                      <option key={p.id} value={p.id}>{p.titulo}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Contenedor del Mini-Mapa Táctil */}
              <div className="relative w-full h-56 bg-slate-950 rounded-xl border border-slate-800 overflow-hidden flex items-center justify-center">
                {planos.find(p => p.id === selectedPlanoId)?.archivo_data_url ? (
                  <img
                    src={planos.find(p => p.id === selectedPlanoId)?.archivo_data_url}
                    alt="Plano"
                    className="w-full h-full object-contain pointer-events-none opacity-80"
                  />
                ) : (
                  <div className="text-center p-4 text-xs text-slate-500">
                    <MapIcon className="w-8 h-8 text-slate-600 mx-auto mb-1" />
                    <span>Plano arquitectónico vectorial</span>
                  </div>
                )}

                {/* Pines superpuestos sobre el plano */}
                {elementos.map(elem => {
                  const isSelected = selectedElemento?.id === elem.id;
                  const currentPlano = planos.find(p => p.id === selectedPlanoId) || planos[0];
                  const vbWidth = currentPlano?.dimensiones_viewbox.width || 1600;
                  const vbHeight = currentPlano?.dimensiones_viewbox.height || 900;
                  const leftPct = (elem.coordenadas_pin.x / vbWidth) * 100;
                  const topPct = (elem.coordenadas_pin.y / vbHeight) * 100;

                  return (
                    <button
                      key={elem.id}
                      type="button"
                      onClick={() => setSelectedElemento(elem)}
                      style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center shadow-lg transition transform ${
                        isSelected 
                          ? 'w-7 h-7 ring-4 ring-white z-20 scale-125' 
                          : 'w-5 h-5 hover:scale-110 z-10'
                      } ${
                        elem.estado_actual === 'rojo' ? 'bg-red-500 text-white' :
                        elem.estado_actual === 'naranja' ? 'bg-orange-500 text-white' :
                        elem.estado_actual === 'amarillo' ? 'bg-amber-400 text-black' :
                        elem.estado_actual === 'verde' ? 'bg-emerald-500 text-black' : 'bg-slate-600 text-white'
                      }`}
                      title={`${elem.tag_codigo} (${elem.estado_actual})`}
                    >
                      <MapPin className="w-3.5 h-3.5" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Filtro de Cota y Botón para Reportar Hallazgo en Terreno */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1 border-t border-slate-800 text-xs">
            <div className="flex items-center space-x-1.5 w-full sm:w-auto">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Nivel:</span>
              <select
                value={cotaFiltro}
                onChange={(e) => setCotaFiltro(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-amber-400 font-mono font-bold text-xs rounded px-2 py-1.5 focus:outline-none flex-1"
              >
                <option value="todos">🏢 Todos los Niveles</option>
                <option value="146000">🟢 Cota +146.000 m (Suelo Base)</option>
                <option value="152000">🟡 Cota +152.000 m (+6.00 m)</option>
                <option value="158000">🟠 Cota +158.000 m (+12.00 m)</option>
                <option value="170000">🔴 Cota +170.000 m (+24.00 m)</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => setIsFieldPinModalOpen(true)}
              className="w-full sm:w-auto px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-extrabold rounded-lg flex items-center justify-center space-x-1.5 shadow transition"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>+ Reportar Hallazgo en Campo</span>
            </button>
          </div>

          {elementos.length > 0 ? (
            <select
              value={selectedElemento?.id || ''}
              onChange={(e) => {
                const found = elementos.find(item => item.id === e.target.value);
                if (found) setSelectedElemento(found);
              }}
              className="w-full bg-slate-950 border border-slate-700 text-white font-mono font-bold text-base rounded-lg p-2.5 focus:border-amber-400 focus:outline-none"
            >
              {elementos
                .filter(el => cotaFiltro === 'todos' || String(el.cota_nivel || 146000) === cotaFiltro)
                .map(elem => (
                  <option key={elem.id} value={elem.id}>
                    {elem.tag_codigo} - {elem.geometria_parametros.perfil || elem.tipo_elemento} ({elem.codigo_equipo_erp || 'ERP'}) {elem.creado_en_campo ? '· [HALLAZGO CAMPO]' : ''}
                  </option>
                ))}
            </select>
          ) : (
            <div className="p-3 bg-amber-950/60 border border-amber-500/40 rounded-lg text-amber-200 text-xs space-y-2">
              <p>
                No hay activos mapeados todavía. Sube el plano de tu planta en Ingeniería para trazar zonas y colocar pines de activos.
              </p>
              <Link
                href="/ingenieria/planos"
                className="inline-flex items-center space-x-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded text-xs"
              >
                <span>Ir al Visor y Subir Plano</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          )}

          {selectedElemento && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-950/80 p-2.5 rounded border border-slate-800/80">
                <div>
                  <span className="text-slate-500 block">Ubicación / ERP:</span>
                  <span className="font-mono text-slate-300">{selectedElemento.codigo_equipo_erp || 'S/D'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Geometría:</span>
                  <span className="font-mono text-slate-300">{selectedElemento.geometria_parametros.longitud_m}m · {selectedElemento.geometria_parametros.m2_superficie}m²</span>
                </div>
              </div>

              {/* Zona / Paquete de Intervención Multinivel Pre-armado */}
              {(() => {
                const currentZona = zonas.find(z => z.id === selectedElemento.zona_id) || zonas[0];
                return (
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <Layers className="w-3.5 h-3.5 text-amber-400" />
                        <span className="font-bold text-white">Zona: {currentZona ? currentZona.codigo : 'General'}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                          {currentZona?.nombre_nivel || `Cota +${((currentZona?.cota_nivel || 146000) / 1000).toFixed(3)} m`}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 block mt-0.5 truncate max-w-[210px] sm:max-w-xs">
                        {currentZona?.nombre || 'Sector de Intervención pre-armado'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsAjustarZonaModalOpen(true)}
                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-black font-extrabold rounded text-[11px] flex items-center space-x-1 shadow transition flex-shrink-0"
                      title="Ajustar parámetros reales de la zona pre-armada en oficina"
                    >
                      <span>⚙️ Ajustar Zona</span>
                    </button>
                  </div>
                );
              })()}

              {/* Módulo de Georreferenciación GPS Satelital */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-bold flex items-center space-x-1.5">
                    <Globe className="w-4 h-4 text-sky-400" />
                    <span>Georreferenciación Satelital (GPS de Campo)</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleCaptureGPS}
                    disabled={isGettingGps}
                    className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded text-[11px] flex items-center space-x-1 transition disabled:opacity-50"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>{isGettingGps ? 'Leyendo GPS...' : gpsData ? 'Actualizar GPS' : 'Capturar GPS'}</span>
                  </button>
                </div>

                {gpsData ? (
                  <div className="flex items-center justify-between bg-sky-950/40 p-2 rounded border border-sky-800/60 font-mono text-[11px] text-sky-200">
                    <div>
                      <span>📍 Lat: {gpsData.lat}, Lng: {gpsData.lng}</span>
                      <span className="text-[10px] text-slate-400 block">Precisión: ±{gpsData.precision_m} m</span>
                    </div>
                    <a
                      href={`https://www.google.com/maps?q=${gpsData.lat},${gpsData.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-400 underline text-[11px] hover:text-amber-300"
                    >
                      Ver en Maps ↗
                    </a>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    Usa GPS en áreas abiertas (patios, tanques, efluentes). En naves cerradas, el código QR y el pin sobre plano garantizan precisión exacta.
                  </p>
                )}

                {gpsError && (
                  <p className="text-[11px] text-amber-400 font-medium">{gpsError}</p>
                )}
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSaveInspection} className="space-y-6">
          {/* Captura de Foto con Compresión Automática */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                <Camera className="w-4 h-4 text-amber-400" />
                <span>Foto de Evidencia con Compresión WebP</span>
              </span>
              <span className="text-[10px] text-amber-400 font-mono">Máx 1600px · ~180KB</span>
            </div>

            {!compressedPhoto ? (
              <label className="border-2 border-dashed border-slate-700 hover:border-amber-400 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer bg-slate-950/50 hover:bg-slate-950 transition">
                <Camera className="w-10 h-10 text-slate-400 mb-2" />
                <span className="text-sm font-bold text-slate-200">Tomar o Seleccionar Fotografía</span>
                <span className="text-xs text-slate-500 mt-1 text-center">
                  Compresión automática a WebP en el navegador (reduce de ~8MB a ~180KB)
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="space-y-3">
                {/* Banner de Ahorro de Almacenamiento */}
                <div className="bg-emerald-950/70 border border-emerald-500/50 rounded-lg p-2.5 text-xs text-emerald-200 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <span>
                      Original: <strong>{(compressedPhoto.originalSizeBytes / (1024 * 1024)).toFixed(2)} MB</strong> → WebP: <strong>{(compressedPhoto.compressedSizeBytes / 1024).toFixed(0)} KB</strong>
                    </span>
                  </div>
                  <span className="font-mono font-bold text-emerald-300 bg-emerald-900/80 px-2 py-0.5 rounded">
                    -{compressedPhoto.ratioReducedPercent}%
                  </span>
                </div>

                {/* Lienzo de Anotaciones Vectoriales */}
                <VectorAnnotationCanvas
                  imageSrc={compressedPhoto.dataUrl}
                  annotations={annotations}
                  onChange={setAnnotations}
                />

                <div className="flex justify-between items-center text-xs">
                  <button
                    type="button"
                    onClick={() => setCompressedPhoto(null)}
                    className="text-red-400 hover:underline"
                  >
                    Descartar y tomar otra foto
                  </button>
                  <span className="text-slate-400">Miniatura lista para galería</span>
                </div>
              </div>
            )}

            {isCompressing && (
              <div className="text-center py-3 text-xs text-amber-400 animate-pulse">
                Comprimiendo imagen en el dispositivo...
              </div>
            )}
          </div>

          {/* Clasificación Técnica de Corrosión */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
              Evaluación Técnica de Degradación
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Sustrato Base</label>
                <select
                  value={sustrato}
                  onChange={(e) => setSustrato(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                >
                  <option value="acero_al_carbono">Acero al Carbono Estructural</option>
                  <option value="acero_galvanizado">Acero Galvanizado en Caliente</option>
                  <option value="acero_inoxidable_304">Acero Inoxidable 304</option>
                  <option value="acero_inoxidable_316">Acero Inoxidable 316</option>
                  <option value="fundicion_hierro">Fundición de Hierro</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Sistema de Recubrimiento</label>
                <select
                  value={recubrimiento}
                  onChange={(e) => setRecubrimiento(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                >
                  <option value="epoxi_poliamida">Epoxi Poliamida + Poliuretano</option>
                  <option value="alquidico_sintetico">Esmalte Alquídico Sintético</option>
                  <option value="silicato_zinc">Silicato Inorgánico de Zinc</option>
                  <option value="sin_recubrimiento">Sin Recubrimiento (Acero Negro)</option>
                </select>
              </div>
            </div>

            {/* Selector de Grado de Corrosión ISO 4628 / ASTM D610 */}
            <div>
              <div className="flex justify-between items-center mb-1 text-xs">
                <label className="text-slate-300 font-semibold">Grado de Corrosión (ISO 4628 / ASTM D610)</label>
                <span className="font-mono font-bold text-amber-400">{gradoCorrosion}</span>
              </div>
              <div className="grid grid-cols-6 gap-1">
                {['Ri 0', 'Ri 1', 'Ri 2', 'Ri 3', 'Ri 4', 'Ri 5'].map((grado) => (
                  <button
                    key={grado}
                    type="button"
                    onClick={() => setGradoCorrosion(grado)}
                    className={`py-2 text-xs font-mono font-bold rounded-lg border transition ${
                      gradoCorrosion === grado
                        ? 'bg-amber-500 text-black border-amber-400'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    {grado}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">
                {gradoCorrosion === 'Ri 0' && 'Sin oxidación visible'}
                {gradoCorrosion === 'Ri 1' && 'Oxidación leve en puntos aislados (<0.05%)'}
                {gradoCorrosion === 'Ri 2' && 'Puntos de óxido dispersos (<0.5%)'}
                {gradoCorrosion === 'Ri 3' && 'Ampollado y oxidación incipiente (~1%)'}
                {gradoCorrosion === 'Ri 4' && 'Oxidación extendida con descascaramiento (~8%)'}
                {gradoCorrosion === 'Ri 5' && 'Corrosión generalizada y pérdida de espesor (40-50%)'}
              </span>
            </div>

            {/* Slider de porcentaje afectado */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Porcentaje de Superficie Afectada</span>
                <span className="font-mono font-bold text-white">{porcentajeAfectado}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={porcentajeAfectado}
                onChange={(e) => setPorcentajeAfectado(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            {/* Switch de Reemplazo Estructural */}
            <div className="flex items-center justify-between bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div>
                <span className="text-xs font-bold text-white block">¿Requiere Reemplazo Estructural?</span>
                <span className="text-[11px] text-slate-400">
                  Activar si hay perforación, pérdida de sección &gt; 25% o deformación plástica.
                </span>
              </div>
              <input
                type="checkbox"
                checked={requiereReemplazo}
                onChange={(e) => setRequiereReemplazo(e.target.checked)}
                className="w-5 h-5 accent-red-500 rounded cursor-pointer"
              />
            </div>

            {/* Observaciones */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">Observaciones de Campo</label>
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Detalles de soldadura, accesibilidad de andamio, riesgo eléctrico..."
                rows={2}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Estimación de Andamio y Logística de Acceso desde el Campo */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                <HardHat className="w-4 h-4 text-amber-400" />
                <span>Requerimiento de Andamio y Acceso (Estimado en Terreno)</span>
              </span>
              <label className="flex items-center space-x-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requiereAndamioCampo}
                  onChange={(e) => setRequiereAndamioCampo(e.target.checked)}
                  className="accent-amber-500 rounded"
                />
                <span className="text-amber-400 font-bold text-xs">Requiere Andamio</span>
              </label>
            </div>

            {requiereAndamioCampo ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                <div>
                  <label className="text-slate-400 block mb-1">Tipo de Acceso</label>
                  <select
                    value={tipoAccesoCampo}
                    onChange={(e: any) => setTipoAccesoCampo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white text-xs"
                  >
                    <option value="andamio_tubular">Andamio Tubular</option>
                    <option value="andamio_colgante">Andamio Colgante</option>
                    <option value="manlift">Manlift / Tijera</option>
                    <option value="escalera">Escalera</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Altura de Trabajo (m)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={alturaAndamioCampo}
                    onChange={(e) => setAlturaAndamioCampo(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Volumen Estimado (m³)</label>
                  <input
                    type="number"
                    value={volumenAndamioCampo}
                    onChange={(e) => setVolumenAndamioCampo(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  />
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500">
                Intervención ejecutable a nivel de piso o pasarela existente sin necesidad de montaje de andamio.
              </p>
            )}
          </div>

          {/* Contador Temporal, Envejecimiento y Proyección de Deterioro */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                <TrendingUp className="w-4 h-4 text-purple-400" />
                <span>Envejecimiento y Tasa de Avance (ISO 12944)</span>
              </span>
              <span className="text-[10px] text-purple-400 font-mono">KPI Ventana Óptima</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Antigüedad Estructura</label>
                <div className="flex items-center space-x-1">
                  <input
                    type="number"
                    min="0"
                    value={antiguedadAnios}
                    onChange={(e) => setAntiguedadAnios(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  />
                  <span className="text-slate-400 text-xs">años</span>
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Último Recubrimiento</label>
                <div className="flex items-center space-x-1">
                  <input
                    type="number"
                    min="0"
                    value={ultimoRevestimientoAnios}
                    onChange={(e) => setUltimoRevestimientoAnios(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  />
                  <span className="text-slate-400 text-xs">años</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <label className="text-slate-400">Tasa de Degradación Anual Estimada:</label>
                <span className="font-mono font-bold text-purple-300">+{tasaAvancePct}% / año</span>
              </div>
              <input
                type="range"
                min="1"
                max="20"
                step="1"
                value={tasaAvancePct}
                onChange={(e) => setTasaAvancePct(Number(e.target.value))}
                className="w-full accent-purple-500"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>Leve / C2 (1-3%)</span>
                <span>Industrial / C4 (4-8%)</span>
                <span>Severo / C5 (9-20%)</span>
              </div>
            </div>

            {/* Alerta de Ventana de Intervención Óptima */}
            <div className="bg-purple-950/40 border border-purple-500/40 rounded-lg p-2.5 text-xs text-purple-200 flex items-center justify-between">
              <div>
                <span className="font-bold block">Ventana de Intervención Recomendada:</span>
                <span className="text-[11px] text-purple-300">
                  Intervenir antes de <strong>{Math.max(1, Math.round(((Math.max(40, porcentajeAfectado + 10) - porcentajeAfectado) / Math.max(1, tasaAvancePct)) * 12))} meses</strong> para evitar reemplazo estructural
                </span>
              </div>
              <span className="text-sm font-black font-mono bg-purple-900/60 px-2.5 py-1 rounded text-purple-300">
                ~{Math.max(1, Math.round(((Math.max(40, porcentajeAfectado + 10) - porcentajeAfectado) / Math.max(1, tasaAvancePct)) * 12))} m
              </span>
            </div>
          </div>

          {/* Botón Guardar Inspección */}
          <button
            type="submit"
            className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-sm uppercase tracking-wider rounded-xl shadow-xl transition flex items-center justify-center space-x-2"
          >
            <Save className="w-5 h-5" />
            <span>Guardar Inspección en Memoria Local</span>
          </button>
        </form>

        {savedSuccess && (
          <div className="p-4 bg-emerald-950 border-2 border-emerald-500 rounded-xl text-emerald-300 text-center font-bold text-sm animate-bounce">
            ✓ ¡Inspección guardada localmente y encolada para sincronización!
          </div>
        )}

        {/* Historial Reciente en el Dispositivo */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
              <Clock className="w-4 h-4 text-sky-400" />
              <span>Inspecciones Locales en Dispositivo</span>
            </span>
            <span className="text-xs font-mono text-slate-400">{inspeccionesLocales.length} registros</span>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {inspeccionesLocales.length === 0 ? (
              <p className="text-xs text-slate-500 py-2 text-center">No hay inspecciones guardadas en este dispositivo.</p>
            ) : (
              inspeccionesLocales.map((insp) => (
                <div
                  key={insp.id}
                  className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-mono font-bold text-amber-400 block">{insp.elemento_id}</span>
                    <span className="text-[10px] text-slate-400">
                      {insp.grado_corrosion} · {insp.porcentaje_afectado}% afectado {insp.requiere_reemplazo ? '· [REEMPLAZO]' : ''}
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    insp.estado_sincronizacion === 'sincronizado' 
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' 
                      : 'bg-amber-950 text-amber-400 border border-amber-800'
                  }`}>
                    {insp.estado_sincronizacion.toUpperCase()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* Modal de Escaneo QR */}
      <QRScannerModal
        isOpen={isQRModalOpen}
        onClose={() => setIsQRModalOpen(false)}
        elementos={elementos}
        onElementSelect={(elem) => setSelectedElemento(elem)}
      />

      {/* Modal de Reporte Automático de Relevamiento */}
      <ReporteRelevamientoModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        area={areas.find(a => a.id === selectedAreaId)}
        elementos={elementos}
        inspecciones={inspeccionesLocales}
      />

      {/* Modal Rápido para Reportar Hallazgo / Pin desde el Campo */}
      {isFieldPinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border-2 border-sky-500 rounded-2xl overflow-hidden shadow-2xl p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-white font-bold text-sm">
                <MapPin className="w-5 h-5 text-sky-400" />
                <span>Reportar Nuevo Hallazgo en Campo</span>
              </div>
              <button onClick={() => setIsFieldPinModalOpen(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateFieldPin} className="space-y-3">
              <div>
                <label className="text-slate-400 block mb-1">Código / TAG del Hallazgo *</label>
                <input
                  type="text"
                  placeholder="Ej: HALLAZGO-VIG-146, SOP-ROTO-02..."
                  value={fieldTag}
                  onChange={(e) => setFieldTag(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono font-bold uppercase focus:border-sky-400 focus:outline-none"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Disciplina / Tipo de Elemento</label>
                <select
                  value={fieldDisciplina}
                  onChange={(e: any) => setFieldDisciplina(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
                >
                  <option value="acero_estructural">Estructura de Acero (Viga / Columna)</option>
                  <option value="parral_caneria">Parral de Cañerías (Pipe-Rack)</option>
                  <option value="soporte">Soporte de Cañería / Silleta</option>
                  <option value="caneria">Cañería de Proceso / Vapor</option>
                  <option value="columna_hormigon">Columna / Pedestal de Hormigón</option>
                  <option value="baranda">Baranda / Pasarela Grating</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Cota de Nivel Georreferenciada</label>
                <select
                  value={fieldCota}
                  onChange={(e) => setFieldCota(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-amber-400 font-mono font-bold"
                >
                  <option value={146000}>🟢 Cota +146.000 m (Nivel Suelo Base)</option>
                  <option value={152000}>🟡 Cota +152.000 m (+6.00 m Pasarelas)</option>
                  <option value={158000}>🟠 Cota +158.000 m (+12.00 m Operación)</option>
                  <option value={170000}>🔴 Cota +170.000 m (+24.00 m Nivel Superior)</option>
                </select>
              </div>

              {gpsData && (
                <div className="bg-sky-950/40 p-2 rounded border border-sky-800 text-[11px] text-sky-300 font-mono">
                  📍 Se vinculará con GPS actual: {gpsData.lat}, {gpsData.lng} (±{gpsData.precision_m}m)
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsFieldPinModalOpen(false)}
                  className="px-3 py-1.5 text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-black font-extrabold rounded-lg shadow"
                >
                  Dar de Alta y Relevar Ahora
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal para Ajustar Parámetros de Zona en Terreno */}
      <AjustarZonaCampoModal
        isOpen={isAjustarZonaModalOpen}
        onClose={() => setIsAjustarZonaModalOpen(false)}
        zona={zonas.find(z => z.id === selectedElemento?.zona_id) || zonas[0] || null}
        onZonaUpdated={async () => {
          const fresh = await db.zonas.toArray();
          setZonas(fresh);
        }}
      />
    </div>
  );
}
