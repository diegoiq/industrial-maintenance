'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  RotateCw, 
  Layers, 
  MapPin, 
  Crosshair, 
  Loader2,
  Check,
  Undo2,
  Lock,
  Pencil,
  Maximize2,
  Minimize2,
  Tag,
  MousePointer,
  Compass,
  Globe,
  Sliders,
  Ruler,
  Save,
  Eye,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight
} from 'lucide-react';
import { Plano, ZonaInspeccion, Elemento, EstadoSemaforo, HitoGeografico, PlanoGeoreferencia } from '../../types';
import { convertPdfPageToImage, rotateImageDataUrl } from '../../lib/pdfRenderer';
import { sanitizeSvgContent } from '../../lib/security';
import { 
  getOrInitGeoreferencia, 
  pixelToLatLng, 
  getSatelliteTilesForPlan, 
  calibrateFromTwoPoints,
  calibrateFromDistance,
  getMetersPerDegree,
  relocatePivotPreservingAlignment
} from '../../lib/georeferenceEngine';
import { db } from '../../lib/db';

interface InteractivePlantMapProps {
  plano?: Plano;
  zonas: ZonaInspeccion[];
  elementos: Elemento[];
  hitos?: HitoGeografico[];
  selectedZonaId?: string;
  selectedElementoId?: string;
  selectedHitoId?: string;
  activeMode?: 'inspect' | 'add_pin' | 'add_zone' | 'add_hito';
  onChangeMode?: (mode: 'inspect' | 'add_pin' | 'add_zone' | 'add_hito') => void;
  isEditingPolygon?: boolean;
  isRelocating?: boolean;
  onSelectZona: (zona: ZonaInspeccion) => void;
  onSelectElemento: (elemento: Elemento) => void;
  onSelectHito?: (hito: HitoGeografico) => void;
  onMapClick?: (coords: { x: number; y: number }) => void;
  onOpenUploadModal?: () => void;
  onPlanUpdated?: (updatedPlano: Plano) => void;
  onUpdateZonePolygon?: (zonaId: string, puntos: { x: number; y: number }[]) => void;
  onPolygonCreated?: (puntos: { x: number; y: number }[]) => void;
  onToggleEditPolygon?: () => void;
  onEntityContextMenu?: (payload: { type: 'zona' | 'elemento' | 'hito'; item: any; clientX: number; clientY: number }) => void;
}

export const InteractivePlantMap: React.FC<InteractivePlantMapProps> = ({
  plano,
  zonas,
  elementos,
  hitos = [],
  selectedZonaId,
  selectedElementoId,
  selectedHitoId,
  activeMode = 'inspect',
  onChangeMode,
  isEditingPolygon = false,
  isRelocating = false,
  onSelectZona,
  onSelectElemento,
  onSelectHito,
  onMapClick,
  onOpenUploadModal,
  onPlanUpdated,
  onUpdateZonePolygon,
  onPolygonCreated,
  onToggleEditPolygon,
  onEntityContextMenu
}) => {
  const [showZonasLayer, setShowZonasLayer] = useState(true);
  const [showPinsLayer, setShowPinsLayer] = useState(true);
  const [showHitosLayer, setShowHitosLayer] = useState(true);

  // Por defecto: 'none' (Solo líneas delimitadas limpias; detalles en el panel al seleccionar)
  const [labelMode, setLabelMode] = useState<'none' | 'short' | 'full'>('none');
  const [hoveredZonaId, setHoveredZonaId] = useState<string | null>(null);

  // Tracking del nivel de zoom en tiempo real para escalado inverso (1 / currentZoom)
  const [currentZoom, setCurrentZoom] = useState<number>(1);
  const [cursorGps, setCursorGps] = useState<{ lat: number; lng: number; x: number; y: number } | null>(null);

  // Capa Satelital Maps y Calibrador Visual ("Papel Calco")
  const [showSatellite, setShowSatellite] = useState<boolean>(false);
  const [tileSource, setTileSource] = useState<'esri' | 'osm'>('esri');
  const [isCalibratingMaps, setIsCalibratingMaps] = useState<boolean>(false);
  const [cadOpacity, setCadOpacity] = useState<number>(0.75);
  const [invertCadLines, setInvertCadLines] = useState<boolean>(false);
  const [geoCal, setGeoCal] = useState<PlanoGeoreferencia>(() => getOrInitGeoreferencia(plano, hitos));

  // Regla de calibración por distancia conocida en metros entre 2 puntos (A y B)
  const [isMeasuringScale, setIsMeasuringScale] = useState<boolean>(false);
  const [scalePoints, setScalePoints] = useState<{ x: number; y: number }[]>([]);
  const [knownMetersInput, setKnownMetersInput] = useState<string>('100');

  // Controles de precisión quirúrgica: Fijar Pivote, Paso de Movimiento y Arrastre de Satélite
  const [isSettingPivot, setIsSettingPivot] = useState<boolean>(false);
  const [nudgeStepM, setNudgeStepM] = useState<number>(2);
  const [isDragSatelliteMode, setIsDragSatelliteMode] = useState<boolean>(false);
  const [satDragOrigin, setSatDragOrigin] = useState<{ x: number; y: number; lat: number; lng: number } | null>(null);

  const [isZenMode, setIsZenMode] = useState(false);
  const [resolvedImageUrl, setResolvedImageUrl] = useState<string | null>(plano?.archivo_data_url || plano?.archivo_original_url || null);
  const [isConvertingPdf, setIsConvertingPdf] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Estado para la edición interactiva de vértices de la zona seleccionada
  const [localPoints, setLocalPoints] = useState<{ x: number; y: number }[]>([]);
  const [draggingVertexIdx, setDraggingVertexIdx] = useState<number | null>(null);

  // Estado para el trazado libre de nuevos polígonos punto a punto
  const [drawingPoints, setDrawingPoints] = useState<{ x: number; y: number }[]>([]);

  // Sincronizar georreferencia cuando cambia el plano o los hitos
  useEffect(() => {
    const initial = getOrInitGeoreferencia(plano, hitos);
    setGeoCal(initial);
    if (plano?.georeferencia?.invertCadLines !== undefined) {
      setInvertCadLines(plano.georeferencia.invertCadLines);
    }
  }, [plano?.id, plano?.georeferencia, hitos.length]);

  // Sincronizar vértices locales cuando cambia la selección de zona
  const selectedZona = zonas.find(z => z.id === selectedZonaId);
  useEffect(() => {
    if (selectedZona?.poligono_svg?.puntos) {
      setLocalPoints([...selectedZona.poligono_svg.puntos]);
    } else {
      setLocalPoints([]);
    }
  }, [selectedZonaId, selectedZona]);

  // Si el plano cambia o viene con data_url en PDF, convertir en cliente
  useEffect(() => {
    let isMounted = true;
    const processPlanImage = async () => {
      if (!plano) return;
      const currentUrl = plano.archivo_data_url || plano.archivo_original_url;
      if (currentUrl && currentUrl.startsWith('data:application/pdf')) {
        setIsConvertingPdf(true);
        try {
          const rendered = await convertPdfPageToImage(currentUrl, 1, 2.5);
          if (isMounted) {
            setResolvedImageUrl(rendered.dataUrl);
            if (onPlanUpdated) {
              const updated = {
                ...plano,
                archivo_data_url: rendered.dataUrl,
                dimensiones_viewbox: {
                  width: rendered.width,
                  height: rendered.height
                }
              };
              await db.planos.put(updated);
              onPlanUpdated(updated);
            }
          }
        } catch (err) {
          console.error("Error al procesar PDF en visor:", err);
        } finally {
          if (isMounted) setIsConvertingPdf(false);
        }
      } else {
        setResolvedImageUrl(currentUrl || null);
      }
    };

    processPlanImage();
    return () => { isMounted = false; };
  }, [plano?.id, plano?.archivo_data_url, plano?.archivo_original_url]);

  // Guardar calibración satelital en el Plano (IndexedDB)
  const handleSaveCalibration = async () => {
    if (!plano) return;
    const updatedGeo: PlanoGeoreferencia = {
      ...geoCal,
      invertCadLines,
      updated_at: new Date().toISOString()
    };
    const updatedPlano: Plano = {
      ...plano,
      georeferencia: updatedGeo
    };
    await db.planos.put(updatedPlano);
    if (onPlanUpdated) onPlanUpdated(updatedPlano);
    setIsCalibratingMaps(false);
  };

  // Desplazar la capa satelital en metros (Norte/Sur/Este/Oeste) para encajar con el Lay Out
  const handleNudgeMeters = (dNorthM: number, dEastM: number) => {
    const { metersPerDegLat, metersPerDegLng } = getMetersPerDegree(geoCal.anchorLat);
    setGeoCal(prev => ({
      ...prev,
      anchorLat: Number((prev.anchorLat + dNorthM / metersPerDegLat).toFixed(6)),
      anchorLng: Number((prev.anchorLng + dEastM / metersPerDegLng).toFixed(6))
    }));
  };

  // Auto-centrar o auto-calibrar desde los Hitos GPS existentes en el plano
  const handleAutoSyncFromHitos = () => {
    const validHitos = hitos.filter(h => h.coordenadas_plano && !isNaN(h.lat) && !isNaN(h.lng));
    if (validHitos.length >= 2) {
      const cal = calibrateFromTwoPoints(
        {
          x: validHitos[0].coordenadas_plano!.x,
          y: validHitos[0].coordenadas_plano!.y,
          lat: validHitos[0].lat,
          lng: validHitos[0].lng
        },
        {
          x: validHitos[1].coordenadas_plano!.x,
          y: validHitos[1].coordenadas_plano!.y,
          lat: validHitos[1].lat,
          lng: validHitos[1].lng
        }
      );
      setGeoCal(cal);
    } else if (validHitos.length === 1) {
      const h = validHitos[0];
      setGeoCal(prev => ({
        ...prev,
        anchorLat: h.lat,
        anchorLng: h.lng,
        anchorPixelX: h.coordenadas_plano!.x,
        anchorPixelY: h.coordenadas_plano!.y
      }));
    }
  };

  // Aplicar escala a partir de los 2 puntos medidos con la regla
  const handleApplyMeasuredDistance = () => {
    if (scalePoints.length !== 2) return;
    const distM = parseFloat(knownMetersInput);
    if (isNaN(distM) || distM <= 0) return;
    const updated = calibrateFromDistance(geoCal, scalePoints[0], scalePoints[1], distM);
    setGeoCal(updated);
    setIsMeasuringScale(false);
    setScalePoints([]);
  };

  // Rotar plano en incrementos de 90° horario o antihorario
  const handleRotatePlan = async (clockwise: boolean = true) => {
    if (!plano) return;
    try {
      const currentRot = plano.rotacion || 0;
      const newRot = (currentRot + (clockwise ? 90 : 270)) % 360;

      const newWidth = plano.dimensiones_viewbox.height;
      const newHeight = plano.dimensiones_viewbox.width;

      if (plano.svg_content) {
        const cleanSvg = sanitizeSvgContent(plano.svg_content);
        const parser = new DOMParser();
        const doc = parser.parseFromString(cleanSvg, 'image/svg+xml');
        const svgEl = doc.querySelector('svg');
        if (svgEl) {
          const innerHtml = sanitizeSvgContent(svgEl.innerHTML);
          const rotatedSvg = `
            <g transform="rotate(${clockwise ? 90 : 270} ${newWidth / 2} ${newHeight / 2})">
              ${innerHtml}
            </g>
          `;
          const updated = {
            ...plano,
            rotacion: newRot,
            svg_content: rotatedSvg,
            dimensiones_viewbox: { width: newWidth, height: newHeight }
          };
          await db.planos.put(updated);
          if (onPlanUpdated) onPlanUpdated(updated);
        }
      } else {
        const src = resolvedImageUrl || plano.archivo_data_url || plano.archivo_original_url;
        if (src) {
          const res = await rotateImageDataUrl(src, clockwise);
          setResolvedImageUrl(res.dataUrl);
          const updated = {
            ...plano,
            rotacion: newRot,
            archivo_data_url: res.dataUrl,
            dimensiones_viewbox: { width: res.width, height: res.height }
          };
          await db.planos.put(updated);
          if (onPlanUpdated) onPlanUpdated(updated);
        }
      }
    } catch (err) {
      console.error("Error al rotar plano:", err);
    }
  };

  // Convertir coordenadas del evento de ratón a coordenadas del SVG ViewBox
  const getSvgCoordinates = (e: React.MouseEvent<SVGSVGElement>): { x: number; y: number } | null => {
    if (!svgRef.current) return null;
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const localPt = pt.matrixTransform(ctm.inverse());
    return {
      x: Math.round(localPt.x),
      y: Math.round(localPt.y)
    };
  };

  // Manejo de clic en el lienzo según el modo activo
  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const coords = getSvgCoordinates(e);
    if (!coords) return;

    if (isSettingPivot) {
      const updated = relocatePivotPreservingAlignment(coords.x, coords.y, geoCal);
      setGeoCal(updated);
      setIsSettingPivot(false);
      return;
    }

    if (isMeasuringScale) {
      setScalePoints(prev => (prev.length >= 2 ? [coords] : [...prev, coords]));
      return;
    }

    if (isRelocating || activeMode === 'add_pin' || activeMode === 'add_hito') {
      if (onMapClick) onMapClick(coords);
      return;
    }

    if (activeMode === 'add_zone') {
      setDrawingPoints(prev => [...prev, coords]);
    }
  };

  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDragSatelliteMode || !showSatellite) return;
    const coords = getSvgCoordinates(e);
    if (!coords) return;
    setSatDragOrigin({
      x: coords.x,
      y: coords.y,
      lat: geoCal.anchorLat,
      lng: geoCal.anchorLng
    });
  };

  // Finalizar el trazado de nueva zona
  const handleFinishDrawing = () => {
    if (drawingPoints.length < 3) return;
    if (onPolygonCreated) onPolygonCreated(drawingPoints);
    setDrawingPoints([]);
  };

  const handleCancelDrawing = () => {
    setDrawingPoints([]);
    if (onChangeMode) onChangeMode('inspect');
  };

  useEffect(() => {
    if (activeMode !== 'add_zone' && drawingPoints.length > 0) {
      setDrawingPoints([]);
    }
  }, [activeMode, drawingPoints.length]);

  const handleUndoDrawingPoint = () => {
    setDrawingPoints(prev => prev.slice(0, prev.length - 1));
  };

  const handleVertexMouseDown = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    setDraggingVertexIdx(idx);
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const coords = getSvgCoordinates(e);
    if (coords) {
      const gps = pixelToLatLng(coords.x, coords.y, geoCal);
      setCursorGps({ ...gps, x: coords.x, y: coords.y });
    }

    // Arrastre directo de la capa satelital con el mouse
    if (isDragSatelliteMode && satDragOrigin && coords) {
      const dxPx = (coords.x - satDragOrigin.x) * (geoCal.scaleRatioX || 1);
      const dyPx = coords.y - satDragOrigin.y;
      const theta = ((geoCal.rotationDeg || 0) * Math.PI) / 180;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const eastUnrotatedM = dxPx * geoCal.metersPerPixel;
      const northUnrotatedM = -dyPx * geoCal.metersPerPixel;
      const eastM = eastUnrotatedM * cosT + northUnrotatedM * sinT;
      const northM = -eastUnrotatedM * sinT + northUnrotatedM * cosT;

      const { metersPerDegLat, metersPerDegLng } = getMetersPerDegree(satDragOrigin.lat);
      setGeoCal(prev => ({
        ...prev,
        anchorLat: Number((satDragOrigin.lat - northM / metersPerDegLat).toFixed(6)),
        anchorLng: Number((satDragOrigin.lng - eastM / metersPerDegLng).toFixed(6))
      }));
      return;
    }

    if (draggingVertexIdx === null || !coords) return;

    setLocalPoints(prev => {
      const updated = [...prev];
      updated[draggingVertexIdx] = coords;
      return updated;
    });
  };

  const handleSvgMouseUp = () => {
    if (satDragOrigin) {
      setSatDragOrigin(null);
    }
    if (draggingVertexIdx !== null && selectedZonaId && onUpdateZonePolygon) {
      onUpdateZonePolygon(selectedZonaId, localPoints);
    }
    setDraggingVertexIdx(null);
  };

  const handleInsertVertex = (afterIdx: number, midX: number, midY: number) => {
    if (!selectedZonaId || !onUpdateZonePolygon) return;
    const updated = [...localPoints];
    updated.splice(afterIdx + 1, 0, { x: Math.round(midX), y: Math.round(midY) });
    setLocalPoints(updated);
    onUpdateZonePolygon(selectedZonaId, updated);
  };

  const handleVertexContextMenu = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (localPoints.length <= 3) return;
    if (!selectedZonaId || !onUpdateZonePolygon) return;
    const updated = localPoints.filter((_, i) => i !== idx);
    setLocalPoints(updated);
    onUpdateZonePolygon(selectedZonaId, updated);
  };

  const getSemaforoColor = (estado: EstadoSemaforo) => {
    switch (estado) {
      case 'rojo': return { fill: '#ef4444', stroke: '#991b1b', pulse: true };
      case 'naranja': return { fill: '#f97316', stroke: '#c2410c', pulse: true };
      case 'amarillo': return { fill: '#eab308', stroke: '#a16207', pulse: false };
      case 'verde': return { fill: '#22c55e', stroke: '#15803d', pulse: false };
      default: return { fill: '#64748b', stroke: '#334155', pulse: false };
    }
  };

  const vbWidth = plano?.dimensiones_viewbox?.width || 2000;
  const vbHeight = plano?.dimensiones_viewbox?.height || 1200;

  // Factor base de relación ViewBox / pantalla (~1000px) e inverso del zoom actual
  // Garantiza que puntos GPS, pines y trazos se vean del mismo tamaño limpio en pantalla a zoom 1x o 30x
  const baseScreenRatio = Math.max(1, vbWidth / 1150);
  const invZoom = baseScreenRatio / Math.max(0.5, currentZoom);

  // Grilla de tiles satelitales sincronizada con la georreferencia
  const satelliteOverlay = useMemo(() => {
    if (!showSatellite) return null;
    return getSatelliteTilesForPlan(vbWidth, vbHeight, geoCal, tileSource);
  }, [showSatellite, vbWidth, vbHeight, geoCal, tileSource]);

  const cycleLabelMode = () => {
    setLabelMode(prev => (prev === 'none' ? 'short' : prev === 'short' ? 'full' : 'none'));
  };

  if (!plano) {
    return (
      <div className="flex-1 w-full h-full bg-slate-950 border border-slate-800 rounded-xl flex flex-col items-center justify-center p-8 text-center text-slate-400">
        <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center mb-4 text-sky-400">
          <Layers className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-white mb-1">Sin plano seleccionado</h3>
        <p className="text-xs max-w-sm mb-5 text-slate-400">
          Sube tu primer plano en formato PDF, DXF (AutoCAD) o imagen de alta resolución para comenzar.
        </p>
        {onOpenUploadModal && (
          <button
            onClick={onOpenUploadModal}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-lg shadow-lg"
          >
            Subir Plano / Nueva Área
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full bg-[#070b13] overflow-hidden select-none flex flex-col ${isZenMode ? 'fixed inset-0 z-50 bg-[#070b13]' : ''}`}>
      {/* Loading Overlay */}
      {isConvertingPdf && (
        <div className="absolute inset-0 z-30 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center text-sky-400 space-y-3">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-xs font-mono font-bold">Vectorizando y procesando plano de alta resolución...</p>
        </div>
      )}

      {/* Indicador de Regla de Calibración por Distancia */}
      {isMeasuringScale && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center gap-2 bg-amber-950/95 backdrop-blur-md px-4 py-2 rounded-2xl border border-amber-400 shadow-2xl text-xs text-white">
          <Ruler className="w-4 h-4 text-amber-400" />
          <span className="font-bold">
            {scalePoints.length === 0
              ? '1º Haz clic en el Punto A del plano'
              : scalePoints.length === 1
              ? '2º Haz clic en el Punto B del plano'
              : 'Ingresa la distancia real entre A y B:'}
          </span>
          {scalePoints.length === 2 && (
            <div className="flex items-center space-x-1.5">
              <input
                type="number"
                step="any"
                value={knownMetersInput}
                onChange={(e) => setKnownMetersInput(e.target.value)}
                className="w-20 bg-slate-950 border border-amber-400 rounded px-2 py-0.5 text-amber-300 font-mono font-bold text-xs"
              />
              <span className="text-amber-300 font-mono">metros</span>
              <button
                type="button"
                onClick={handleApplyMeasuredDistance}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg"
              >
                Aplicar Escala
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => { setIsMeasuringScale(false); setScalePoints([]); }}
            className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-full text-[10px]"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Indicador de Modo Activo arriba-centro */}
      {activeMode === 'add_hito' && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center space-x-2 bg-emerald-950/95 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-emerald-500 shadow-xl text-xs text-white">
          <Compass className="w-4 h-4 text-emerald-400 animate-spin" />
          <span className="font-bold">Haz clic en el punto exacto del plano para fijar el Hito Geográfico (GPS)</span>
          <button
            type="button"
            onClick={() => onChangeMode && onChangeMode('inspect')}
            className="ml-2 px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-full text-[10px]"
          >
            Cancelar
          </button>
        </div>
      )}

      {activeMode === 'add_pin' && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center space-x-2 bg-amber-950/95 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-amber-500 shadow-xl text-xs text-white">
          <Crosshair className="w-4 h-4 text-amber-400" />
          <span className="font-bold">Haz clic en el plano para colocar un nuevo Pin de Activo físico</span>
          <button
            type="button"
            onClick={() => onChangeMode && onChangeMode('inspect')}
            className="ml-2 px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-full text-[10px]"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Barra de Trazado de Nueva Zona */}
      {activeMode === 'add_zone' && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center space-x-2 bg-slate-900/95 backdrop-blur-md px-3 py-1.5 rounded-full border border-sky-500 shadow-xl text-xs text-white">
          <span className="font-mono text-[11px] text-sky-300 font-bold">
            {drawingPoints.length === 0 ? "👉 Haz clic en el plano para definir vértices" : `Vértices: ${drawingPoints.length}`}
          </span>
          {drawingPoints.length > 0 && (
            <button
              type="button"
              onClick={handleUndoDrawingPoint}
              className="p-1 hover:bg-slate-800 text-slate-300 rounded"
              title="Deshacer último punto"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
          )}
          {drawingPoints.length >= 3 && (
            <button
              type="button"
              onClick={handleFinishDrawing}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-full flex items-center space-x-1 shadow"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Finalizar</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleCancelDrawing}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-full text-[11px]"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Barra de Edición de Polígono de Zona Seleccionada */}
      {selectedZona && activeMode === 'inspect' && !isMeasuringScale && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center space-x-2 bg-slate-900/90 backdrop-blur-md px-3 py-1 rounded-full border border-slate-700 shadow-lg text-[11px] text-slate-300">
          <span className="truncate max-w-[180px] sm:max-w-xs font-semibold">
            {selectedZona.codigo}: <strong className="text-white">{selectedZona.nombre}</strong>
          </span>
          {isEditingPolygon ? (
            <button
              type="button"
              onClick={onToggleEditPolygon}
              className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-full flex items-center space-x-1 transition shadow"
            >
              <Lock className="w-3 h-3" />
              <span>Bloquear</span>
            </button>
          ) : (
            onToggleEditPolygon && (
              <button
                type="button"
                onClick={onToggleEditPolygon}
                className="px-2 py-0.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-full flex items-center space-x-1 transition shadow"
              >
                <Pencil className="w-3 h-3" />
                <span>Editar Vértices</span>
              </button>
            )
          )}
        </div>
      )}

      {/* Controles de Capas y Capa Satelital arriba-izquierda */}
      <div className="absolute top-2 left-2 z-20 flex flex-wrap items-center gap-1 bg-slate-900/90 backdrop-blur-md p-1 rounded-lg border border-slate-700/80 shadow-lg text-xs">
        <button
          onClick={() => setShowZonasLayer(!showZonasLayer)}
          className={`flex items-center space-x-1 px-2 py-1 rounded ${showZonasLayer ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40' : 'text-slate-400 hover:bg-slate-800'}`}
          title="Alternar visibilidad de líneas de Zonas"
        >
          <Layers className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="hidden sm:inline">Zonas</span>
          <span className="font-mono text-[10px] font-bold">({zonas.length})</span>
        </button>

        <button
          onClick={() => setShowPinsLayer(!showPinsLayer)}
          className={`flex items-center space-x-1 px-2 py-1 rounded ${showPinsLayer ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'text-slate-400 hover:bg-slate-800'}`}
          title="Alternar visibilidad de Pines de Activo"
        >
          <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="hidden sm:inline">Pines</span>
          <span className="font-mono text-[10px] font-bold">({elementos.length})</span>
        </button>

        {/* Capa de Hitos Geográficos GPS */}
        <button
          onClick={() => setShowHitosLayer(!showHitosLayer)}
          className={`flex items-center space-x-1 px-2 py-1 rounded ${showHitosLayer ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'text-slate-400 hover:bg-slate-800'}`}
          title="Alternar visibilidad de Puntos GPS"
        >
          <Compass className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="hidden sm:inline">GPS</span>
          <span className="font-mono text-[10px] font-bold">({hitos.length})</span>
        </button>

        {/* Botón Capa Satélite / Maps Superpuesta */}
        <button
          onClick={() => {
            const next = !showSatellite;
            setShowSatellite(next);
            if (next && !plano.georeferencia) {
              setIsCalibratingMaps(true);
            }
          }}
          className={`flex items-center space-x-1 px-2 py-1 rounded font-bold transition ${
            showSatellite 
              ? 'bg-emerald-600 text-white shadow' 
              : 'text-emerald-400 hover:bg-slate-800 border border-emerald-500/30'
          }`}
          title="Activar Capa de Mapa Satelital debajo del Lay Out"
        >
          <Globe className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="hidden md:inline">Capa Maps</span>
        </button>

        {/* Botón Abrir Calibrador Manual de Capa Maps */}
        {showSatellite && (
          <button
            onClick={() => setIsCalibratingMaps(!isCalibratingMaps)}
            className={`flex items-center space-x-1 px-2 py-1 rounded font-bold transition ${
              isCalibratingMaps
                ? 'bg-amber-500 text-black'
                : 'bg-slate-800 text-amber-300 hover:bg-slate-700'
            }`}
            title="Ajustar encaje del Lay Out sobre el Mapa Satelital (Opacidad, Escala, Giro y Posición)"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Ajustar Maps</span>
          </button>
        )}

        {/* Toggle para Etiquetas de Zona: Solo Líneas (none) -> Código Corto (short) -> Completo (full) */}
        <button
          onClick={cycleLabelMode}
          className={`flex items-center space-x-1 px-2 py-1 rounded transition ${
            labelMode === 'none'
              ? 'text-slate-400 hover:bg-slate-800'
              : 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
          }`}
          title={
            labelMode === 'none'
              ? "Modo actual: Solo Líneas (clic para mostrar códigos cortos)"
              : labelMode === 'short'
              ? "Modo actual: Códigos cortos (clic para nombres completos)"
              : "Modo actual: Nombres completos (clic para volver a Solo Líneas)"
          }
        >
          <Tag className="w-3.5 h-3.5" />
          <span className="hidden lg:inline text-[10px] font-mono">
            {labelMode === 'none' ? 'Solo Líneas' : labelMode === 'short' ? 'ID Corto' : 'Texto'}
          </span>
        </button>

        {/* Botón Zen / Pantalla Completa */}
        <button
          onClick={() => setIsZenMode(!isZenMode)}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
          title={isZenMode ? "Salir de pantalla completa" : "Pantalla completa (Modo Zen)"}
        >
          {isZenMode ? <Minimize2 className="w-3.5 h-3.5 text-amber-400" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Indicador de Fijación de Punto Pivote de Rotación y Escala */}
      {isSettingPivot && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 flex items-center space-x-2 bg-amber-950/95 backdrop-blur-md px-4 py-2 rounded-full border border-amber-400 shadow-2xl text-xs text-white animate-pulse">
          <Crosshair className="w-4 h-4 text-amber-400" />
          <span className="font-bold">
            📌 Haz clic en el punto que ya tengas alineado (ej. centro del Clarificador) para fijarlo como Pivote de Giro y Escala
          </span>
          <button
            type="button"
            onClick={() => setIsSettingPivot(false)}
            className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-full text-[10px]"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* PANEL FLOTANTE DE CALIBRACIÓN VISUAL MAPS ("PAPEL CALCO SATELITAL") */}
      {showSatellite && isCalibratingMaps && (
        <div className="absolute top-14 left-2 z-30 w-84 sm:w-[340px] max-h-[82vh] overflow-y-auto bg-slate-900/95 backdrop-blur-md border border-emerald-500/70 rounded-xl shadow-2xl p-3.5 space-y-3 text-xs text-slate-200">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center space-x-1.5 font-bold text-emerald-400">
              <Globe className="w-4 h-4" />
              <span>Encaje Quirúrgico Lay Out / Maps</span>
            </div>
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => setTileSource(tileSource === 'esri' ? 'osm' : 'esri')}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-[10px] font-mono text-sky-300 border border-slate-700"
                title="Cambiar entre Foto Satelital y Mapa Callejero OSM"
              >
                {tileSource === 'esri' ? '🛰️ Satélite' : '🗺️ Mapa OSM'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCalibratingMaps(false);
                  setIsDragSatelliteMode(false);
                  setIsSettingPivot(false);
                }}
                className="px-1.5 py-0.5 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
          </div>

          {/* 1. Opacidad y Contraste del Plano */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Transparencia del Plano CAD:</span>
              <span className="font-mono font-bold text-sky-400">{Math.round(cadOpacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.15"
              max="1"
              step="0.05"
              value={cadOpacity}
              onChange={(e) => setCadOpacity(parseFloat(e.target.value))}
              className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
            <label className="flex items-center space-x-2 pt-0.5 cursor-pointer text-[11px] text-slate-300">
              <input
                type="checkbox"
                checked={invertCadLines}
                onChange={(e) => setInvertCadLines(e.target.checked)}
                className="rounded accent-emerald-500"
              />
              <span>Invertir trazos (Líneas claras sobre Satélite)</span>
            </label>
          </div>

          {/* 2. Punto Pivote y Posición Satélite (N/S/E/O + Arrastre Mouse) */}
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-2">
            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                onClick={() => {
                  setIsSettingPivot(!isSettingPivot);
                  setIsDragSatelliteMode(false);
                }}
                className={`flex-1 py-1 px-2 rounded font-bold text-[10px] border transition flex items-center justify-center space-x-1 ${
                  isSettingPivot
                    ? 'bg-amber-500 text-black border-amber-400'
                    : 'bg-amber-950/50 hover:bg-amber-900/60 text-amber-300 border-amber-600/50'
                }`}
                title="Haz clic en un punto ya alineado (ej. centro del Clarificador) para que el giro y la escala roten alrededor de él sin moverlo"
              >
                <Crosshair className="w-3 h-3" />
                <span>{isSettingPivot ? 'Clic en Plano...' : '📌 Fijar Pivote Giro'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsDragSatelliteMode(!isDragSatelliteMode);
                  setIsSettingPivot(false);
                }}
                className={`flex-1 py-1 px-2 rounded font-bold text-[10px] border transition flex items-center justify-center space-x-1 ${
                  isDragSatelliteMode
                    ? 'bg-emerald-500 text-black border-emerald-400'
                    : 'bg-slate-900 hover:bg-slate-800 text-emerald-300 border-slate-700'
                }`}
                title="Permite arrastrar la imagen satelital directamente con el mouse"
              >
                <span>{isDragSatelliteMode ? '✋ Arrastrando Maps' : '✋ Mover con Mouse'}</span>
              </button>
            </div>

            {/* Selector de Paso de Flechas (0.5m, 2m, 10m) */}
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-400 uppercase font-bold">Paso de Flechas:</span>
              <div className="flex items-center space-x-1">
                {[0.5, 2, 10].map(stepVal => (
                  <button
                    key={stepVal}
                    type="button"
                    onClick={() => setNudgeStepM(stepVal)}
                    className={`px-2 py-0.5 rounded font-mono font-bold ${
                      nudgeStepM === stepVal
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {stepVal}m
                  </button>
                ))}
                {hitos.length > 0 && (
                  <button
                    type="button"
                    onClick={handleAutoSyncFromHitos}
                    className="px-1.5 py-0.5 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-700 rounded font-bold"
                    title="Anclar al Hito GPS"
                  >
                    ⚡ {hitos[0].codigo}
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="grid grid-cols-3 gap-1 w-24 flex-shrink-0">
                <div />
                <button
                  type="button"
                  onClick={() => handleNudgeMeters(-nudgeStepM, 0)}
                  className="p-1 bg-slate-800 hover:bg-slate-700 rounded flex justify-center text-emerald-400"
                  title={`Mover ${nudgeStepM}m al Norte`}
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <div />
                <button
                  type="button"
                  onClick={() => handleNudgeMeters(0, -nudgeStepM)}
                  className="p-1 bg-slate-800 hover:bg-slate-700 rounded flex justify-center text-emerald-400"
                  title={`Mover ${nudgeStepM}m al Oeste`}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleNudgeMeters(nudgeStepM, 0)}
                  className="p-1 bg-slate-800 hover:bg-slate-700 rounded flex justify-center text-emerald-400"
                  title={`Mover ${nudgeStepM}m al Sur`}
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleNudgeMeters(0, nudgeStepM)}
                  className="p-1 bg-slate-800 hover:bg-slate-700 rounded flex justify-center text-emerald-400"
                  title={`Mover ${nudgeStepM}m al Este`}
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-1 space-y-1">
                <input
                  type="number"
                  step="0.00002"
                  value={geoCal.anchorLat}
                  onChange={(e) => setGeoCal(prev => ({ ...prev, anchorLat: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] font-mono text-white"
                  placeholder="Latitud"
                />
                <input
                  type="number"
                  step="0.00002"
                  value={geoCal.anchorLng}
                  onChange={(e) => setGeoCal(prev => ({ ...prev, anchorLng: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] font-mono text-white"
                  placeholder="Longitud"
                />
              </div>
            </div>
          </div>

          {/* 3. Escala Fina (m / píxel) + Proporción Horizontal X/Y */}
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-bold">Escala (`m / píxel`):</span>
              <span className="font-mono font-bold text-amber-400">
                {Math.round(vbWidth * geoCal.metersPerPixel)}m × {Math.round(vbHeight * geoCal.metersPerPixel)}m
              </span>
            </div>

            {/* Botones de Ajuste Fino de Escala + Input Numérico */}
            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                onClick={() => setGeoCal(prev => ({ ...prev, metersPerPixel: Number(Math.max(0.005, prev.metersPerPixel * 0.995).toFixed(5)) }))}
                className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 rounded font-mono text-[10px] text-amber-300"
                title="Reducir escala -0.5%"
              >
                -0.5%
              </button>
              <button
                type="button"
                onClick={() => setGeoCal(prev => ({ ...prev, metersPerPixel: Number(Math.max(0.005, prev.metersPerPixel - 0.0002).toFixed(5)) }))}
                className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 rounded font-mono text-[10px] text-amber-200"
                title="Ajuste ultra-fino -0.0002 m/px"
              >
                -Fino
              </button>
              <input
                type="number"
                step="0.0001"
                value={geoCal.metersPerPixel}
                onChange={(e) => setGeoCal(prev => ({ ...prev, metersPerPixel: Math.max(0.001, parseFloat(e.target.value) || 0.1) }))}
                className="w-20 bg-slate-900 border border-amber-500/40 rounded px-1.5 py-1 text-center font-mono font-bold text-[11px] text-amber-300"
              />
              <button
                type="button"
                onClick={() => setGeoCal(prev => ({ ...prev, metersPerPixel: Number((prev.metersPerPixel + 0.0002).toFixed(5)) }))}
                className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 rounded font-mono text-[10px] text-amber-200"
                title="Ajuste ultra-fino +0.0002 m/px"
              >
                +Fino
              </button>
              <button
                type="button"
                onClick={() => setGeoCal(prev => ({ ...prev, metersPerPixel: Number((prev.metersPerPixel * 1.005).toFixed(5)) }))}
                className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 rounded font-mono text-[10px] text-amber-300"
                title="Aumentar escala +0.5%"
              >
                +0.5%
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="range"
                min="0.02"
                max="0.40"
                step="0.0002"
                value={geoCal.metersPerPixel}
                onChange={(e) => setGeoCal(prev => ({ ...prev, metersPerPixel: parseFloat(e.target.value) }))}
                className="flex-1 accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <button
                type="button"
                onClick={() => { setIsMeasuringScale(true); setScalePoints([]); }}
                className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded text-[10px] font-bold flex items-center space-x-1"
                title="Medir 2 puntos en el plano e ingresar su distancia en metros"
              >
                <Ruler className="w-3 h-3" />
                <span>Medir</span>
              </button>
            </div>

            {/* Contraer / Estirar Lay Out CAD desde el Pivote (Mantiene el Maps 100% rígido) */}
            <div className="pt-1.5 border-t border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-sky-300 font-bold">Contraer / Estirar Lay Out CAD (sin tocar Maps):</span>
                {((geoCal.scaleRatioX || 1) !== 1 || (geoCal.scaleRatioY || 1) !== 1) && (
                  <button
                    type="button"
                    onClick={() => setGeoCal(prev => ({ ...prev, scaleRatioX: 1, scaleRatioY: 1 }))}
                    className="text-[10px] text-slate-400 hover:text-white underline font-mono"
                  >
                    Reset 100%
                  </button>
                )}
              </div>

              {/* Control Ancho Horizontal X del CAD */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">Ancho X del CAD:</span>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => setGeoCal(prev => ({ ...prev, scaleRatioX: Number(((prev.scaleRatioX || 1) - 0.005).toFixed(4)) }))}
                      className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded font-mono text-sky-300"
                      title="Contraer Ancho X del Lay Out -0.5% hacia el Pivote"
                    >
                      -0.5%
                    </button>
                    <button
                      type="button"
                      onClick={() => setGeoCal(prev => ({ ...prev, scaleRatioX: Number(((prev.scaleRatioX || 1) - 0.001).toFixed(4)) }))}
                      className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded font-mono text-sky-200 font-bold"
                      title="Contraer Ancho X del Lay Out -0.1% hacia el Pivote"
                    >
                      -0.1%
                    </button>
                    <span className="font-mono font-bold text-sky-400 min-w-[44px] text-center">
                      {(((geoCal.scaleRatioX || 1) * 100)).toFixed(1)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setGeoCal(prev => ({ ...prev, scaleRatioX: Number(((prev.scaleRatioX || 1) + 0.001).toFixed(4)) }))}
                      className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded font-mono text-sky-200 font-bold"
                      title="Estirar Ancho X del Lay Out +0.1% desde el Pivote"
                    >
                      +0.1%
                    </button>
                    <button
                      type="button"
                      onClick={() => setGeoCal(prev => ({ ...prev, scaleRatioX: Number(((prev.scaleRatioX || 1) + 0.005).toFixed(4)) }))}
                      className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded font-mono text-sky-300"
                      title="Estirar Ancho X del Lay Out +0.5% desde el Pivote"
                    >
                      +0.5%
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  min="0.85"
                  max="1.15"
                  step="0.001"
                  value={geoCal.scaleRatioX || 1}
                  onChange={(e) => setGeoCal(prev => ({ ...prev, scaleRatioX: parseFloat(e.target.value) }))}
                  className="w-full accent-sky-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Control Alto Vertical Y del CAD */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">Alto Y del CAD:</span>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => setGeoCal(prev => ({ ...prev, scaleRatioY: Number(((prev.scaleRatioY || 1) - 0.005).toFixed(4)) }))}
                      className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded font-mono text-purple-300"
                    >
                      -0.5%
                    </button>
                    <button
                      type="button"
                      onClick={() => setGeoCal(prev => ({ ...prev, scaleRatioY: Number(((prev.scaleRatioY || 1) - 0.001).toFixed(4)) }))}
                      className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded font-mono text-purple-200 font-bold"
                    >
                      -0.1%
                    </button>
                    <span className="font-mono font-bold text-purple-400 min-w-[44px] text-center">
                      {(((geoCal.scaleRatioY || 1) * 100)).toFixed(1)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setGeoCal(prev => ({ ...prev, scaleRatioY: Number(((prev.scaleRatioY || 1) + 0.001).toFixed(4)) }))}
                      className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded font-mono text-purple-200 font-bold"
                    >
                      +0.1%
                    </button>
                    <button
                      type="button"
                      onClick={() => setGeoCal(prev => ({ ...prev, scaleRatioY: Number(((prev.scaleRatioY || 1) + 0.005).toFixed(4)) }))}
                      className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded font-mono text-purple-300"
                    >
                      +0.5%
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  min="0.85"
                  max="1.15"
                  step="0.001"
                  value={geoCal.scaleRatioY || 1}
                  onChange={(e) => setGeoCal(prev => ({ ...prev, scaleRatioY: parseFloat(e.target.value) }))}
                  className="w-full accent-purple-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* 4. Rotación Quirúrgica respecto al Norte (Paso 0.05° / 0.1°) */}
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-bold">Rotación Fina (Norte):</span>
              <button
                type="button"
                onClick={() => setGeoCal(prev => ({ ...prev, rotationDeg: 0 }))}
                className="text-[10px] font-mono text-slate-400 hover:text-white underline"
              >
                Reset 0°
              </button>
            </div>

            {/* Botonera de Rotación Quirúrgica + Input directo */}
            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                onClick={() => setGeoCal(prev => ({ ...prev, rotationDeg: Number((prev.rotationDeg - 1).toFixed(2)) }))}
                className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 rounded font-mono text-[10px] text-emerald-300"
              >
                -1°
              </button>
              <button
                type="button"
                onClick={() => setGeoCal(prev => ({ ...prev, rotationDeg: Number((prev.rotationDeg - 0.1).toFixed(2)) }))}
                className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 rounded font-mono text-[10px] text-emerald-200 font-bold"
              >
                -0.1°
              </button>
              <button
                type="button"
                onClick={() => setGeoCal(prev => ({ ...prev, rotationDeg: Number((prev.rotationDeg - 0.05).toFixed(2)) }))}
                className="px-1 py-1 bg-slate-800 hover:bg-slate-700 rounded font-mono text-[9px] text-emerald-200"
              >
                -.05°
              </button>

              <input
                type="number"
                step="0.05"
                value={geoCal.rotationDeg}
                onChange={(e) => setGeoCal(prev => ({ ...prev, rotationDeg: parseFloat(e.target.value) || 0 }))}
                className="w-16 bg-slate-900 border border-emerald-500/40 rounded px-1 py-1 text-center font-mono font-bold text-[11px] text-emerald-400"
              />

              <button
                type="button"
                onClick={() => setGeoCal(prev => ({ ...prev, rotationDeg: Number((prev.rotationDeg + 0.05).toFixed(2)) }))}
                className="px-1 py-1 bg-slate-800 hover:bg-slate-700 rounded font-mono text-[9px] text-emerald-200"
              >
                +.05°
              </button>
              <button
                type="button"
                onClick={() => setGeoCal(prev => ({ ...prev, rotationDeg: Number((prev.rotationDeg + 0.1).toFixed(2)) }))}
                className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 rounded font-mono text-[10px] text-emerald-200 font-bold"
              >
                +0.1°
              </button>
              <button
                type="button"
                onClick={() => setGeoCal(prev => ({ ...prev, rotationDeg: Number((prev.rotationDeg + 1).toFixed(2)) }))}
                className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 rounded font-mono text-[10px] text-emerald-300"
              >
                +1°
              </button>
            </div>

            {/* Slider de Rango Fino (-15° a +15° con paso de 0.05°) */}
            <div className="space-y-0.5">
              <input
                type="range"
                min="-20"
                max="20"
                step="0.05"
                value={Math.max(-20, Math.min(20, geoCal.rotationDeg))}
                onChange={(e) => setGeoCal(prev => ({ ...prev, rotationDeg: parseFloat(e.target.value) }))}
                className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[9px] font-mono text-slate-500">
                <span>-20°</span>
                <span>Slider Fino (paso 0.05°)</span>
                <span>+20°</span>
              </div>
            </div>
          </div>

          {/* Guardar Calibración */}
          <button
            type="button"
            onClick={handleSaveCalibration}
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-lg flex items-center justify-center space-x-1.5 transition"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Guardar Calibración en Plano</span>
          </button>
        </div>
      )}

      {/* Visor Pan & Zoom con Tracking de Escala */}
      <TransformWrapper
        initialScale={1}
        minScale={0.05}
        maxScale={40}
        centerOnInit={true}
        limitToBounds={false}
        wheel={{ step: 0.25 }}
        pinch={{ step: 5 }}
        doubleClick={{ step: 2 }}
        onTransformed={(_, state) => setCurrentZoom(state.scale)}
        disabled={
          activeMode !== 'inspect' ||
          isMeasuringScale ||
          isSettingPivot ||
          isDragSatelliteMode ||
          (isEditingPolygon && draggingVertexIdx !== null) ||
          drawingPoints.length > 0
        }
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            {/* Controles Zoom y Rotación en esquina superior derecha */}
            <div className="absolute top-2 right-2 z-20 flex flex-col space-y-0.5 bg-slate-900/90 backdrop-blur-md p-1 rounded-lg border border-slate-700/80 shadow-lg">
              <button
                onClick={() => zoomIn(0.6)}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
                title="Acercar (Zoom In)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => zoomOut(0.6)}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
                title="Alejar (Zoom Out)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>

              <div className="flex flex-col border-t border-slate-800 pt-0.5 space-y-0.5">
                <button
                  onClick={() => zoomIn(2)}
                  className="px-1 py-0.5 text-[10px] font-mono font-bold text-sky-400 hover:bg-slate-800 rounded text-center transition"
                  title="Salto +2x"
                >
                  +2x
                </button>
                <button
                  onClick={() => zoomIn(6)}
                  className="px-1 py-0.5 text-[10px] font-mono font-bold text-emerald-400 hover:bg-slate-800 rounded text-center transition"
                  title="Salto +6x (Ultra Detalle)"
                >
                  +6x
                </button>
              </div>

              <button
                onClick={() => handleRotatePlan(true)}
                className="p-1.5 text-amber-400 hover:text-amber-300 hover:bg-slate-800 rounded border-t border-slate-800"
                title="Girar +90° Horario"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleRotatePlan(false)}
                className="p-1.5 text-amber-400 hover:text-amber-300 hover:bg-slate-800 rounded"
                title="Girar -90° Antihorario"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={() => resetTransform()}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded border-t border-slate-800"
                title="Restablecer plano (1x)"
              >
                <RotateCcw className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <TransformComponent
              wrapperClass="!w-full !h-full"
              contentClass="!w-full !h-full flex items-center justify-center cursor-grab active:cursor-grabbing"
            >
              <svg
                ref={svgRef}
                viewBox={`0 0 ${vbWidth} ${vbHeight}`}
                className={`w-full h-full max-h-screen object-contain ${
                  isSettingPivot || isRelocating ? 'cursor-crosshair' : isDragSatelliteMode ? 'cursor-move' : ''
                }`}
                onClick={handleSvgClick}
                onMouseDown={handleSvgMouseDown}
                onMouseMove={handleSvgMouseMove}
                onMouseUp={handleSvgMouseUp}
              >
                <defs>
                  <pattern id="grid-large" width="100" height="100" patternUnits="userSpaceOnUse">
                    <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#1e293b" strokeWidth="0.8" opacity="0.3" />
                  </pattern>
                  <filter id="pin-shadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000000" floodOpacity="0.65" />
                  </filter>
                  {/* Filtro para invertir líneas negras del plano sobre foto satelital */}
                  <filter id="invert-cad">
                    <feColorMatrix
                      type="matrix"
                      values="-1 0 0 0 1
                               0 -1 0 0 1
                               0 0 -1 0 1
                               0 0 0 1 0"
                    />
                  </filter>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid-large)" />

                {/* CAPA 0: MAPA SATELITAL / OSM SUPERPUESTO Y CALIBRADO */}
                {showSatellite && satelliteOverlay && (
                  <g
                    transform={`rotate(${satelliteOverlay.rotationDeg} ${satelliteOverlay.anchorX} ${satelliteOverlay.anchorY})`}
                    opacity={0.92}
                  >
                    {satelliteOverlay.tiles.map(t => (
                      <image
                        key={t.key}
                        href={t.url}
                        x={t.x}
                        y={t.y}
                        width={t.width}
                        height={t.height}
                        preserveAspectRatio="none"
                      />
                    ))}
                  </g>
                )}

                {/* RENDERIZADO DEL PLANO CARGADO (Transformado alrededor del Pivote sin deformar el Maps) */}
                <g
                  transform={`translate(${geoCal.anchorPixelX}, ${geoCal.anchorPixelY}) scale(${geoCal.scaleRatioX || 1}, ${geoCal.scaleRatioY || 1}) translate(${-geoCal.anchorPixelX}, ${-geoCal.anchorPixelY})`}
                >
                  {plano.svg_content ? (
                    <g
                      dangerouslySetInnerHTML={{ __html: sanitizeSvgContent(plano.svg_content) }}
                      opacity={showSatellite ? cadOpacity : 1}
                      filter={showSatellite && invertCadLines ? 'url(#invert-cad)' : undefined}
                    />
                  ) : (
                    (resolvedImageUrl || plano.archivo_data_url || plano.archivo_original_url) && (
                      <image
                        href={(resolvedImageUrl || plano.archivo_data_url || plano.archivo_original_url)!}
                        x="0"
                        y="0"
                        width={vbWidth}
                        height={vbHeight}
                        preserveAspectRatio="xMidYMid meet"
                        opacity={showSatellite ? cadOpacity : 0.96}
                        filter={showSatellite && invertCadLines ? 'url(#invert-cad)' : undefined}
                        style={showSatellite && !invertCadLines ? { mixBlendMode: 'multiply' } : undefined}
                      />
                    )
                  )}
                </g>

                {/* Marcador Visual del Punto Pivote de Rotación y Escala (Solo visible mientras se calibra Maps) */}
                {showSatellite && isCalibratingMaps && (
                  <g
                    transform={`translate(${geoCal.anchorPixelX}, ${geoCal.anchorPixelY}) scale(${invZoom})`}
                    className="pointer-events-none"
                  >
                    <circle r={12} fill="rgba(245, 158, 11, 0.18)" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3,2" />
                    <line x1={-16} y1={0} x2={16} y2={0} stroke="#f59e0b" strokeWidth={1.3} />
                    <line x1={0} y1={-16} x2={0} y2={16} stroke="#f59e0b" strokeWidth={1.3} />
                    <circle r={3} fill="#f59e0b" stroke="#000" strokeWidth={1} />
                    <rect x={10} y={-18} width={52} height={14} rx={3} fill="rgba(9, 13, 22, 0.9)" stroke="#f59e0b" strokeWidth={1} />
                    <text x={36} y={-9} fill="#fcd34d" fontSize={8} fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                      ⊕ PIVOTE
                    </text>
                  </g>
                )}

                {/* Línea de Regla cuando se está midiendo distancia de calibración */}
                {isMeasuringScale && scalePoints.length > 0 && (
                  <g>
                    {scalePoints.length === 2 && (
                      <line
                        x1={scalePoints[0].x}
                        y1={scalePoints[0].y}
                        x2={scalePoints[1].x}
                        y2={scalePoints[1].y}
                        stroke="#f59e0b"
                        strokeWidth={2.5 * invZoom}
                        strokeDasharray={`${6 * invZoom},${4 * invZoom}`}
                      />
                    )}
                    {scalePoints.map((pt, i) => (
                      <g key={i} transform={`translate(${pt.x}, ${pt.y}) scale(${invZoom})`}>
                        <circle r={6} fill="#f59e0b" stroke="#000" strokeWidth={1.5} />
                        <text y={-10} fill="#fde68a" fontSize={11} fontWeight="bold" textAnchor="middle">
                          {i === 0 ? 'A' : 'B'}
                        </text>
                      </g>
                    ))}
                  </g>
                )}

                {/* CAPA 1: Polígonos de Zonas de Inspección (RESPONSIVOS AL ZOOM + MODO SOLO LÍNEAS) */}
                {showZonasLayer && zonas.map((zona) => {
                  const isSelected = selectedZonaId === zona.id;
                  const isHovered = hoveredZonaId === zona.id;
                  const pts = (isSelected && localPoints.length >= 3) ? localPoints : (zona.poligono_svg?.puntos || []);
                  if (!pts || pts.length === 0) return null;
                  const pointsStr = pts.map(p => `${p.x},${p.y}`).join(' ');

                  const minX = Math.min(...pts.map(p => p.x));
                  const minY = Math.min(...pts.map(p => p.y));

                  // Solo mostramos badge de texto si labelMode !== 'none' O si el usuario pasa el cursor / selecciona la zona
                  const showBadge = labelMode !== 'none' || isSelected || isHovered;
                  const tagText = labelMode === 'full'
                    ? `${(zona.codigo || 'Z').trim().toUpperCase()} · ${zona.nombre}`
                    : (zona.codigo || 'Z').trim().toUpperCase();
                  const badgeW = Math.max(34, tagText.length * 6.8 + 14);
                  const badgeH = 18;

                  return (
                    <g
                      key={zona.id}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredZonaId(zona.id)}
                      onMouseLeave={() => setHoveredZonaId(prev => (prev === zona.id ? null : prev))}
                      onClick={(e) => {
                        if (isRelocating) return;
                        if (activeMode === 'inspect' && !isMeasuringScale) {
                          e.stopPropagation();
                          onSelectZona(zona);
                        }
                      }}
                      onContextMenu={(e) => {
                        if (!isEditingPolygon && onEntityContextMenu) {
                          e.preventDefault();
                          e.stopPropagation();
                          onEntityContextMenu({ type: 'zona', item: zona, clientX: e.clientX, clientY: e.clientY });
                        }
                      }}
                    >
                      <polygon
                        points={pointsStr}
                        fill={
                          isSelected
                            ? 'rgba(14, 165, 233, 0.18)'
                            : isHovered
                            ? 'rgba(56, 189, 248, 0.12)'
                            : 'rgba(56, 189, 248, 0.03)'
                        }
                        stroke={isSelected ? '#38bdf8' : isHovered ? '#0ea5e9' : '#0284c7'}
                        strokeWidth={(isSelected ? 2.4 : 1.5) * invZoom}
                        strokeDasharray={isSelected ? 'none' : `${7 * invZoom},${5 * invZoom}`}
                        className="transition-colors"
                      />

                      {/* Badge Responsivo con Escala Inversa (1 / Zoom): jamás se agranda al hacer zoom */}
                      {showBadge && (
                        <g
                          transform={`translate(${minX}, ${minY}) scale(${invZoom})`}
                          className="pointer-events-none"
                        >
                          <rect
                            x={0}
                            y={-badgeH - 3}
                            width={badgeW}
                            height={badgeH}
                            rx={4}
                            fill={isSelected ? '#0284c7' : 'rgba(9, 13, 22, 0.90)'}
                            stroke={isSelected ? '#7dd3fc' : '#0284c7'}
                            strokeWidth={1.2}
                          />
                          <text
                            x={badgeW / 2}
                            y={-badgeH / 2 - 3}
                            fill={isSelected ? '#ffffff' : '#38bdf8'}
                            fontSize={10}
                            fontFamily="monospace"
                            fontWeight="bold"
                            textAnchor="middle"
                            dominantBaseline="central"
                          >
                            {tagText}
                          </text>
                        </g>
                      )}

                      {/* VÉRTICES INTERACTIVOS DE AJUSTE (ESCALADOS CON 1/ZOOM) */}
                      {isSelected && isEditingPolygon && pts.map((p, idx) => (
                        <g
                          key={`vertex-${zona.id}-${idx}`}
                          transform={`translate(${p.x}, ${p.y}) scale(${invZoom})`}
                          className="cursor-move select-none"
                          onMouseDown={(e) => handleVertexMouseDown(e, idx)}
                          onContextMenu={(e) => handleVertexContextMenu(e, idx)}
                        >
                          <circle r={14} fill="transparent" />
                          <circle
                            r={draggingVertexIdx === idx ? 9 : 6.5}
                            fill={draggingVertexIdx === idx ? '#f59e0b' : '#0284c7'}
                            stroke="#ffffff"
                            strokeWidth={2}
                          />
                          <text
                            y={-10}
                            textAnchor="middle"
                            fill="#38bdf8"
                            fontSize={9}
                            fontFamily="monospace"
                            fontWeight="bold"
                            pointerEvents="none"
                          >
                            P{idx + 1}
                          </text>
                        </g>
                      ))}

                      {/* PUNTOS MEDIOS [+] PARA INSERTAR NUEVOS VÉRTICES (ESCALADOS CON 1/ZOOM) */}
                      {isSelected && isEditingPolygon && pts.map((p, idx) => {
                        const nextP = pts[(idx + 1) % pts.length];
                        const mx = (p.x + nextP.x) / 2;
                        const my = (p.y + nextP.y) / 2;
                        return (
                          <g
                            key={`mid-${zona.id}-${idx}`}
                            transform={`translate(${mx}, ${my}) scale(${invZoom})`}
                            className="cursor-pointer group select-none"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleInsertVertex(idx, mx, my);
                            }}
                          >
                            <circle r={11} fill="transparent" />
                            <circle
                              r={5.5}
                              fill="#090d16"
                              stroke="#38bdf8"
                              strokeWidth={1.5}
                              className="group-hover:fill-sky-500 transition-colors"
                            />
                            <text
                              y={3}
                              textAnchor="middle"
                              fill="#38bdf8"
                              fontSize={9}
                              fontWeight="bold"
                              className="group-hover:fill-white pointer-events-none"
                            >
                              +
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  );
                })}

                {/* TRAZADO DINÁMICO DE NUEVA ZONA */}
                {activeMode === 'add_zone' && drawingPoints.length > 0 && (
                  <g className="pointer-events-none">
                    <polyline
                      points={drawingPoints.map(p => `${p.x},${p.y}`).join(' ')}
                      fill={drawingPoints.length >= 3 ? 'rgba(56, 189, 248, 0.18)' : 'none'}
                      stroke="#38bdf8"
                      strokeWidth={2 * invZoom}
                      strokeDasharray={`${5 * invZoom},${4 * invZoom}`}
                    />
                    {drawingPoints.map((pt, i) => (
                      <g key={i} transform={`translate(${pt.x}, ${pt.y}) scale(${invZoom})`}>
                        <circle r={5.5} fill="#0284c7" stroke="#ffffff" strokeWidth={1.8} />
                        <text y={-9} fill="#38bdf8" fontSize={10} fontWeight="bold" textAnchor="middle">
                          #{i + 1}
                        </text>
                      </g>
                    ))}
                  </g>
                )}

                {/* CAPA 2: Pines de Activos Físicos con Semáforo (RESPONSIVOS 1/ZOOM) */}
                {showPinsLayer && elementos.map((elem) => {
                  const isSelected = selectedElementoId === elem.id;
                  const color = getSemaforoColor(elem.estado_actual);
                  const x = elem.coordenadas_pin.x;
                  const y = elem.coordenadas_pin.y;

                  return (
                    <g
                      key={elem.id}
                      transform={`translate(${x}, ${y}) scale(${invZoom})`}
                      className="cursor-pointer group"
                      onClick={(e) => {
                        if (isRelocating) return;
                        e.stopPropagation();
                        onSelectElemento(elem);
                      }}
                      onContextMenu={(e) => {
                        if (onEntityContextMenu) {
                          e.preventDefault();
                          e.stopPropagation();
                          onEntityContextMenu({ type: 'elemento', item: elem, clientX: e.clientX, clientY: e.clientY });
                        }
                      }}
                      filter="url(#pin-shadow)"
                    >
                      {color.pulse && (
                        <circle
                          r={13}
                          fill={color.fill}
                          opacity="0.3"
                          className="animate-ping"
                        />
                      )}
                      <circle
                        r={isSelected ? 8.5 : 6}
                        fill={color.fill}
                        stroke="#ffffff"
                        strokeWidth={isSelected ? 2.2 : 1.5}
                        className="transition-transform group-hover:scale-125"
                      />
                      <circle r={2.2} fill="#ffffff" />

                      {/* Etiqueta compacta: visible en hover, selección o si labelMode !== 'none' */}
                      <g
                        transform="translate(0, -11)"
                        className={`transition-opacity pointer-events-none ${
                          isSelected || labelMode !== 'none' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        <rect
                          x={-34}
                          y={-14}
                          width={68}
                          height={14}
                          rx={3}
                          fill="#090d16"
                          stroke={isSelected ? '#38bdf8' : '#334155'}
                          strokeWidth={1}
                        />
                        <text
                          x="0"
                          y={-4.5}
                          fill="#e2e8f0"
                          fontSize={8.5}
                          fontFamily="monospace"
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          {elem.tag_codigo}
                        </text>
                      </g>
                    </g>
                  );
                })}

                {/* CAPA 3: Hitos Geográficos / Puntos GPS (RESPONSIVOS 1/ZOOM - NO TAPAN EL PLANO) */}
                {showHitosLayer && hitos.filter(h => h.coordenadas_plano).map((hito) => {
                  const isSelected = selectedHitoId === hito.id;
                  const x = hito.coordenadas_plano!.x;
                  const y = hito.coordenadas_plano!.y;

                  return (
                    <g
                      key={hito.id}
                      transform={`translate(${x}, ${y}) scale(${invZoom})`}
                      className="cursor-pointer group"
                      onClick={(e) => {
                        if (isRelocating) return;
                        e.stopPropagation();
                        if (onSelectHito) onSelectHito(hito);
                      }}
                      onContextMenu={(e) => {
                        if (onEntityContextMenu) {
                          e.preventDefault();
                          e.stopPropagation();
                          onEntityContextMenu({ type: 'hito', item: hito, clientX: e.clientX, clientY: e.clientY });
                        }
                      }}
                      filter="url(#pin-shadow)"
                    >
                      {/* Mira Geodésica Fina (tamaño fijo en pantalla sin importar el zoom) */}
                      <circle
                        r={10}
                        fill="transparent"
                        stroke="#10b981"
                        strokeWidth={1.1}
                        strokeDasharray="2.5,2.5"
                      />
                      <line x1={-13} y1={0} x2={13} y2={0} stroke="#10b981" strokeWidth={0.9} opacity="0.7" />
                      <line x1={0} y1={-13} x2={0} y2={13} stroke="#10b981" strokeWidth={0.9} opacity="0.7" />

                      {/* Punto Central GPS Compacto */}
                      <circle
                        r={isSelected ? 6.5 : 5}
                        fill="#059669"
                        stroke="#ffffff"
                        strokeWidth={1.6}
                        className="transition-transform group-hover:scale-125"
                      />
                      <circle r={1.8} fill="#ffffff" />

                      {/* Micro-píldora de Código (siempre discreta; coordenadas completas solo al pasar el mouse o seleccionar) */}
                      <g
                        transform="translate(0, -13)"
                        className={`transition-opacity pointer-events-none ${
                          isSelected || labelMode !== 'none' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        <rect
                          x={-48}
                          y={-20}
                          width={96}
                          height={20}
                          rx={4}
                          fill="rgba(6, 78, 59, 0.94)"
                          stroke={isSelected ? '#34d399' : '#10b981'}
                          strokeWidth={1}
                        />
                        <text
                          x="0"
                          y={-11.5}
                          fill="#a7f3d0"
                          fontSize={8.5}
                          fontFamily="monospace"
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          🌐 {hito.codigo}
                        </text>
                        <text
                          x="0"
                          y={-3.5}
                          fill="#6ee7b7"
                          fontSize={6.8}
                          fontFamily="monospace"
                          textAnchor="middle"
                        >
                          {hito.lat.toFixed(5)}, {hito.lng.toFixed(5)}
                        </text>
                      </g>
                    </g>
                  );
                })}
              </svg>
            </TransformComponent>
          </>
        )}
      </TransformWrapper>

      {/* LECTURA GPS EN VIVO DEL CURSOR (Esquina inferior izquierda) */}
      {cursorGps && (
        <div className="hidden sm:flex absolute bottom-3 left-3 z-20 items-center space-x-2 bg-slate-900/90 backdrop-blur-md px-2.5 py-1 rounded-lg border border-slate-800 text-[10px] font-mono text-slate-400 pointer-events-none">
          <span className="text-emerald-400 font-bold">
            📍 {cursorGps.lat.toFixed(5)}, {cursorGps.lng.toFixed(5)}
          </span>
          <span>·</span>
          <span>CAD ({cursorGps.x}, {cursorGps.y})</span>
          <span>·</span>
          <span className="text-sky-400">Zoom {currentZoom.toFixed(1)}x</span>
        </div>
      )}

      {/* DOCK FLOTANTE INFERIOR: Modos de Interacción (Inspeccionar | + Pin | + Zona | + Hito GPS) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center space-x-1 sm:space-x-1.5 bg-slate-900/95 backdrop-blur-md px-2 py-1.5 rounded-xl border border-slate-700/80 shadow-2xl text-xs">
        <button
          type="button"
          onClick={() => onChangeMode && onChangeMode('inspect')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-bold transition ${
            activeMode === 'inspect'
              ? 'bg-slate-800 text-white border border-slate-600 shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
          title="Modo Consulta: Navegar y consultar fichas técnicas"
        >
          <MousePointer className="w-3.5 h-3.5 text-sky-400" />
          <span className="hidden sm:inline">Inspeccionar</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeMode && onChangeMode('add_pin')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-bold transition ${
            activeMode === 'add_pin'
              ? 'bg-amber-500 text-black shadow-sm'
              : 'text-amber-400 hover:text-amber-300 hover:bg-slate-800/60'
          }`}
          title="Colocar nuevo Pin de Activo"
        >
          <Crosshair className="w-3.5 h-3.5" />
          <span>+ Pin</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeMode && onChangeMode('add_zone')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-bold transition ${
            activeMode === 'add_zone'
              ? 'bg-sky-500 text-black shadow-sm'
              : 'text-sky-400 hover:text-sky-300 hover:bg-slate-800/60'
          }`}
          title="Crear nueva Zona de Inspección"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>+ Zona</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeMode && onChangeMode('add_hito')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-bold transition ${
            activeMode === 'add_hito'
              ? 'bg-emerald-500 text-black shadow-sm'
              : 'text-emerald-400 hover:text-emerald-300 hover:bg-slate-800/60'
          }`}
          title="Hacer clic en el plano para georreferenciar un Hito GPS"
        >
          <Compass className="w-3.5 h-3.5" />
          <span>+ Hito GPS</span>
        </button>
      </div>
    </div>
  );
};
