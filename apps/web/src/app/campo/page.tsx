'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  Image as ImageIcon,
  Building2,
  Activity,
  Info,
  Play,
  Square,
  LogOut,
  HardDrive
} from 'lucide-react';
import { db } from '../../lib/db';
import {
  pullAndReconcileFromCloud,
  pushFastSyncToCloud,
  smartEdgeHeartbeatSync,
  markLocalEntityPendingPush,
  deleteFromCloud
} from '../../lib/cloudSync';
import { getSyncRequestHeaders, sanitizeSvgContent } from '../../lib/security';
import { compressInspectionPhoto } from '../../lib/imageCompression';
import { loadMaterialsCatalog, MaterialCatalogItem } from '../../lib/materialsCatalog';
import { calcularMuestreoTramo } from '../../lib/degradationModel';
import { syncManager } from '../../lib/syncManager';
import { SyncStatusBadge } from '../../components/campo/SyncStatusBadge';
import { VectorAnnotationCanvas } from '../../components/campo/VectorAnnotationCanvas';
import { QRScannerModal } from '../../components/campo/QRScannerModal';
import { ReporteRelevamientoModal } from '../../components/campo/ReporteRelevamientoModal';
import { AjustarZonaCampoModal } from '../../components/campo/AjustarZonaCampoModal';
import { SyncComparatorModal } from '../../components/ingenieria/SyncComparatorModal';
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
  MorfologiaCorrosiva,
  AmbienteISO12944, 
  ZonaInspeccion,
  HitoGeografico,
  EvaluacionCivilItem
} from '../../types';

const CORROSION_INFO: Record<string, { titulo: string; area: string; desc: string; color: string }> = {
  'Ri 0': {
    titulo: 'Ri 0 — Sin corrosión (Intacto)',
    area: '0% oxidado',
    desc: 'Recubrimiento y sustrato sanos, sin ampollas ni óxido visible.',
    color: 'text-emerald-400 border-emerald-500/40 bg-emerald-950/40'
  },
  'Ri 1': {
    titulo: 'Ri 1 — Muy leve / Puntual',
    area: '~0.05% oxidado',
    desc: 'Puntos aislados de óxido superficial o micro-ampollamiento incipiente.',
    color: 'text-emerald-300 border-emerald-500/40 bg-emerald-950/30'
  },
  'Ri 2': {
    titulo: 'Ri 2 — Leve / Moderado',
    area: '~0.5% oxidado',
    desc: 'Manchas de óxido localizadas en bordes, soldaduras o cantos vivos.',
    color: 'text-lime-300 border-lime-500/40 bg-lime-950/30'
  },
  'Ri 3': {
    titulo: 'Ri 3 — Medio / Extendido',
    area: '~1% a 5% oxidado',
    desc: 'Desprendimiento de pintura y corrosión activa superficial; requiere mantenimiento.',
    color: 'text-amber-300 border-amber-500/40 bg-amber-950/40'
  },
  'Ri 4': {
    titulo: 'Ri 4 — Severo / Generalizado',
    area: '~8% a 25% oxidado',
    desc: 'Óxido en escamas o picaduras (pitting); inicio de pérdida de espesor.',
    color: 'text-orange-300 border-orange-500/40 bg-orange-950/40'
  },
  'Ri 5': {
    titulo: 'Ri 5 — Muy Severo / Crítico',
    area: '> 40% - 50% oxidado',
    desc: 'Corrosión profunda, laminación o perforación; evaluar refuerzo o reemplazo.',
    color: 'text-red-300 border-red-500/50 bg-red-950/50'
  }
};

const CATALOGO_ELEMENTOS_CIVILES = [
  { id: 'juntas', label: 'Juntas (Dilatación / Constructivas)' },
  { id: 'tabiques', label: 'Tabiques / Muros de Contención' },
  { id: 'columnas', label: 'Columnas / Pedestales de H°A°' },
  { id: 'vigas', label: 'Vigas / Dinteles Civiles' },
  { id: 'losas', label: 'Losas / Pisos Industriales' },
  { id: 'bases_bombas', label: 'Bases de Bombas / Fundaciones' }
];

const PATOLOGIAS_CIVILES_SUGERIDAS = [
  'Fisuración / Grietas',
  'Desprendimiento (Spalling)',
  'Armadura Expuesta / Oxidada',
  'Falla de Sello en Junta',
  'Grout Fisurado / Vibración',
  'Ataque Químico / Eflorescencia',
  'Humedad / Filtración Activa',
  'Asentamiento / Desnivel'
];

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
  const [isZoneLocked, setIsZoneLocked] = useState<boolean>(true);

  const selectedZonaIdRef = useRef<string | null>(null);
  const selectedPlanoIdRef = useRef<string>('');
  const isZoneLockedRef = useRef<boolean>(true);

  useEffect(() => {
    selectedZonaIdRef.current = selectedZona?.id || null;
  }, [selectedZona]);

  useEffect(() => {
    selectedPlanoIdRef.current = selectedPlanoId;
  }, [selectedPlanoId]);

  useEffect(() => {
    isZoneLockedRef.current = isZoneLocked;
  }, [isZoneLocked]);

  // Alcance dentro de la zona: 'zona_general' (relevamiento de la zona completa) o 'elemento' (activo/hallazgo puntual)
  const [inspectionTargetMode, setInspectionTargetMode] = useState<'zona_general' | 'elemento'>('zona_general');

  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isAjustarZonaModalOpen, setIsAjustarZonaModalOpen] = useState(false);
  const [isSyncComparatorOpen, setIsSyncComparatorOpen] = useState(false);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [viewMode, setViewMode] = useState<'zonas' | 'mapa'>('zonas');

  // Coordenadas GPS Satelital de Terreno, seguimiento en vivo del recorrido y proyección sobre el plano CAD
  const [gpsData, setGpsData] = useState<{ lat: number; lng: number; precision_m: number; pixelX?: number; pixelY?: number; timestamp?: string } | null>(null);
  const [isGettingGps, setIsGettingGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isTrackingRoute, setIsTrackingRoute] = useState(false);
  const [gpsRouteHistory, setGpsRouteHistory] = useState<{ lat: number; lng: number; precision_m: number; timestamp: string; pixelX?: number; pixelY?: number; zona_detectada?: string }[]>([]);
  const watchIdRef = useRef<number | null>(null);

  // Estados del formulario de inspección (con opción de texto libre o personalizado)
  const [sustrato, setSustrato] = useState('acero_al_carbono');
  const [customSustrato, setCustomSustrato] = useState('');
  const [recubrimiento, setRecubrimiento] = useState('epoxi_poliamida');
  const [customRecubrimiento, setCustomRecubrimiento] = useState('');
  const [gradoCorrosion, setGradoCorrosion] = useState('Ri 3');
  const [porcentajeAfectado, setPorcentajeAfectado] = useState<number>(20);
  const [requiereReemplazo, setRequiereReemplazo] = useState(false);
  const [observaciones, setObservaciones] = useState('');

  // Sub-sección de Evaluaciones Civiles (Juntas, Tabiques, Columnas, Vigas, Losas, Bases de Bombas y personalizados)
  const [incluirEvaluacionCivil, setIncluirEvaluacionCivil] = useState(false);
  const [itemsCiviles, setItemsCiviles] = useState<EvaluacionCivilItem[]>([]);
  const [nuevoElementoCivilCustom, setNuevoElementoCivilCustom] = useState('');
  const [notasCiviles, setNotasCiviles] = useState('');

  // Filtro de Cota, Área de Planta y Modal de Reportar Hallazgo
  const [cotaFiltro, setCotaFiltro] = useState<string>('todos');
  const [areaFiltro, setAreaFiltro] = useState<string>('todos');
  const [isFieldPinModalOpen, setIsFieldPinModalOpen] = useState(false);
  const [fieldTag, setFieldTag] = useState('');
  const [fieldDisciplina, setFieldDisciplina] = useState<TipoElemento>('acero_estructural');
  const [customFieldDisciplina, setCustomFieldDisciplina] = useState('');
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
  const [usarMuestreoTramo, setUsarMuestreoTramo] = useState<boolean>(false);
  const [tramoLongitudM, setTramoLongitudM] = useState<number>(5);
  const [tramoUnidadesTotales, setTramoUnidadesTotales] = useState<number>(10);
  const [tramoUnidadesAfectadas, setTramoUnidadesAfectadas] = useState<number>(2);
  const [tramoMorfologia, setTramoMorfologia] = useState<MorfologiaCorrosiva>('superficial');
  const [tramoAmbienteISO, setTramoAmbienteISO] = useState<AmbienteISO12944>('C5');
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // GALERÍA MULTI-FOTO POR ZONA / INSPECCIÓN (Ilimitadas fotos WebP con anotaciones y comentario individual)
  const [fotosGaleria, setFotosGaleria] = useState<FotoInspeccionLocal[]>([]);
  const [activePhotoIndex, setActivePhotoIndex] = useState<number>(0);
  const [isCompressing, setIsCompressing] = useState(false);
  const [lastCompressionRatio, setLastCompressionRatio] = useState<number | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [inspeccionesLocales, setInspeccionesLocales] = useState<Inspeccion[]>([]);
  const [catalogMaterials, setCatalogMaterials] = useState<MaterialCatalogItem[]>([]);
  const [inspectorNombreActivo, setInspectorNombreActivo] = useState<string>('Operario / Inspector de Campo');
  const [userRolActivo, setUserRolActivo] = useState<'admin' | 'ingeniero' | 'inspector'>('inspector');

  useEffect(() => {
    setCatalogMaterials(loadMaterialsCatalog());
    try {
      const saved = window.localStorage.getItem('im_user_profile');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.nombre) setInspectorNombreActivo(parsed.nombre);
        if (parsed.rol) setUserRolActivo(parsed.rol);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleLogoutCampo = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('im_user_profile');
      window.location.href = '/login';
    }
  };

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
      if (defaultPlano && !selectedPlanoIdRef.current) {
        setSelectedPlanoId(defaultPlano.id);
        setSelectedAreaId(defaultPlano.area_id);
      } else if (loadedAreas.length > 0 && !selectedAreaId) {
        setSelectedAreaId(loadedAreas[0].id);
      }

      if (loadedZonas.length > 0) {
        const currentZonaId = selectedZonaIdRef.current;
        const freshSelected = currentZonaId ? loadedZonas.find(z => z.id === currentZonaId) : undefined;
        if (freshSelected) {
          setSelectedZona(freshSelected);
        } else {
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
    // 1. Carga inmediata desde Caché Local (IndexedDB en el borde: 0 ms)
    // y en segundo plano compara manifiesto (~500 bytes) para bajar solo lo que falte
    loadAndHydrateFieldData(false).then(() => {
      smartEdgeHeartbeatSync().then(res => {
        if (res.changed) loadAndHydrateFieldData(false);
      });
    });

    // 2. Smart Polling cada 7 segundos usando manifiesto ultraligero (~500 bytes, no descarga imágenes si ya están en caché)
    const onFocus = () => {
      smartEdgeHeartbeatSync().then(res => {
        if (res.changed) loadAndHydrateFieldData(false);
      });
    };
    window.addEventListener('focus', onFocus);
    const interval = setInterval(() => {
      smartEdgeHeartbeatSync().then(res => {
        if (res.changed) loadAndHydrateFieldData(false);
      });
    }, 7000);

    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const currentPlano = planos.find(p => p.id === selectedPlanoId) || planos[0];
  const geoCal = getOrInitGeoreferencia(currentPlano, hitos);
  const zonasDelPlano = zonas.filter(z => (currentPlano ? z.plano_id === currentPlano.id : true));
  const areasDisponibles = Array.from(
    new Set(zonasDelPlano.map(z => (z.area_planta || 'Sin Área Asignada').trim()))
  ).sort();
  const zonasFiltradas = zonasDelPlano.filter(z => {
    const matchCota = cotaFiltro === 'todos' || String(z.cota_nivel || 146000) === cotaFiltro;
    const areaName = (z.area_planta || 'Sin Área Asignada').trim();
    const matchArea = areaFiltro === 'todos' || areaName === areaFiltro;
    return matchCota && matchArea;
  });
  const zonasPorAreaMap = zonasFiltradas.reduce<Record<string, ZonaInspeccion[]>>((acc, z) => {
    const key = (z.area_planta || 'Sin Área Asignada').trim();
    if (!acc[key]) acc[key] = [];
    acc[key].push(z);
    return acc;
  }, {});
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
  const processGpsPosition = (pos: GeolocationPosition, isFromWatch: boolean = false) => {
    const lat = Number(pos.coords.latitude.toFixed(6));
    const lng = Number(pos.coords.longitude.toFixed(6));
    const precision_m = Math.round(pos.coords.accuracy);
    const pixelPos = latLngToPixel(lat, lng, geoCal);
    const timestamp = new Date().toISOString();

    const detectedZone = zonasDelPlano.find(z => isPointInPolygon(pixelPos, z.poligono_svg?.puntos || []));

    const pointEntry = {
      lat,
      lng,
      precision_m,
      timestamp,
      pixelX: pixelPos.x,
      pixelY: pixelPos.y,
      zona_detectada: detectedZone?.codigo
    };

    setGpsData(pointEntry);
    setGpsRouteHistory(prev => {
      const last = prev[prev.length - 1];
      if (last && Math.abs(last.lat - lat) < 0.000015 && Math.abs(last.lng - lng) < 0.000015 && isFromWatch) {
        return prev;
      }
      return [...prev, pointEntry];
    });

    if (detectedZone && !isZoneLockedRef.current && (!isFromWatch || selectedZonaIdRef.current !== detectedZone.id)) {
      handleSelectZonaForTour(detectedZone);
      setSyncMessage(`📍 GPS ubicó al operario en Zona: ${detectedZone.codigo} (${detectedZone.nombre})`);
      setTimeout(() => setSyncMessage(''), 4500);
    }
  };

  const handleCaptureGPS = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGpsError("Tu dispositivo no soporta geolocalización satelital.");
      return;
    }
    setIsGettingGps(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        processGpsPosition(pos, false);
        setIsGettingGps(false);
      },
      (err) => {
        setGpsError("Señal GPS débil o permiso denegado: " + err.message);
        setIsGettingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
    );
  };

  // Iniciar o detener seguimiento continuo de salida a relevamiento en campo
  const handleToggleRouteTracking = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGpsError("Tu dispositivo no soporta geolocalización satelital.");
      return;
    }

    if (isTrackingRoute) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsTrackingRoute(false);
      setSyncMessage(`🛑 Recorrido finalizado (${gpsRouteHistory.length} posiciones GPS registradas).`);
      setTimeout(() => setSyncMessage(''), 4000);
    } else {
      setGpsError(null);
      setIsTrackingRoute(true);
      handleCaptureGPS();
      const id = navigator.geolocation.watchPosition(
        (pos) => processGpsPosition(pos, true),
        (err) => setGpsError("Aviso GPS en recorrido: " + err.message),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
      );
      watchIdRef.current = id;
      setSyncMessage('🛰️ Salida a Relevamiento Activa: registrando posición del operario en campo en tiempo real.');
      setTimeout(() => setSyncMessage(''), 4000);
    }
  };

  // Gestión de ítems de Evaluación Civil (Juntas, Tabiques, Columnas, Vigas, Losas, Bases de Bombas y otros)
  const handleToggleCivilElement = (elemLabel: string) => {
    setItemsCiviles(prev => {
      const exists = prev.some(i => i.elemento_civil === elemLabel);
      if (exists) {
        return prev.filter(i => i.elemento_civil !== elemLabel);
      }
      return [...prev, { elemento_civil: elemLabel, estado: 'regular', patologias: [], observacion: '' }];
    });
  };

  const handleAddCustomCivilElement = () => {
    const trimmed = nuevoElementoCivilCustom.trim();
    if (!trimmed) return;
    if (!itemsCiviles.some(i => i.elemento_civil.toLowerCase() === trimmed.toLowerCase())) {
      setItemsCiviles(prev => [...prev, { elemento_civil: trimmed, estado: 'regular', patologias: [], observacion: '' }]);
    }
    setNuevoElementoCivilCustom('');
  };

  const handleUpdateCivilItem = (elemLabel: string, patch: Partial<EvaluacionCivilItem>) => {
    setItemsCiviles(prev =>
      prev.map(item => (item.elemento_civil === elemLabel ? { ...item, ...patch } : item))
    );
  };

  const handleToggleCivilPatologia = (elemLabel: string, patologia: string) => {
    setItemsCiviles(prev =>
      prev.map(item => {
        if (item.elemento_civil !== elemLabel) return item;
        const has = item.patologias.includes(patologia);
        return {
          ...item,
          patologias: has ? item.patologias.filter(p => p !== patologia) : [...item.patologias, patologia]
        };
      })
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

    const resolvedTipo: TipoElemento = fieldDisciplina === 'otro_personalizado'
      ? (customFieldDisciplina.trim().toLowerCase().replace(/\s+/g, '_') || 'hallazgo_personalizado')
      : fieldDisciplina;

    const newId = `elem_field_${Date.now()}`;
    const newPin: Elemento = {
      id: newId,
      zona_id: targetZona?.id || 'general',
      tag_codigo: fieldTag.trim().toUpperCase(),
      codigo_equipo_erp: fieldDescripcion.trim() || undefined,
      tipo_elemento: resolvedTipo,
      qr_token: `QR-FIELD-${Date.now().toString(36).toUpperCase()}`,
      coordenadas_pin: pinCoords,
      cota_nivel: targetZona?.cota_nivel || fieldCota,
      creado_en_campo: true,
      geometria_parametros: {
        perfil: fieldDisciplina === 'otro_personalizado'
          ? (customFieldDisciplina.trim() || 'Elemento Personalizado')
          : fieldDisciplina === 'parral_caneria'
          ? 'Pipe-Rack W8'
          : fieldDisciplina === 'soporte'
          ? 'Soporte Silleta UPN'
          : 'Hallazgo Campo',
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
    setCustomFieldDisciplina('');
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
          micro_thumbnail_data_url: result.thumbnailDataUrl,
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

    const sustratoFinal = sustrato === 'otro_personalizado'
      ? (customSustrato.trim() || 'Otro sustrato especificado en campo')
      : sustrato;

    const recubrimientoFinal = recubrimiento === 'otro_personalizado'
      ? (customRecubrimiento.trim() || 'Otro recubrimiento especificado en campo')
      : recubrimiento;

    const haySeveroCivil = incluirEvaluacionCivil && itemsCiviles.some(i => i.estado === 'critico' || i.estado === 'severo');

    const nuevaInspeccion: Inspeccion = {
      id: inspeccionId,
      elemento_id: targetElemId,
      zona_id: selectedZona?.id,
      zona_codigo: selectedZona?.codigo,
      inspector_nombre: inspectorNombreActivo,
      fecha_inspeccion: new Date().toISOString(),
      estado_sincronizacion: 'pendiente',
      clasificacion_sustrato: sustratoFinal,
      clasificacion_recubrimiento: recubrimientoFinal,
      grado_corrosion: gradoCorrosion,
      requiere_reemplazo: requiereReemplazo,
      porcentaje_afectado: porcentajeAfectado,
      criticidad_calculada: requiereReemplazo ? 5 : (gradoCorrosion === 'Ri 4' || gradoCorrosion === 'Ri 5' || haySeveroCivil) ? 4 : 3,
      antiguedad_anios: antiguedadAnios,
      ultimo_revestimiento_anios: ultimoRevestimientoAnios,
      tasa_avance_anual_pct: tasaAvancePct,
      meses_ventana_intervencion: mesesVentanaIntervencion,
      coordenadas_gps: gpsData
        ? {
            lat: gpsData.lat,
            lng: gpsData.lng,
            precision_m: gpsData.precision_m,
            timestamp: gpsData.timestamp || new Date().toISOString(),
            en_recorrido: isTrackingRoute
          }
        : undefined,
      historial_recorrido_gps: gpsRouteHistory.length > 0 ? gpsRouteHistory : undefined,
      evaluacion_civil: incluirEvaluacionCivil && (itemsCiviles.length > 0 || notasCiviles.trim() !== '')
        ? {
            aplica: true,
            items: itemsCiviles,
            notas_civiles: notasCiviles.trim() || undefined
          }
        : undefined,
      muestreo_tramo: usarMuestreoTramo
        ? calcularMuestreoTramo({
            longitudTramoM: tramoLongitudM,
            unidadesTotales: tramoUnidadesTotales,
            unidadesAfectadas: tramoUnidadesAfectadas,
            morfologiaDominante: tramoMorfologia,
            ambienteIso12944: tramoAmbienteISO,
            ultimoRevestimientoAnios,
            inspeccionesPrevias: inspeccionesLocales.filter(i =>
              inspectionTargetMode === 'elemento' && selectedElemento
                ? i.elemento_id === selectedElemento.id
                : (i.zona_id === selectedZona?.id || i.elemento_id === `ZONA:${selectedZona?.codigo}`)
            )
          }).muestreo
        : undefined,
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
          estimado_en_campo_por: inspectorNombreActivo
        }
      };
      await db.zonas.put(updatedZona);
      setSelectedZona(updatedZona);
      setZonas(await db.zonas.toArray());
    }

    // Guardar en Dexie y disparar subida única de la inspección (y sus fotos a B2)
    await syncManager.enqueueInspection(nuevaInspeccion);

    // Sincronizar zonas y elementos actualizados (sin reenviar la inspección para evitar doble subida a B2)
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      fetch('/api/sync-neon', {
        method: 'POST',
        headers: getSyncRequestHeaders(),
        body: JSON.stringify({
          zonas: await db.zonas.toArray(),
          elementos: await db.elementos.toArray()
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
          {userRolActivo !== 'inspector' && (
            <Link href="/ingenieria/planos" className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-950 border border-slate-800" title="Volver a Ingeniería">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          )}
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
            onClick={() => setIsSyncComparatorOpen(true)}
            className="flex items-center space-x-1 px-2 py-1.5 bg-slate-950 hover:bg-slate-800 border border-indigo-500/50 text-indigo-300 font-mono font-bold text-[11px] rounded-lg transition"
            title="Comparar Caché Local del Celular vs. Nube"
          >
            <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
            <span>Caché</span>
          </button>

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

          <button
            type="button"
            onClick={handleLogoutCampo}
            title={`Cerrar sesión (${inspectorNombreActivo})`}
            className="p-1.5 bg-slate-950 hover:bg-red-950/60 text-slate-400 hover:text-red-300 border border-slate-800 rounded-lg transition"
          >
            <LogOut className="w-4 h-4" />
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

          {/* Barra GPS en Vivo y Registro de Salida a Relevamiento del Operario en Campo */}
          <div className="bg-slate-950 p-3 rounded-xl border border-emerald-500/40 space-y-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <Compass className={`w-5 h-5 text-emerald-400 ${isGettingGps || isTrackingRoute ? 'animate-spin' : ''}`} />
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="font-black text-slate-100">
                      {isTrackingRoute ? '🛰️ Operario en Campo (Tracking GPS Activo)' : 'Posición GPS del Operario en Campo'}
                    </span>
                    {isTrackingRoute && (
                      <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 rounded animate-pulse">
                        EN RECORRIDO ({gpsRouteHistory.length} pts)
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-emerald-400 block">
                    {gpsData
                      ? `Lat ${gpsData.lat}, Lng ${gpsData.lng} (±${gpsData.precision_m}m)${selectedZona ? ` · Zona: ${selectedZona.codigo}` : ''}`
                      : 'Sin posición registrada aún — inicia salida o captura punto GPS'}
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={handleToggleRouteTracking}
                  className={`px-3 py-1.5 font-extrabold rounded-lg text-xs flex items-center space-x-1 shadow transition ${
                    isTrackingRoute
                      ? 'bg-red-600 hover:bg-red-500 text-white'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-black'
                  }`}
                >
                  {isTrackingRoute ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isTrackingRoute ? 'Detener Recorrido' : 'Iniciar Salida a Campo'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCaptureGPS}
                  disabled={isGettingGps}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 font-bold rounded-lg text-xs flex items-center space-x-1 transition"
                  title="Capturar posición puntual ahora"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>{isGettingGps ? '...' : 'Capturar Punto'}</span>
                </button>
              </div>
            </div>

            {gpsRouteHistory.length > 0 && (
              <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400 font-mono">
                <span>
                  Bitácora de recorrido: <strong className="text-emerald-300">{gpsRouteHistory.length} coordenadas</strong> registradas en la salida
                </span>
                <span>
                  Última marca: {new Date(gpsRouteHistory[gpsRouteHistory.length - 1].timestamp).toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>
          {gpsError && <p className="text-[11px] text-amber-400">{gpsError}</p>}

          {/* Filtro Rápido por Área de Planta (ej. Efluentes, Blanqueo, Caustificación...) */}
          {areasDisponibles.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
              <span className="text-slate-400 font-bold flex-shrink-0">🏭 Área:</span>
              <button
                type="button"
                onClick={() => setAreaFiltro('todos')}
                className={`px-2.5 py-1 rounded-full font-bold flex-shrink-0 border transition ${
                  areaFiltro === 'todos'
                    ? 'bg-emerald-500 text-black border-emerald-400'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-600'
                }`}
              >
                Todas ({zonasDelPlano.length})
              </button>
              {areasDisponibles.map(areaName => {
                const count = zonasDelPlano.filter(z => (z.area_planta || 'Sin Área Asignada').trim() === areaName).length;
                return (
                  <button
                    key={areaName}
                    type="button"
                    onClick={() => setAreaFiltro(areaName)}
                    className={`px-2.5 py-1 rounded-full font-bold flex-shrink-0 border transition ${
                      areaFiltro === areaName
                        ? 'bg-emerald-500 text-black border-emerald-400'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    {areaName} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {/* VISTA A: LISTA DE LAS ZONAS AGRUPADAS POR ÁREA DE PLANTA */}
          {viewMode === 'zonas' && (
            <div className="space-y-3">
              {zonasFiltradas.length === 0 ? (
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-center space-y-2 text-xs text-slate-400">
                  <p>No se encontraron zonas para el filtro seleccionado.</p>
                  <button
                    type="button"
                    onClick={handleFullCloudSync}
                    className="px-3 py-1.5 bg-indigo-600 text-white font-bold rounded-lg"
                  >
                    Descargar Zonas desde Neon Cloud
                  </button>
                </div>
              ) : (
                Object.entries(zonasPorAreaMap).map(([areaName, zonasGrupo]) => {
                  const relevadasEnArea = zonasGrupo.filter(z =>
                    inspeccionesLocales.some(i => i.zona_id === z.id || i.elemento_id === `ZONA:${z.codigo}`)
                  ).length;

                  return (
                    <div key={areaName} className="space-y-2">
                      <div className="flex items-center justify-between px-2 py-1 bg-slate-950/90 border border-slate-800 rounded-lg text-[11px]">
                        <span className="font-black text-emerald-400 uppercase tracking-wide flex items-center space-x-1.5">
                          <Building2 className="w-3.5 h-3.5" />
                          <span>{areaName}</span>
                        </span>
                        <span className="font-mono text-slate-300 font-bold">
                          {relevadasEnArea}/{zonasGrupo.length} relevadas
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {zonasGrupo.map((z) => {
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
                        })}
                      </div>
                    </div>
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
                    <g dangerouslySetInnerHTML={{ __html: sanitizeSvgContent(currentPlano.svg_content) }} />
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

                  {/* Traza del Recorrido GPS del Operario en Campo */}
                  {gpsRouteHistory.length > 1 && (
                    <polyline
                      fill="none"
                      stroke="#10b981"
                      strokeWidth={3 * Math.max(1, (currentPlano.dimensiones_viewbox?.width || 7680) / 900)}
                      strokeDasharray={`${6 * Math.max(1, (currentPlano.dimensiones_viewbox?.width || 7680) / 900)},${4 * Math.max(1, (currentPlano.dimensiones_viewbox?.width || 7680) / 900)}`}
                      points={gpsRouteHistory
                        .filter(pt => pt.pixelX !== undefined && pt.pixelY !== undefined)
                        .map(pt => `${pt.pixelX},${pt.pixelY}`)
                        .join(' ')}
                    />
                  )}

                  {/* Punto Verde "Operario Aquí" del GPS del Inspector */}
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
                  <span className="text-[10px] font-mono text-sky-400 font-bold uppercase">
                    ZONA ACTIVA EN RECORRIDO {isZoneLocked ? '· 🔒 FIJADA' : '· 🔓 AUTO GPS'}:
                  </span>
                  <h3 className="text-sm font-black text-white">
                    {selectedZona.codigo} — {selectedZona.nombre}
                  </h3>
                </div>
                <div className="flex items-center space-x-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsZoneLocked(prev => !prev)}
                    className={`px-2.5 py-1 border font-bold rounded-lg text-[11px] transition ${
                      isZoneLocked
                        ? 'bg-emerald-950/80 border-emerald-500/70 text-emerald-300'
                        : 'bg-slate-800 border-slate-700 text-slate-300'
                    }`}
                    title={isZoneLocked ? 'Zona fijada: ni el GPS ni el polling cambiarán tu zona actual' : 'Modo automático: el GPS puede cambiar la zona al caminar'}
                  >
                    {isZoneLocked ? '🔒 Fijada' : '🔓 Libre'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAjustarZonaModalOpen(true)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-bold rounded-lg text-[11px]"
                  >
                    ⚙️ Andamio Zona
                  </button>
                </div>
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
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
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
                      className="w-full sm:flex-1 min-w-0 bg-slate-900 border border-slate-700 text-white font-mono text-xs rounded-lg p-2"
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
                    className="w-full sm:w-auto px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg text-xs flex items-center justify-center space-x-1 shadow flex-shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="truncate">+ Agregar Hallazgo en {selectedZona.codigo}</span>
                  </button>
                </div>

                {inspectionTargetMode === 'elemento' && selectedElemento && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={async () => {
                        const nuevoTag = window.prompt('Editar Tag / Código del Pin:', selectedElemento.tag_codigo);
                        if (!nuevoTag || !nuevoTag.trim()) return;
                        const updated: Elemento = { ...selectedElemento, tag_codigo: nuevoTag.trim().toUpperCase() };
                        await db.elementos.put(updated);
                        setElementos(await db.elementos.toArray());
                        setSelectedElemento(updated);
                        if (typeof navigator === 'undefined' || navigator.onLine) {
                          pushFastSyncToCloud({ includePlanImages: false, authoritativeZonas: false, authoritativeHitos: false }).catch(() => null);
                        }
                      }}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-[11px] font-semibold"
                    >
                      ✏️ Editar Tag
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!gpsData) {
                          alert('Primero capturá tu ubicación GPS actual arriba para reubicar este pin.');
                          return;
                        }
                        const newPixel = latLngToPixel(gpsData.lat, gpsData.lng, geoCal);
                        const updated: Elemento = {
                          ...selectedElemento,
                          coordenadas_pin: { x: Math.round(newPixel.x), y: Math.round(newPixel.y) },
                          coordenadas_gps: { lat: gpsData.lat, lng: gpsData.lng, precision_m: gpsData.precision_m }
                        };
                        await db.elementos.put(updated);
                        setElementos(await db.elementos.toArray());
                        setSelectedElemento(updated);
                        if (typeof navigator === 'undefined' || navigator.onLine) {
                          pushFastSyncToCloud({ includePlanImages: false, authoritativeZonas: false, authoritativeHitos: false }).catch(() => null);
                        }
                      }}
                      className="px-2.5 py-1 bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-700/60 rounded-lg text-[11px] font-semibold"
                    >
                      📍 Reubicar Pin con GPS
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`¿Eliminar el pin "${selectedElemento.tag_codigo}"?`)) return;
                        const idDel = selectedElemento.id;
                        await db.elementos.delete(idDel);
                        const rest = await db.elementos.toArray();
                        setElementos(rest);
                        const nextInZona = rest.find(e => e.zona_id === selectedZona.id) || null;
                        setSelectedElemento(nextInZona);
                        if (!nextInZona) setInspectionTargetMode('zona_general');
                        await deleteFromCloud('elemento', idDel).catch(() => null);
                      }}
                      className="px-2.5 py-1 bg-red-950/70 hover:bg-red-900/80 text-red-300 border border-red-800/60 rounded-lg text-[11px] font-semibold flex items-center space-x-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Eliminar Pin</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Última Inspección Previa para comparación en terreno */}
              {(() => {
                const prevInsp = inspeccionesLocales.find(i =>
                  inspectionTargetMode === 'elemento' && selectedElemento
                    ? i.elemento_id === selectedElemento.id
                    : (i.zona_id === selectedZona.id || i.elemento_id === `ZONA:${selectedZona.codigo}`)
                );
                if (!prevInsp) return null;
                return (
                  <div className="mt-2 p-2.5 rounded-lg bg-slate-900/90 border border-indigo-500/40 space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold text-indigo-300 uppercase tracking-wider">
                        Última Inspección Previa ({new Date(prevInsp.fecha_inspeccion).toLocaleDateString()})
                      </span>
                      <span className="font-mono font-bold text-amber-300">
                        {prevInsp.grado_corrosion} · {prevInsp.porcentaje_afectado}%
                      </span>
                    </div>
                    {prevInsp.observaciones && (
                      <p className="text-[11px] text-slate-300 line-clamp-2">{prevInsp.observaciones}</p>
                    )}
                    {prevInsp.diagnostico_ia?.recomendacion_tecnica && (
                      <p className="text-[10px] text-emerald-300/90 line-clamp-2">
                        IA/Ing: {prevInsp.diagnostico_ia.recomendacion_tecnica}
                      </p>
                    )}
                  </div>
                );
              })()}
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

          {/* Clasificación Técnica de Corrosión ISO 4628 + Libertad de Selección + Sub-sección Evaluaciones Civiles */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div>
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider block">
                  Evaluación Técnica ({inspectionTargetMode === 'elemento' && selectedElemento ? `Activo: ${selectedElemento.tag_codigo}` : `Zona: ${selectedZona?.codigo || 'General'}`})
                </span>
                <span className="text-[10px] text-slate-400">
                  Seleccioná de la lista o elegí &quot;+ Otro / Especificar...&quot; para ingresar cualquier elemento libremente
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsFieldPinModalOpen(true)}
                className="px-2.5 py-1 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 rounded-lg text-[11px] font-bold flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nuevo Elemento Libre</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1.5">
                <label className="text-slate-400 block">Sustrato / Material Base</label>
                <select
                  value={sustrato}
                  onChange={(e) => setSustrato(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                >
                  <option value="acero_al_carbono">Acero al Carbono Estructural</option>
                  <option value="acero_galvanizado">Acero Galvanizado en Caliente</option>
                  <option value="acero_inoxidable_304">Acero Inoxidable 304 / 316</option>
                  <option value="hormigon_armado">Hormigón Armado / Civil</option>
                  <option value="fundicion_hierro">Fundición / Carcasa de Bomba</option>
                  <option value="prfv_fibra">PRFV / Fibra de Vidrio / Polímero</option>
                  <option value="mamposteria_ladrillo">Mampostería / Tabique Cerámico</option>
                  {catalogMaterials.filter(m => m.categoria === 'perfil_metalico' || m.categoria === 'civil_hormigon').length > 0 && (
                    <optgroup label="Catálogo Metálico / Civil (Excel USD)">
                      {catalogMaterials
                        .filter(m => m.categoria === 'perfil_metalico' || m.categoria === 'civil_hormigon')
                        .map(m => (
                          <option key={m.id} value={m.codigo}>
                            {m.codigo} — {m.nombre}
                          </option>
                        ))}
                    </optgroup>
                  )}
                  <option value="otro_personalizado">➕ Otro Sustrato / Especificar...</option>
                </select>
                {sustrato === 'otro_personalizado' && (
                  <input
                    type="text"
                    value={customSustrato}
                    onChange={(e) => setCustomSustrato(e.target.value)}
                    placeholder="Escribí el sustrato o material libremente..."
                    className="w-full bg-slate-950 border border-amber-500/70 rounded-lg p-2 text-xs text-white focus:outline-none"
                    autoFocus
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-400 block">Sistema de Recubrimiento / Protección</label>
                <select
                  value={recubrimiento}
                  onChange={(e) => setRecubrimiento(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                >
                  <option value="epoxi_poliamida">Epoxi Poliamida + Poliuretano</option>
                  <option value="alquidico_sintetico">Esmalte Alquídico Sintético</option>
                  <option value="silicato_zinc">Silicato Inorgánico de Zinc</option>
                  <option value="epoxi_bituminoso">Epoxi Bituminoso / Alta Espesor</option>
                  <option value="mortero_impermeable">Mortero Cementicio / Sellador Civil</option>
                  <option value="aislacion_termica">Aislación Térmica c/ Chapa (CUI)</option>
                  <option value="sin_recubrimiento">Sin Recubrimiento / Desnudo</option>
                  {catalogMaterials.filter(m => m.categoria === 'pintura_recubrimiento').length > 0 && (
                    <optgroup label="Esquemas del Catálogo (Excel USD)">
                      {catalogMaterials
                        .filter(m => m.categoria === 'pintura_recubrimiento')
                        .map(m => (
                          <option key={m.id} value={m.codigo}>
                            {m.codigo} — {m.nombre}
                          </option>
                        ))}
                    </optgroup>
                  )}
                  <option value="otro_personalizado">➕ Otro Recubrimiento / Especificar...</option>
                </select>
                {recubrimiento === 'otro_personalizado' && (
                  <input
                    type="text"
                    value={customRecubrimiento}
                    onChange={(e) => setCustomRecubrimiento(e.target.value)}
                    placeholder="Escribí el sistema de recubrimiento o protección..."
                    className="w-full bg-slate-950 border border-amber-500/70 rounded-lg p-2 text-xs text-white focus:outline-none"
                    autoFocus
                  />
                )}
              </div>
            </div>

            {/* Grado de Corrosión con muy breve info explicativa */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <label className="text-slate-300 font-semibold flex items-center space-x-1">
                  <Info className="w-3.5 h-3.5 text-amber-400" />
                  <span>Grado de Corrosión (ISO 4628 / ASTM D610)</span>
                </label>
                <span className="font-mono font-bold text-amber-400">{gradoCorrosion}</span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {(['Ri 0', 'Ri 1', 'Ri 2', 'Ri 3', 'Ri 4', 'Ri 5'] as const).map((grado) => {
                  const info = CORROSION_INFO[grado];
                  const active = gradoCorrosion === grado;
                  return (
                    <button
                      key={grado}
                      type="button"
                      onClick={() => setGradoCorrosion(grado)}
                      className={`py-2 px-1.5 text-xs rounded-lg border transition flex flex-col items-center justify-center ${
                        active
                          ? 'bg-amber-500 text-black border-amber-400 font-black shadow-md'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <span className="font-mono font-bold">{grado}</span>
                      <span className={`text-[9px] leading-tight mt-0.5 ${active ? 'text-black/80 font-bold' : 'text-slate-400'}`}>
                        {info.area}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Breve info del grado seleccionado */}
              {CORROSION_INFO[gradoCorrosion] && (
                <div className={`p-2.5 rounded-xl border text-xs flex items-start justify-between gap-2 ${CORROSION_INFO[gradoCorrosion].color}`}>
                  <div>
                    <span className="font-bold block">{CORROSION_INFO[gradoCorrosion].titulo}</span>
                    <span className="text-[11px] opacity-90">{CORROSION_INFO[gradoCorrosion].desc}</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-black/30 flex-shrink-0">
                    {CORROSION_INFO[gradoCorrosion].area}
                  </span>
                </div>
              )}
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

            {/* Envejecimiento Estructural y Proyección Temporal */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2.5">
              <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider block">
                Parámetros de Envejecimiento (Timeline Futuro)
              </span>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Antigüedad (años)</label>
                  <input
                    type="number"
                    min={0}
                    max={80}
                    value={antiguedadAnios}
                    onChange={(e) => setAntiguedadAnios(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Últ. Pintado (años)</label>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={ultimoRevestimientoAnios}
                    onChange={(e) => setUltimoRevestimientoAnios(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Avance (%/año)</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={tasaAvancePct}
                    onChange={(e) => setTasaAvancePct(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Muestreo Técnico por Tramo (Normalizado + ISO 12944) */}
            <div className="bg-slate-950 p-3 rounded-xl border border-emerald-500/40 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
                    Muestreo Técnico por Tramo (ISO 12944)
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Normaliza extensión por unidades en tramo (3m / 5m) + severidad morfológica
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={usarMuestreoTramo}
                  onChange={(e) => setUsarMuestreoTramo(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 cursor-pointer"
                />
              </div>

              {usarMuestreoTramo && (() => {
                const prevHistorial = inspeccionesLocales.filter(i =>
                  inspectionTargetMode === 'elemento' && selectedElemento
                    ? i.elemento_id === selectedElemento.id
                    : (i.zona_id === selectedZona?.id || i.elemento_id === `ZONA:${selectedZona?.codigo}`)
                );
                const resMuestreo = calcularMuestreoTramo({
                  longitudTramoM: tramoLongitudM,
                  unidadesTotales: tramoUnidadesTotales,
                  unidadesAfectadas: tramoUnidadesAfectadas,
                  morfologiaDominante: tramoMorfologia,
                  ambienteIso12944: tramoAmbienteISO,
                  ultimoRevestimientoAnios,
                  inspeccionesPrevias: prevHistorial
                });

                return (
                  <div className="space-y-2.5 pt-2 border-t border-slate-800 text-xs">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1">Tramo (m)</label>
                        <select
                          value={tramoLongitudM}
                          onChange={(e) => setTramoLongitudM(Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-mono"
                        >
                          <option value={3}>3 m</option>
                          <option value={5}>5 m</option>
                          <option value={10}>10 m</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1">Unid. Totales</label>
                        <input
                          type="number"
                          min={1}
                          value={tramoUnidadesTotales}
                          onChange={(e) => setTramoUnidadesTotales(Math.max(1, Number(e.target.value)))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1">Con Corrosión</label>
                        <input
                          type="number"
                          min={0}
                          max={tramoUnidadesTotales}
                          value={tramoUnidadesAfectadas}
                          onChange={(e) => setTramoUnidadesAfectadas(Math.max(0, Math.min(tramoUnidadesTotales, Number(e.target.value))))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1">Peor Morfología en Tramo</label>
                        <select
                          value={tramoMorfologia}
                          onChange={(e) => setTramoMorfologia(e.target.value as MorfologiaCorrosiva)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white"
                        >
                          <option value="superficial">Superficial (película)</option>
                          <option value="activo_laminar">Óxido activo / laminar</option>
                          <option value="picado_perdida_seccion">Picado / pérdida de sección</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1">Ambiente ISO 12944</label>
                        <select
                          value={tramoAmbienteISO}
                          onChange={(e) => setTramoAmbienteISO(e.target.value as AmbienteISO12944)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-mono"
                        >
                          <option value="C3">C3 (Moderado)</option>
                          <option value="C4">C4 (Industrial)</option>
                          <option value="C5">C5 (Húmedo/Efluentes)</option>
                          <option value="CX">CX (Químico Extremo)</option>
                        </select>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-0.5 text-[11px] font-mono">
                        <span className="text-white block">
                          Extensión: <strong className="text-emerald-400">{resMuestreo.muestreo.extension_normalizada_pct}%</strong> · Sugerido: <strong className="text-amber-400">{resMuestreo.gradoSugerido}</strong>
                        </span>
                        <span className="text-slate-400 block text-[10px]">
                          Tasa ({resMuestreo.fuenteTasa === 'inter_campana' ? 'Histórico real' : `Empírica ${tramoAmbienteISO}`}): <strong className="text-sky-300">{resMuestreo.muestreo.tasa_calculada_pct_anio}%/año</strong>
                          {resMuestreo.requiereReemplazoSugerido ? ' · ⚠️ Evaluar reemplazo' : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPorcentajeAfectado(resMuestreo.muestreo.extension_normalizada_pct);
                          setGradoCorrosion(resMuestreo.gradoSugerido);
                          setTasaAvancePct(resMuestreo.muestreo.tasa_calculada_pct_anio);
                          if (resMuestreo.requiereReemplazoSugerido) setRequiereReemplazo(true);
                        }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[11px]"
                      >
                        Aplicar al Relevamiento
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* SUB-SECCIÓN: EVALUACIONES CIVILES (Juntas, Tabiques, Columnas, Vigas, Losas, Bases de Bombas) */}
            <div className="bg-slate-950 border border-amber-500/40 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <Building2 className="w-4 h-4 text-amber-400" />
                  <div>
                    <span className="text-xs font-black text-white uppercase tracking-wide block">
                      Sub-sección: Evaluaciones Civiles y Hormigón
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Juntas, Tabiques, Columnas, Vigas, Losas, Bases de Bombas u otros elementos civiles
                    </span>
                  </div>
                </div>
                <label className="flex items-center space-x-1.5 cursor-pointer bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-700">
                  <input
                    type="checkbox"
                    checked={incluirEvaluacionCivil}
                    onChange={(e) => setIncluirEvaluacionCivil(e.target.checked)}
                    className="accent-amber-500 rounded"
                  />
                  <span className="text-xs font-bold text-amber-400">Evaluar Civil</span>
                </label>
              </div>

              {incluirEvaluacionCivil && (
                <div className="space-y-3 pt-2 border-t border-slate-800 text-xs">
                  <div>
                    <span className="text-[11px] text-slate-300 font-semibold block mb-1.5">
                      1. Seleccioná los elementos civiles a relevar (o agregá uno propio):
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {[
                        ...CATALOGO_ELEMENTOS_CIVILES,
                        ...catalogMaterials
                          .filter(m => m.categoria === 'civil_hormigon')
                          .map(m => ({ id: m.id, label: `${m.codigo}: ${m.nombre}` }))
                      ].map((cat) => {
                        const isSelected = itemsCiviles.some(i => i.elemento_civil === cat.label);
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => handleToggleCivilElement(cat.label)}
                            className={`p-2 rounded-lg border text-left text-[11px] font-bold transition ${
                              isSelected
                                ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            {isSelected ? '✓ ' : '+ '}{cat.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Input para agregar un elemento civil que no encuadre en la lista */}
                    <div className="flex items-center gap-1.5 mt-2">
                      <input
                        type="text"
                        value={nuevoElementoCivilCustom}
                        onChange={(e) => setNuevoElementoCivilCustom(e.target.value)}
                        placeholder="Otro elemento civil (ej: Canaleta, Trincheras, Foso, Pedestal...)"
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomCivilElement}
                        className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-xs flex-shrink-0"
                      >
                        + Agregar
                      </button>
                    </div>
                  </div>

                  {/* Tarjetas individuales por cada elemento civil seleccionado */}
                  {itemsCiviles.length > 0 && (
                    <div className="space-y-2.5">
                      {itemsCiviles.map((item) => (
                        <div key={item.elemento_civil} className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-amber-300 text-xs">
                              🏗️ {item.elemento_civil}
                            </span>
                            <div className="flex items-center space-x-1">
                              {(['bueno', 'regular', 'severo', 'critico'] as const).map((est) => (
                                <button
                                  key={est}
                                  type="button"
                                  onClick={() => handleUpdateCivilItem(item.elemento_civil, { estado: est })}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border transition ${
                                    item.estado === est
                                      ? est === 'critico'
                                        ? 'bg-red-600 text-white border-red-400'
                                        : est === 'severo'
                                        ? 'bg-orange-500 text-black border-orange-300'
                                        : est === 'regular'
                                        ? 'bg-amber-500 text-black border-amber-300'
                                        : 'bg-emerald-500 text-black border-emerald-300'
                                      : 'bg-slate-950 text-slate-400 border-slate-800'
                                  }`}
                                >
                                  {est}
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() => handleToggleCivilElement(item.elemento_civil)}
                                className="p-1 text-slate-500 hover:text-red-400"
                                title="Quitar elemento civil"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Patologías rápidas */}
                          <div className="flex flex-wrap gap-1">
                            {PATOLOGIAS_CIVILES_SUGERIDAS.map((pat) => {
                              const activePat = item.patologias.includes(pat);
                              return (
                                <button
                                  key={pat}
                                  type="button"
                                  onClick={() => handleToggleCivilPatologia(item.elemento_civil, pat)}
                                  className={`px-2 py-0.5 rounded-full text-[10px] border transition ${
                                    activePat
                                      ? 'bg-amber-500/25 border-amber-400 text-amber-200 font-bold'
                                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  {activePat ? '✓ ' : ''}{pat}
                                </button>
                              );
                            })}
                          </div>

                          <input
                            type="text"
                            value={item.observacion || ''}
                            onChange={(e) => handleUpdateCivilItem(item.elemento_civil, { observacion: e.target.value })}
                            placeholder={`Detalle específico en ${item.elemento_civil} (ej: fisura 3mm, sello desprendido, pernos flojos)...`}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-[11px] text-white focus:border-amber-400 focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Notas Civiles Adicionales</label>
                    <input
                      type="text"
                      value={notasCiviles}
                      onChange={(e) => setNotasCiviles(e.target.value)}
                      placeholder="Observación civil general (ej: ataque ácido en piso junto a base de bombas)..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white"
                    />
                  </div>
                </div>
              )}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-md bg-slate-900 border-2 border-sky-500 rounded-2xl overflow-y-auto max-h-[90vh] shadow-2xl p-5 space-y-4 text-xs my-auto">
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

              <div className="space-y-1.5">
                <label className="text-slate-400 block">Tipo de Elemento / Hallazgo (Mecánico, Cañería, Civil o Libre)</label>
                <select
                  value={fieldDisciplina}
                  onChange={(e: any) => setFieldDisciplina(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
                >
                  <optgroup label="Estructuras Metálicas y Equipos">
                    <option value="acero_estructural">Estructura de Acero (Viga / Columna)</option>
                    <option value="parral_caneria">Parral de Cañerías (Pipe-Rack)</option>
                    <option value="soporte">Soporte de Cañería / Silleta</option>
                    <option value="caneria">Cañería de Proceso / Vapor</option>
                    <option value="baranda">Baranda / Pasarela Grating</option>
                    <option value="tanque">Tanque / Clarificador / Equipo</option>
                  </optgroup>
                  <optgroup label="Elementos Civiles y Hormigón">
                    <option value="junta_dilatacion">Junta Civil / Junta de Dilatación</option>
                    <option value="tabique">Tabique / Muro de Contención</option>
                    <option value="columna_hormigon">Columna / Pedestal de Hormigón</option>
                    <option value="viga_hormigon">Viga / Dintel de Hormigón</option>
                    <option value="losa">Losa / Piso Industrial</option>
                    <option value="base_bomba">Base de Bomba / Fundación</option>
                  </optgroup>
                  {catalogMaterials.filter(m => m.categoria === 'perfil_metalico' || m.categoria === 'civil_hormigon').length > 0 && (
                    <optgroup label="Desde Lista de Precios Excel (Metálico / Civil)">
                      {catalogMaterials
                        .filter(m => m.categoria === 'perfil_metalico' || m.categoria === 'civil_hormigon')
                        .map(m => (
                          <option key={m.id} value={m.codigo}>
                            {m.codigo} — {m.nombre}
                          </option>
                        ))}
                    </optgroup>
                  )}
                  <optgroup label="Personalizado">
                    <option value="otro_personalizado">➕ Otro Elemento (Escribir libremente...)</option>
                  </optgroup>
                </select>

                {fieldDisciplina === 'otro_personalizado' && (
                  <input
                    type="text"
                    value={customFieldDisciplina}
                    onChange={(e) => setCustomFieldDisciplina(e.target.value)}
                    placeholder="Especificá el tipo de elemento (ej: Bandeja portacables, Chimenea, Válvula...)"
                    className="w-full bg-slate-950 border border-amber-500/80 rounded-lg p-2.5 text-white focus:outline-none"
                    required
                  />
                )}
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
            markLocalEntityPendingPush('zona', selectedZona.id);
            const updated = fresh.find(z => z.id === selectedZona.id);
            if (updated) setSelectedZona(updated);
          }
          pushFastSyncToCloud({ includePlanImages: false, authoritativeZonas: false, authoritativeHitos: false });
        }}
      />

      {/* Comparador Caché Local vs. Nube */}
      <SyncComparatorModal
        isOpen={isSyncComparatorOpen}
        onClose={() => setIsSyncComparatorOpen(false)}
        onSyncCompleted={() => loadAndHydrateFieldData(false)}
      />
    </div>
  );
}
