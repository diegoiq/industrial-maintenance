'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Camera, 
  QrCode, 
  DownloadCloud, 
  Save, 
  CheckCircle2, 
  Layers, 
  HardHat, 
  Clock, 
  ArrowLeft,
  Sparkles,
  TrendingUp,
  FileSpreadsheet,
  MapPin,
  Navigation,
  Map as MapIcon,
  Globe,
  X,
  Plus,
  Trash2,
  CloudUpload,
  Compass,
  Image as ImageIcon
} from 'lucide-react';
import { db } from '../../lib/db';
import { pullAndReconcileFromCloud, pushFastSyncToCloud } from '../../lib/cloudSync';
import { compressInspectionPhoto } from '../../lib/imageCompression';
import { syncManager } from '../../lib/syncManager';
import { SyncStatusBadge } from '../../components/campo/SyncStatusBadge';
import { VectorAnnotationCanvas } from '../../components/campo/VectorAnnotationCanvas';
import { QRScannerModal } from '../../components/campo/QRScannerModal';
import { ReporteRelevamientoModal } from '../../components/campo/ReporteRelevamientoModal';
import { AjustarZonaCampoModal } from '../../components/campo/AjustarZonaCampoModal';
import { 
  getOrInitGeoreferencia, 
  latLngToPixel, 
  pixelToLatLng, 
  getPolygonCentroid, 
  isPointInPolygon,
  calculatePolygonAreaM2
} from '../../lib/georeferenceEngine';
import { 
  Elemento, 
  Area, 
  Inspeccion, 
  VectorAnnotation, 
  FotoInspeccionLocal, 
  Plano, 
  TipoElemento, 
  ZonaInspeccion,
  HitoGeografico 
} from '../../types';

export default function CampoPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [zonas, setZonas] = useState<ZonaInspeccion[]>([]);
  const [elementos, setElementos] = useState<Elemento[]>([]);
  const [hitos, setHitos] = useState<HitoGeografico[]>([]);

  const [selectedAreaId, setSelectedAreaId] = useState<string>('');
  const [selectedPlanoId, setSelectedPlanoId] = useState<string>('');
  const [selectedZona, setSelectedZona] = useState<ZonaInspeccion | null>(null);
  const [selectedElemento, setSelectedElemento] = useState<Elemento | null>(null);

  // Alcance dentro de la zona: 'zona_general' (relevamiento de la zona completa) o 'elemento' (activo/hallazgo puntual)
  const [inspectionTargetMode, setInspectionTargetMode] = useState<'zona_general' | 'elemento'>('zona_general');

  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isAjustarZonaModalOpen, setIsAjustarZonaModalOpen] = useState(false);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [viewMode, setViewMode] = useState<'zonas' | 'mapa'>('zonas');

  // Coordenadas GPS Satelital de Terreno y proyección sobre el plano CAD
  const [gpsData, setGpsData] = useState<{ lat: number; lng: number; precision_m: number; pixelX?: number; pixelY?: number } | null>(null);
  const [isGettingGps, setIsGettingGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Estados del formulario de inspección
  const [sustrato, setSustrato] = useState('acero_al_carbono');
  const [recubrimiento, setRecubrimiento] = useState('epoxi_poliamida');
  const [gradoCorrosion, setGradoCorrosion] = useState('Ri 3');
  const [porcentajeAfectado, setPorcentajeAfectado] = useState<number>(20);
  const [requiereReemplazo, setRequiereReemplazo] = useState(false);
  const [observaciones, setObservaciones] = useState('');

  // Filtro de Cota y Modal de Reportar Hallazgo / Elemento o Hito dentro de la Zona
  const [cotaFiltro, setCotaFiltro] = useState<string>('todos');
  const [isFieldPinModalOpen, setIsFieldPinModalOpen] = useState(false);
  const [fieldTag, setFieldTag] = useState('');
  const [fieldDisciplina, setFieldDisciplina] = useState<TipoElemento>('acero_estructural');
  const [fieldCota, setFieldCota] = useState<number>(146000);
  const [fieldDescripcion, setFieldDescripcion] = useState('');

  // Estimación de Andamio en Campo para la Zona / Activo
  const [requiereAndamioCampo, setRequiereAndamioCampo] = useState(true);
  const [tipoAccesoCampo, setTipoAccesoCampo] = useState<'suelo' | 'escalera' | 'manlift' | 'andamio_tubular' | 'andamio_colgante'>('andamio_tubular');
  const [alturaAndamioCampo, setAlturaAndamioCampo] = useState<number>(6.5);
  const [volumenAndamioCampo, setVolumenAndamioCampo] = useState<number>(180.0);

  // Contador Temporal y Envejecimiento Estructural
  const [antiguedadAnios, setAntiguedadAnios] = useState<number>(10);
  const [ultimoRevestimientoAnios, setUltimoRevestimientoAnios] = useState<number>(3);
  const [tasaAvancePct, setTasaAvancePct] = useState<number>(5);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // GALERÍA MULTI-FOTO POR ZONA / INSPECCIÓN (Ilimitadas fotos WebP con anotaciones y comentario individual)
  const [fotosGaleria, setFotosGaleria] = useState<FotoInspeccionLocal[]>([]);
  const [activePhotoIndex, setActivePhotoIndex] = useState<number>(0);
  const [isCompressing, setIsCompressing] = useState(false);
  const [lastCompressionRatio, setLastCompressionRatio] = useState<number | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [inspeccionesLocales, setInspeccionesLocales] = useState<Inspeccion[]>([]);

  // Cargar desde IndexedDB y reconciliar instantáneamente desde Neon Cloud (eliminando zonas borradas en PC)
  const loadAndHydrateFieldData = async (forceCloudPull: boolean = false) => {
    setIsSyncingCloud(true);
    try {
      if (forceCloudPull) {
        await pullAndReconcileFromCloud();
      }

      const loadedAreas = await db.areas.toArray();
      const loadedPlanos = await db.planos.toArray();
      const loadedZonas = await db.zonas.toArray();
      const loadedElementos = await db.elementos.toArray();
      const loadedHitos = await db.hitos.toArray();
      const loadedInspecciones = await db.inspecciones.toArray();

      setAreas(loadedAreas);
      setPlanos(loadedPlanos);
      setZonas(loadedZonas);
      setElementos(loadedElementos);
      setHitos(loadedHitos);
      setInspeccionesLocales(loadedInspecciones);

      const defaultPlano = loadedPlanos[0];
      if (defaultPlano && !selectedPlanoId) {
        setSelectedPlanoId(defaultPlano.id);
        setSelectedAreaId(defaultPlano.area_id);
      } else if (loadedAreas.length > 0 && !selectedAreaId) {
        setSelectedAreaId(loadedAreas[0].id);
      }

      if (loadedZonas.length > 0) {
        const stillExists = selectedZona && loadedZonas.some(z => z.id === selectedZona.id);
        if (!stillExists) {
          handleSelectZonaForTour(loadedZonas[0], loadedElementos);
        }
      } else {
        setSelectedZona(null);
      }
    } finally {
      setIsSyncingCloud(false);
    }
  };

  useEffect(() => {
    loadAndHydrateFieldData(true);

    // Auto-reconciliar cada vez que el inspector vuelve a la pantalla del celular o cada 10s
    const onFocus = () => loadAndHydrateFieldData(true);
    window.addEventListener('focus', onFocus);
    const interval = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        pullAndReconcileFromCloud().then(ok => {
          if (ok) loadAndHydrateFieldData(false);
        });
      }
    }, 10000);

    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, []);

  const currentPlano = planos.find(p => p.id === selectedPlanoId) || planos[0];
  const geoCal = getOrInitGeoreferencia(currentPlano, hitos);
  const zonasDelPlano = zonas.filter(z => (currentPlano ? z.plano_id === currentPlano.id : true));
  const zonasFiltradas = zonasDelPlano.filter(z => cotaFiltro === 'todos' || String(z.cota_nivel || 146000) === cotaFiltro);
  const elementosDeZona = selectedZona ? elementos.filter(e => e.zona_id === selectedZona.id) : [];

  // Seleccionar una Zona para iniciar el recorrido en campo
  const handleSelectZonaForTour = (zona: ZonaInspeccion, allElems: Elemento[] = elementos) => {
    setSelectedZona(zona);
    if (zona.nivel_acceso_andamio) {
      setRequiereAndamioCampo(zona.nivel_acceso_andamio.requiere_andamio !== false);
      setTipoAccesoCampo(zona.nivel_acceso_andamio.tipo_acceso || 'andamio_tubular');
      setAlturaAndamioCampo(zona.nivel_acceso_andamio.altura_mts || 6.5);
      setVolumenAndamioCampo(zona.nivel_acceso_andamio.envolvente_m3 || 180);
    }
    const elemsInZona = allElems.filter(e => e.zona_id === zona.id);
    if (elemsInZona.length > 0) {
      setSelectedElemento(elemsInZona[0]);
    } else {
      setSelectedElemento(null);
      setInspectionTargetMode('zona_general');
    }
  };

  // Sincronización bidireccional rápida con Neon + Backblaze B2 (Primero descarga eliminaciones de PC, luego sube hallazgos de campo)
  const handleFullCloudSync = async () => {
    setIsSyncingCloud(true);
    setSyncMessage('');
    try {
      await pullAndReconcileFromCloud();
      await pushFastSyncToCloud({ authoritativeZonas: false, authoritativeHitos: false });
      await loadAndHydrateFieldData(false);
      const zCount = await db.zonas.count();
      const iCount = await db.inspecciones.count();
      setSyncMessage(`⚡ ¡Sincronizado en tiempo real! (${zCount} zonas activas y ${iCount} inspecciones espejadas con PC).`);
      setTimeout(() => setSyncMessage(''), 4000);
    } catch (err: any) {
      setSyncMessage('Guardado en memoria local (IndexedDB). Se sincronizará cuando haya señal.');
      setTimeout(() => setSyncMessage(''), 4000);
    } finally {
      setIsSyncingCloud(false);
    }
  };

  // Capturar posición GPS física del inspector y proyectarla sobre el plano CAD para detectar en qué Zona está
  const handleCaptureGPS = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGpsError("Tu dispositivo no soporta geolocalización satelital.");
      return;
    }
    setIsGettingGps(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const precision_m = Math.round(pos.coords.accuracy);
        const pixelPos = latLngToPixel(lat, lng, geoCal);

        setGpsData({
          lat,
          lng,
          precision_m,
          pixelX: pixelPos.x,
          pixelY: pixelPos.y
        });

        // Verificar si el inspector está parado dentro de alguna de las Zonas del plano
        const detectedZone = zonasDelPlano.find(z => isPointInPolygon(pixelPos, z.poligono_svg?.puntos || []));
        if (detectedZone) {
          handleSelectZonaForTour(detectedZone);
          setSyncMessage(`📍 GPS te ubicó dentro de la Zona: ${detectedZone.codigo} (${detectedZone.nombre})`);
          setTimeout(() => setSyncMessage(''), 4500);
        }

        setIsGettingGps(false);
      },
      (err) => {
        setGpsError("Señal GPS débil o permiso denegado: " + err.message);
        setIsGettingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  // Crear nuevo Elemento / Hallazgo dentro de la Zona activa desde el celular
  const handleCreateFieldPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fieldTag.trim()) return;

    const targetZona = selectedZona || zonas[0];
    const centroid = targetZona ? getPolygonCentroid(targetZona.poligono_svg?.puntos || []) : { x: 800, y: 450 };
    // Si tiene GPS dentro del plano, ubicarlo ahí; si no, en el centroide de la zona seleccionada con pequeño offset
    const offset = Math.round((Math.random() - 0.5) * 40);
    const pinCoords = gpsData?.pixelX && gpsData?.pixelY
      ? { x: gpsData.pixelX, y: gpsData.pixelY }
      : { x: centroid.x + offset, y: centroid.y + offset };

    const autoGps = gpsData ? { lat: gpsData.lat, lng: gpsData.lng, precision_m: gpsData.precision_m } : pixelToLatLng(pinCoords.x, pinCoords.y, geoCal);

    const newId = `elem_field_${Date.now()}`;
    const newPin: Elemento = {
      id: newId,
      zona_id: targetZona?.id || 'general',
      tag_codigo: fieldTag.trim().toUpperCase(),
      codigo_equipo_erp: fieldDescripcion.trim() || undefined,
      tipo_elemento: fieldDisciplina,
      qr_token: `QR-FIELD-${Date.now().toString(36).toUpperCase()}`,
      coordenadas_pin: pinCoords,
      cota_nivel: targetZona?.cota_nivel || fieldCota,
      creado_en_campo: true,
      geometria_parametros: {
        perfil: fieldDisciplina === 'parral_caneria' ? 'Pipe-Rack W8' : fieldDisciplina === 'soporte' ? 'Soporte Silleta UPN' : 'Hallazgo Campo',
        longitud_m: 3.0,
        m2_superficie: 8.5,
        peso_kg: 120
      },
      criticidad_activo: 3,
      estado_actual: 'amarillo',
      coordenadas_gps: autoGps
    };

    await db.elementos.put(newPin);
    const updated = await db.elementos.toArray();
    setElementos(updated);
    setSelectedElemento(newPin);
    setInspectionTargetMode('elemento');
    setIsFieldPinModalOpen(false);
    setFieldTag('');
    setFieldDescripcion('');
  };

  // Manejo de captura de MÚLTIPLES fotos con compresión WebP automática
  const handleMultiPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsCompressing(true);
    try {
      const nuevasFotos: FotoInspeccionLocal[] = [];
      for (let i = 0; i < files.length; i++) {
        const result = await compressInspectionPhoto(files[i]);
        setLastCompressionRatio(result.ratioReducedPercent);
        nuevasFotos.push({
          id: `foto_${Date.now()}_${i}`,
          thumbnail_data_url: result.dataUrl,
          original_webp_blob: result.blob,
          peso_bytes: result.compressedSizeBytes,
          comentario: '',
          anotaciones_canvas: []
        });
      }
      setFotosGaleria(prev => {
        const combined = [...prev, ...nuevasFotos];
        setActivePhotoIndex(combined.length - 1);
        return combined;
      });
    } catch (err) {
      console.error('Error al comprimir fotos:', err);
    } finally {
      setIsCompressing(false);
      e.target.value = '';
    }
  };

  // Actualizar anotaciones o comentario de la foto activa en la galería
  const handleUpdateActivePhotoAnnotations = (newAnnotations: VectorAnnotation[]) => {
    setFotosGaleria(prev =>
      prev.map((f, idx) => (idx === activePhotoIndex ? { ...f, anotaciones_canvas: newAnnotations } : f))
    );
  };

  const handleUpdateActivePhotoComment = (comment: string) => {
    setFotosGaleria(prev =>
      prev.map((f, idx) => (idx === activePhotoIndex ? { ...f, comentario: comment } : f))
    );
  };

  const handleRemovePhoto = (indexToRemove: number) => {
    setFotosGaleria(prev => {
      const filtered = prev.filter((_, idx) => idx !== indexToRemove);
      if (activePhotoIndex >= filtered.length) {
        setActivePhotoIndex(Math.max(0, filtered.length - 1));
      }
      return filtered;
    });
  };

  // Guardar inspección de Zona o Elemento en IndexedDB y sincronizar con Neon + Backblaze B2
  const handleSaveInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedZona && !selectedElemento) return;

    const targetElemId = inspectionTargetMode === 'elemento' && selectedElemento
      ? selectedElemento.id
      : `ZONA:${selectedZona?.codigo || 'GENERAL'}`;

    const inspeccionId = `insp_${Date.now()}`;
    const mesesVentanaIntervencion = Math.max(
      1,
      Math.round(((Math.max(40, porcentajeAfectado + 10) - porcentajeAfectado) / Math.max(1, tasaAvancePct)) * 12)
    );

    const nuevaInspeccion: Inspeccion = {
      id: inspeccionId,
      elemento_id: targetElemId,
      zona_id: selectedZona?.id,
      zona_codigo: selectedZona?.codigo,
      inspector_nombre: 'Inspector de Campo',
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
      coordenadas_gps: gpsData ? { lat: gpsData.lat, lng: gpsData.lng, precision_m: gpsData.precision_m } : undefined,
      requiere_andamio: requiereAndamioCampo,
      tipo_acceso_sugerido: tipoAccesoCampo,
      altura_andamio_m: alturaAndamioCampo,
      volumen_andamio_m3: volumenAndamioCampo,
      observaciones: observaciones,
      fotos: fotosGaleria
    };

    // Si es un elemento puntual, actualizar su semáforo
    if (inspectionTargetMode === 'elemento' && selectedElemento) {
      const nuevoEstado = requiereReemplazo ? 'rojo' : gradoCorrosion === 'Ri 4' || gradoCorrosion === 'Ri 5' ? 'naranja' : gradoCorrosion === 'Ri 3' ? 'amarillo' : 'verde';
      await db.elementos.update(selectedElemento.id, {
        estado_actual: nuevoEstado,
        antiguedad_anios: antiguedadAnios,
        ultimo_revestimiento_anios: ultimoRevestimientoAnios,
        tasa_avance_anual_pct: tasaAvancePct,
        ultima_inspeccion_fecha: new Date().toISOString(),
        coordenadas_gps: gpsData ? { lat: gpsData.lat, lng: gpsData.lng, precision_m: gpsData.precision_m } : selectedElemento.coordenadas_gps
      });
    }

    // Si hay zona seleccionada, actualizar su estado de salud a priori y parámetros de andamio validados en campo
    if (selectedZona) {
      const saludCampo = requiereReemplazo || gradoCorrosion === 'Ri 5'
        ? 'critico'
        : gradoCorrosion === 'Ri 4'
        ? 'malo'
        : gradoCorrosion === 'Ri 3'
        ? 'regular'
        : 'bueno';

      const updatedZona: ZonaInspeccion = {
        ...selectedZona,
        estado_salud_apriori: saludCampo,
        nivel_acceso_andamio: {
          ...(selectedZona.nivel_acceso_andamio || { complejidad: 'media', requiere_parada: false }),
          requiere_andamio: requiereAndamioCampo,
          tipo_acceso: tipoAccesoCampo,
          altura_mts: alturaAndamioCampo,
          envolvente_m3: volumenAndamioCampo,
          estimado_en_campo_por: 'Validado en Campo'
        }
      };
      await db.zonas.put(updatedZona);
      setSelectedZona(updatedZona);
      setZonas(await db.zonas.toArray());
    }

    // Guardar en Dexie y disparar subida a Neon + Backblaze B2
    await syncManager.enqueueInspection(nuevaInspeccion);

    // Sincronizar también la zona y elementos actualizados si hay conexión
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      fetch('/api/sync-neon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zonas: await db.zonas.toArray(),
          elementos: await db.elementos.toArray(),
          inspecciones: [nuevaInspeccion]
        })
      }).catch(() => null);
    }

    const actualizadas = await db.inspecciones.toArray();
    setInspeccionesLocales(actualizadas);
    setElementos(await db.elementos.toArray());

    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      setFotosGaleria([]);
      setActivePhotoIndex(0);
      setObservaciones('');
    }, 2800);
  };

  const activePhoto = fotosGaleria[activePhotoIndex];

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col pb-20">
      {/* 1. Header con indicador de red y sync */}
      <SyncStatusBadge />

      {/* 2. Barra de Navegación Móvil Compacta */}
      <header className="px-3 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <Link href="/ingenieria/planos" className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-950 border border-slate-800">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center space-x-1.5">
            <HardHat className="w-5 h-5 text-amber-500" />
            <div>
              <span className="font-black text-xs tracking-wider uppercase block leading-none">APP DE CAMPO</span>
              <span className="text-[10px] text-emerald-400 font-mono">{zonas.length} Zonas · {elementos.length} Hallazgos</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          <button
            type="button"
            onClick={handleFullCloudSync}
            disabled={isSyncingCloud}
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg shadow transition"
          >
            <CloudUpload className={`w-3.5 h-3.5 ${isSyncingCloud ? 'animate-bounce' : ''}`} />
            <span>{isSyncingCloud ? 'Sync...' : 'Sincronizar'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsQRModalOpen(true)}
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs rounded-lg shadow transition"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>QR</span>
          </button>
        </div>
      </header>

      {syncMessage && (
        <div className="mx-3 mt-2 p-2.5 bg-emerald-950 border border-emerald-500/60 rounded-xl text-emerald-200 text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
          <span>{syncMessage}</span>
        </div>
      )}

      <main className="p-3 sm:p-4 max-w-2xl mx-auto w-full space-y-4">
        {/* PASO 1: SELECCIONAR ZONA DE RECORRIDO (TARJETAS O MAPA TÁCTIL CON GPS) */}
        <div className="bg-slate-900 border-2 border-sky-500/40 rounded-2xl p-3.5 space-y-3 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[10px] font-mono uppercase text-sky-400 font-bold block">
                PASO 1 · SELECCIÓN DE SECTOR EN PLANTA
              </span>
              <h2 className="text-sm font-black text-white flex items-center space-x-1.5">
                <Layers className="w-4 h-4 text-sky-400" />
                <span>Zonas de Inspección Cargadas ({zonasFiltradas.length})</span>
              </h2>
            </div>

            <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('zonas')}
                className={`px-2.5 py-1 rounded font-bold transition ${viewMode === 'zonas' ? 'bg-sky-500 text-black' : 'text-slate-400 hover:text-white'}`}
              >
                📋 Zonas ({zonasFiltradas.length})
              </button>
              <button
                type="button"
                onClick={() => setViewMode('mapa')}
                className={`px-2.5 py-1 rounded font-bold transition ${viewMode === 'mapa' ? 'bg-amber-500 text-black' : 'text-slate-400 hover:text-white'}`}
              >
                🗺️ Plano Planta
              </button>
            </div>
          </div>

          {/* Barra GPS en Vivo para auto-detectar en qué Zona está parado el inspector */}
          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center space-x-2">
              <Compass className={`w-4 h-4 text-emerald-400 ${isGettingGps ? 'animate-spin' : ''}`} />
              <div>
                <span className="font-bold text-slate-200 block">
                  {gpsData ? `📍 GPS: ${gpsData.lat}, ${gpsData.lng} (±${gpsData.precision_m}m)` : 'Ubicación Satelital en Planta'}
                </span>
                <span className="text-[10px] text-slate-400">
                  {gpsData ? 'Proyectado sobre el Lay Out General' : 'Detecta automáticamente en cuál de las zonas estás parado'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCaptureGPS}
              disabled={isGettingGps}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs flex items-center space-x-1 shadow transition"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>{isGettingGps ? 'Ubicando...' : 'Ubicarme por GPS'}</span>
            </button>
          </div>
          {gpsError && <p className="text-[11px] text-amber-400">{gpsError}</p>}

          {/* VISTA A: LISTA DE LAS ZONAS CARGADAS */}
          {viewMode === 'zonas' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {zonasFiltradas.length === 0 ? (
                <div className="col-span-2 p-4 bg-slate-950 rounded-xl border border-slate-800 text-center space-y-2 text-xs text-slate-400">
                  <p>No se encontraron zonas en la memoria local.</p>
                  <button
                    type="button"
                    onClick={handleFullCloudSync}
                    className="px-3 py-1.5 bg-indigo-600 text-white font-bold rounded-lg"
                  >
                    Descargar Zonas desde Neon Cloud
                  </button>
                </div>
              ) : (
                zonasFiltradas.map((z) => {
                  const isSelected = selectedZona?.id === z.id;
                  const inspZonaCount = inspeccionesLocales.filter(
                    i => i.zona_id === z.id || i.elemento_id === `ZONA:${z.codigo}`
                  ).length;
                  const elemsZonaCount = elementos.filter(e => e.zona_id === z.id).length;
                  const areaM2 = z.superficie_estimada_m2 || calculatePolygonAreaM2(z.poligono_svg?.puntos || [], geoCal);

                  return (
                    <button
                      key={z.id}
                      type="button"
                      onClick={() => handleSelectZonaForTour(z)}
                      className={`text-left p-3 rounded-xl border transition flex flex-col justify-between ${
                        isSelected
                          ? 'bg-sky-950/80 border-sky-400 ring-1 ring-sky-400 shadow-lg'
                          : 'bg-slate-950/90 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono font-black text-xs text-sky-400 truncate">
                            {z.codigo}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                            z.estado_salud_apriori === 'critico' ? 'bg-red-950 text-red-300 border border-red-700' :
                            z.estado_salud_apriori === 'malo' ? 'bg-orange-950 text-orange-300 border border-orange-700' :
                            z.estado_salud_apriori === 'bueno' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' :
                            'bg-amber-950 text-amber-300 border border-amber-700'
                          }`}>
                            {z.estado_salud_apriori || 'Regular'}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-white mt-1 line-clamp-2">
                          {z.nombre}
                        </p>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2.5 pt-2 border-t border-slate-800/80 font-mono">
                        <span>📐 {areaM2} m²</span>
                        <span>📍 {elemsZonaCount} hallazgos</span>
                        <span className="text-emerald-400 font-bold">📸 {inspZonaCount} insp.</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* VISTA B: MINI-MAPA TÁCTIL CON LOS POLÍGONOS DE LAS ZONAS Y POSICIÓN GPS */}
          {viewMode === 'mapa' && currentPlano && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Toca cualquier polígono de Zona o Pin en el plano:</span>
                <span className="font-mono text-sky-400">{currentPlano.titulo}</span>
              </div>

              <div className="relative w-full h-72 bg-[#070b13] rounded-xl border border-slate-800 overflow-hidden">
                <svg
                  viewBox={`0 0 ${currentPlano.dimensiones_viewbox?.width || 7680} ${currentPlano.dimensiones_viewbox?.height || 5433}`}
                  className="w-full h-full object-contain"
                >
                  {currentPlano.svg_content ? (
                    <g dangerouslySetInnerHTML={{ __html: currentPlano.svg_content }} />
                  ) : (
                    (currentPlano.archivo_data_url || currentPlano.archivo_original_url) && (
                      <image
                        href={(currentPlano.archivo_data_url || currentPlano.archivo_original_url)!}
                        x="0"
                        y="0"
                        width={currentPlano.dimensiones_viewbox?.width || 7680}
                        height={currentPlano.dimensiones_viewbox?.height || 5433}
                        preserveAspectRatio="xMidYMid meet"
                      />
                    )
                  )}

                  {/* Polígonos de las Zonas en el Mapa Móvil (Solo líneas limpias + toque directo) */}
                  {zonasFiltradas.map((z) => {
                    const isSelected = selectedZona?.id === z.id;
                    const pts = z.poligono_svg?.puntos || [];
                    if (pts.length < 3) return null;
                    const pointsStr = pts.map(p => `${p.x},${p.y}`).join(' ');
                    const vbW = currentPlano.dimensiones_viewbox?.width || 7680;
                    const s = Math.max(1, vbW / 900);

                    return (
                      <g
                        key={z.id}
                        onClick={() => handleSelectZonaForTour(z)}
                        className="cursor-pointer"
                      >
                        <polygon
                          points={pointsStr}
                          fill={isSelected ? 'rgba(14, 165, 233, 0.28)' : 'rgba(56, 189, 248, 0.10)'}
                          stroke={isSelected ? '#38bdf8' : '#0284c7'}
                          strokeWidth={(isSelected ? 3 : 2) * s}
                        />
                      </g>
                    );
                  })}

                  {/* Pines de Hallazgos / Elementos */}
                  {elementos.map((elem) => {
                    const vbW = currentPlano.dimensiones_viewbox?.width || 7680;
                    const s = Math.max(1, vbW / 900);
                    return (
                      <circle
                        key={elem.id}
                        cx={elem.coordenadas_pin.x}
                        cy={elem.coordenadas_pin.y}
                        r={8 * s}
                        fill={elem.estado_actual === 'rojo' ? '#ef4444' : elem.estado_actual === 'naranja' ? '#f97316' : '#f59e0b'}
                        stroke="#fff"
                        strokeWidth={2 * s}
                        onClick={() => {
                          setSelectedElemento(elem);
                          setInspectionTargetMode('elemento');
                          const z = zonas.find(zn => zn.id === elem.zona_id);
                          if (z) setSelectedZona(z);
                        }}
                      />
                    );
                  })}

                  {/* Punto Azul "Estás Aquí" del GPS del Inspector */}
                  {gpsData?.pixelX && gpsData?.pixelY && (
                    <g>
                      <circle
                        cx={gpsData.pixelX}
                        cy={gpsData.pixelY}
                        r={24 * Math.max(1, (currentPlano.dimensiones_viewbox?.width || 7680) / 900)}
                        fill="rgba(16, 185, 129, 0.25)"
                      />
                      <circle
                        cx={gpsData.pixelX}
                        cy={gpsData.pixelY}
                        r={10 * Math.max(1, (currentPlano.dimensiones_viewbox?.width || 7680) / 900)}
                        fill="#10b981"
                        stroke="#ffffff"
                        strokeWidth={3 * Math.max(1, (currentPlano.dimensiones_viewbox?.width || 7680) / 900)}
                      />
                    </g>
                  )}
                </svg>
              </div>
            </div>
          )}

          {/* Panel de la Zona Actualmente Seleccionada y Selector de Alcance (Zona General vs Hallazgo Puntual) */}
          {selectedZona && (
            <div className="bg-slate-950 p-3 rounded-xl border border-sky-500/40 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-mono text-sky-400 font-bold uppercase">ZONA ACTIVA EN RECORRIDO:</span>
                  <h3 className="text-sm font-black text-white">
                    {selectedZona.codigo} — {selectedZona.nombre}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAjustarZonaModalOpen(true)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-bold rounded-lg text-[11px] flex-shrink-0"
                >
                  ⚙️ Andamio Zona
                </button>
              </div>

              {/* ¿Qué desea relevar dentro de esta Zona? */}
              <div className="space-y-2 pt-1 border-t border-slate-800">
                <span className="text-[11px] text-slate-300 font-bold block">
                  ¿Qué estás relevando en esta Zona?
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setInspectionTargetMode('zona_general')}
                    className={`p-2.5 rounded-xl border text-left transition ${
                      inspectionTargetMode === 'zona_general'
                        ? 'bg-sky-500/20 border-sky-400 text-white font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <span className="block text-xs">🏢 Estado General de la Zona</span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      Evalúa pintura, corrosión, andamio y fotos generales del sector
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (elementosDeZona.length === 0) {
                        setIsFieldPinModalOpen(true);
                      } else {
                        setInspectionTargetMode('elemento');
                        if (!selectedElemento) setSelectedElemento(elementosDeZona[0]);
                      }
                    }}
                    className={`p-2.5 rounded-xl border text-left transition ${
                      inspectionTargetMode === 'elemento'
                        ? 'bg-amber-500/20 border-amber-400 text-white font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <span className="block text-xs">📍 Elemento / Hallazgo Puntual ({elementosDeZona.length})</span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      Identifica una columna, viga, soporte, cañería o interferencia
                    </span>
                  </button>
                </div>

                {/* Lista de elementos de la zona o botón para agregar uno nuevo */}
                <div className="flex items-center gap-2 pt-1">
                  {elementosDeZona.length > 0 && (
                    <select
                      value={selectedElemento?.id || ''}
                      onChange={(e) => {
                        const found = elementosDeZona.find(el => el.id === e.target.value);
                        if (found) {
                          setSelectedElemento(found);
                          setInspectionTargetMode('elemento');
                        }
                      }}
                      className="flex-1 bg-slate-900 border border-slate-700 text-white font-mono text-xs rounded-lg p-2"
                    >
                      {elementosDeZona.map(el => (
                        <option key={el.id} value={el.id}>
                          📍 {el.tag_codigo} ({el.tipo_elemento.replace('_', ' ')})
                        </option>
                      ))}
                    </select>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsFieldPinModalOpen(true)}
                    className="px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg text-xs flex items-center space-x-1 shadow flex-shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Agregar Elemento / Hallazgo en {selectedZona.codigo}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* PASO 2: GALERÍA MULTI-FOTO WEBP Y EVALUACIÓN TÉCNICA */}
        <form onSubmit={handleSaveInspection} className="space-y-4">
          {/* Galería Multi-Foto por Zona / Hallazgo */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-1.5">
                  <Camera className="w-4 h-4 text-amber-400" />
                  <span>Galería Fotográfica de la Zona ({fotosGaleria.length} fotos)</span>
                </span>
                <span className="text-[10px] text-slate-400 block">
                  Podés subir múltiples fotos por zona. Cada foto se comprime a WebP (~180KB) y admite dibujo y nota individual.
                </span>
              </div>

              <label className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs rounded-lg cursor-pointer flex items-center space-x-1 shadow flex-shrink-0">
                <Plus className="w-3.5 h-3.5" />
                <span>+ Agregar Fotos</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleMultiPhotoUpload}
                  className="hidden"
                />
              </label>
            </div>

            {isCompressing && (
              <div className="text-center py-2 text-xs text-amber-400 font-mono animate-pulse">
                Comprimiendo fotografías a WebP de alta eficiencia...
              </div>
            )}

            {fotosGaleria.length === 0 ? (
              <label className="border-2 border-dashed border-slate-700 hover:border-amber-400 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer bg-slate-950/60 hover:bg-slate-950 transition">
                <Camera className="w-9 h-9 text-amber-400 mb-2" />
                <span className="text-sm font-bold text-slate-200">
                  Tomar Fotos de {inspectionTargetMode === 'elemento' && selectedElemento ? selectedElemento.tag_codigo : selectedZona?.codigo || 'Zona'}
                </span>
                <span className="text-xs text-slate-500 mt-1 text-center">
                  Permite seleccionar o capturar varias fotos seguidas del recorrido
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleMultiPhotoUpload}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="space-y-3">
                {/* Miniaturas del Carrusel Multi-Foto */}
                <div className="flex items-center space-x-2 overflow-x-auto pb-1">
                  {fotosGaleria.map((f, idx) => (
                    <div
                      key={f.id || idx}
                      onClick={() => setActivePhotoIndex(idx)}
                      className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 cursor-pointer flex-shrink-0 transition ${
                        idx === activePhotoIndex ? 'border-amber-400 ring-2 ring-amber-400/50 scale-105' : 'border-slate-700 opacity-70'
                      }`}
                    >
                      <img src={f.thumbnail_data_url} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                      <span className="absolute bottom-0 left-0 right-0 bg-black/75 text-[9px] font-mono text-center text-white">
                        #{idx + 1} ({Math.round(f.peso_bytes / 1024)}KB)
                      </span>
                    </div>
                  ))}

                  <label className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-700 hover:border-amber-400 flex flex-col items-center justify-center cursor-pointer text-slate-400 hover:text-amber-400 flex-shrink-0">
                    <Plus className="w-5 h-5" />
                    <span className="text-[9px] font-bold">+ Foto</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleMultiPhotoUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Editor Vectorial y Comentario de la Foto Seleccionada */}
                {activePhoto && (
                  <div className="space-y-2.5 bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-amber-400 font-mono">
                        Editando Foto #{activePhotoIndex + 1} de {fotosGaleria.length}
                        {lastCompressionRatio ? ` (-${lastCompressionRatio}% WebP)` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(activePhotoIndex)}
                        className="text-red-400 hover:text-red-300 flex items-center space-x-1 text-[11px]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Quitar esta foto</span>
                      </button>
                    </div>

                    <VectorAnnotationCanvas
                      imageSrc={activePhoto.thumbnail_data_url}
                      annotations={activePhoto.anotaciones_canvas}
                      onChange={handleUpdateActivePhotoAnnotations}
                    />

                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">
                        Comentario / Identificación en Foto #{activePhotoIndex + 1}:
                      </label>
                      <input
                        type="text"
                        value={activePhoto.comentario || ''}
                        onChange={(e) => handleUpdateActivePhotoComment(e.target.value)}
                        placeholder="Ej: Corrosión severa en apoyo de viga / Interferencia cañería para andamio..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Clasificación Técnica de Corrosión ISO 4628 */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
              Evaluación Técnica ({inspectionTargetMode === 'elemento' && selectedElemento ? `Activo: ${selectedElemento.tag_codigo}` : `Zona: ${selectedZona?.codigo || 'General'}`})
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
                  <option value="acero_inoxidable_304">Acero Inoxidable 304 / 316</option>
                  <option value="hormigon_armado">Hormigón Industrial / Pedestales</option>
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
                  <option value="sin_recubrimiento">Sin Recubrimiento</option>
                </select>
              </div>
            </div>

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
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Porcentaje de Superficie Afectada en el Sector</span>
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

            <div className="flex items-center justify-between bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div>
                <span className="text-xs font-bold text-white block">¿Requiere Reemplazo Estructural / Calderería?</span>
                <span className="text-[11px] text-slate-400">
                  Activar si hay perforación o pérdida de sección &gt; 25%.
                </span>
              </div>
              <input
                type="checkbox"
                checked={requiereReemplazo}
                onChange={(e) => setRequiereReemplazo(e.target.checked)}
                className="w-5 h-5 accent-red-500 rounded cursor-pointer"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">Observaciones Generales del Recorrido en Zona</label>
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Describe el estado de las estructuras, interferencias para andamios, riesgos operativos..."
                rows={2}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Validación de Andamio y Acceso en Campo */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                <HardHat className="w-4 h-4 text-amber-400" />
                <span>Validación de Andamio en Terreno</span>
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

            {requiereAndamioCampo && (
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
                  <label className="text-slate-400 block mb-1">Altura (m)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={alturaAndamioCampo}
                    onChange={(e) => setAlturaAndamioCampo(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Volumen (m³)</label>
                  <input
                    type="number"
                    value={volumenAndamioCampo}
                    onChange={(e) => setVolumenAndamioCampo(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Botón Guardar y Sincronizar */}
          <button
            type="submit"
            className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-sm uppercase tracking-wider rounded-xl shadow-xl transition flex items-center justify-center space-x-2"
          >
            <Save className="w-5 h-5" />
            <span>
              Guardar Relevamiento ({fotosGaleria.length} fotos) y Sincronizar
            </span>
          </button>
        </form>

        {savedSuccess && (
          <div className="p-4 bg-emerald-950 border-2 border-emerald-500 rounded-xl text-emerald-300 text-center font-bold text-sm">
            ✓ ¡Relevamiento guardado y sincronizado con Neon PostgreSQL y Backblaze B2!
          </div>
        )}

        {/* Historial de Inspecciones Registradas */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
              <Clock className="w-4 h-4 text-sky-400" />
              <span>Historial de Relevamientos ({inspeccionesLocales.length})</span>
            </span>
            <button
              type="button"
              onClick={() => setIsReportModalOpen(true)}
              className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-bold flex items-center space-x-1"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Ver Reporte</span>
            </button>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {inspeccionesLocales.length === 0 ? (
              <p className="text-xs text-slate-500 py-2 text-center">Aún no hay inspecciones registradas.</p>
            ) : (
              inspeccionesLocales.map((insp) => (
                <div
                  key={insp.id}
                  className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-mono font-bold text-amber-400 block">
                      {insp.zona_codigo ? `[Zona ${insp.zona_codigo}] ` : ''}{insp.elemento_id}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {insp.grado_corrosion} · {insp.porcentaje_afectado}% afectado · 📸 {insp.fotos?.length || 0} fotos
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
        onElementSelect={(elem) => {
          setSelectedElemento(elem);
          setInspectionTargetMode('elemento');
          const z = zonas.find(zn => zn.id === elem.zona_id);
          if (z) setSelectedZona(z);
        }}
      />

      {/* Modal de Reporte Automático de Relevamiento */}
      <ReporteRelevamientoModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        area={areas.find(a => a.id === selectedAreaId)}
        plano={currentPlano}
        elementos={elementos}
        inspecciones={inspeccionesLocales}
      />

      {/* Modal Rápido para Agregar Elemento / Hallazgo dentro de la Zona Activa */}
      {isFieldPinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border-2 border-sky-500 rounded-2xl overflow-hidden shadow-2xl p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-white font-bold text-sm">
                <MapPin className="w-5 h-5 text-sky-400" />
                <span>Agregar Elemento / Hallazgo en {selectedZona?.codigo || 'Zona'}</span>
              </div>
              <button onClick={() => setIsFieldPinModalOpen(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateFieldPin} className="space-y-3">
              <div>
                <label className="text-slate-400 block mb-1">Identificación / TAG del Elemento o Hallazgo *</label>
                <input
                  type="text"
                  placeholder="Ej: COL-04, SOPORTE-VAPOR, BARANDA-NORTE, HITO-INTERFERENCIA..."
                  value={fieldTag}
                  onChange={(e) => setFieldTag(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono font-bold uppercase focus:border-sky-400 focus:outline-none"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Tipo de Elemento / Hallazgo</label>
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
                  <option value="tanque">Tanque / Clarificador / Equipo</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Ubicación / Descripción Corta</label>
                <input
                  type="text"
                  placeholder="Ej: Sector ingreso bombas de lodos, junto a escalera..."
                  value={fieldDescripcion}
                  onChange={(e) => setFieldDescripcion(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
                />
              </div>

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
                  Agregar a {selectedZona?.codigo || 'Zona'}
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
        zona={selectedZona || zonas[0] || null}
        onZonaUpdated={async () => {
          const fresh = await db.zonas.toArray();
          setZonas(fresh);
          if (selectedZona) {
            const updated = fresh.find(z => z.id === selectedZona.id);
            if (updated) setSelectedZona(updated);
          }
        }}
      />
    </div>
  );
}
