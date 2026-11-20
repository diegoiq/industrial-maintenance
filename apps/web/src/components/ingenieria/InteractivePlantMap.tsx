'use client';

import React, { useState, useRef, useEffect } from 'react';
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
  Navigation
} from 'lucide-react';
import { Plano, ZonaInspeccion, Elemento, EstadoSemaforo, HitoGeografico } from '../../types';
import { convertPdfPageToImage, rotateImageDataUrl } from '../../lib/pdfRenderer';
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
  onSelectZona: (zona: ZonaInspeccion) => void;
  onSelectElemento: (elemento: Elemento) => void;
  onSelectHito?: (hito: HitoGeografico) => void;
  onMapClick?: (coords: { x: number; y: number }) => void;
  onOpenUploadModal?: () => void;
  onPlanUpdated?: (updatedPlano: Plano) => void;
  onUpdateZonePolygon?: (zonaId: string, puntos: { x: number; y: number }[]) => void;
  onPolygonCreated?: (puntos: { x: number; y: number }[]) => void;
  onToggleEditPolygon?: () => void;
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
  onSelectZona,
  onSelectElemento,
  onSelectHito,
  onMapClick,
  onOpenUploadModal,
  onPlanUpdated,
  onUpdateZonePolygon,
  onPolygonCreated,
  onToggleEditPolygon
}) => {
  const [showZonasLayer, setShowZonasLayer] = useState(true);
  const [showPinsLayer, setShowPinsLayer] = useState(true);
  const [showHitosLayer, setShowHitosLayer] = useState(true);
  const [useShortTags, setUseShortTags] = useState(true);
  const [isZenMode, setIsZenMode] = useState(false);
  const [resolvedImageUrl, setResolvedImageUrl] = useState<string | null>(plano?.archivo_data_url || plano?.archivo_original_url || null);
  const [isConvertingPdf, setIsConvertingPdf] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Estado para la edición interactiva de vértices de la zona seleccionada
  const [localPoints, setLocalPoints] = useState<{ x: number; y: number }[]>([]);
  const [draggingVertexIdx, setDraggingVertexIdx] = useState<number | null>(null);

  // Estado para el trazado libre de nuevos polígonos punto a punto
  const [drawingPoints, setDrawingPoints] = useState<{ x: number; y: number }[]>([]);

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

  // Rotar plano en incrementos de 90° horario o antihorario
  const handleRotatePlan = async (clockwise: boolean = true) => {
    if (!plano) return;
    try {
      const currentRot = plano.rotacion || 0;
      const newRot = (currentRot + (clockwise ? 90 : 270)) % 360;

      const newWidth = plano.dimensiones_viewbox.height;
      const newHeight = plano.dimensiones_viewbox.width;

      if (plano.svg_content) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(plano.svg_content, 'image/svg+xml');
        const svgEl = doc.querySelector('svg');
        if (svgEl) {
          const innerHtml = svgEl.innerHTML;
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

    if (activeMode === 'add_pin' || activeMode === 'add_hito') {
      if (onMapClick) onMapClick(coords);
      return;
    }

    if (activeMode === 'add_zone') {
      setDrawingPoints(prev => [...prev, coords]);
    }
  };

  // Finalizar el trazado de nueva zona
  const handleFinishDrawing = () => {
    if (drawingPoints.length < 3) return;
    if (onPolygonCreated) onPolygonCreated(drawingPoints);
    setDrawingPoints([]);
  };

  // Cancelar trazado
  const handleCancelDrawing = () => {
    setDrawingPoints([]);
  };

  // Deshacer último vértice
  const handleUndoDrawingPoint = () => {
    setDrawingPoints(prev => prev.slice(0, prev.length - 1));
  };

  // Arrastre de vértices de polígono en modo edición
  const handleVertexMouseDown = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    setDraggingVertexIdx(idx);
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (draggingVertexIdx === null) return;
    const coords = getSvgCoordinates(e);
    if (!coords) return;

    setLocalPoints(prev => {
      const updated = [...prev];
      updated[draggingVertexIdx] = coords;
      return updated;
    });
  };

  const handleSvgMouseUp = () => {
    if (draggingVertexIdx !== null && selectedZonaId && onUpdateZonePolygon) {
      onUpdateZonePolygon(selectedZonaId, localPoints);
    }
    setDraggingVertexIdx(null);
  };

  // Insertar un nuevo vértice
  const handleInsertVertex = (afterIdx: number, midX: number, midY: number) => {
    if (!selectedZonaId || !onUpdateZonePolygon) return;
    const updated = [...localPoints];
    updated.splice(afterIdx + 1, 0, { x: Math.round(midX), y: Math.round(midY) });
    setLocalPoints(updated);
    onUpdateZonePolygon(selectedZonaId, updated);
  };

  // Eliminar un vértice
  const handleVertexContextMenu = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (localPoints.length <= 3) return;
    if (!selectedZonaId || !onUpdateZonePolygon) return;
    const updated = localPoints.filter((_, i) => i !== idx);
    setLocalPoints(updated);
    onUpdateZonePolygon(selectedZonaId, updated);
  };

  // Estado del semáforo para pines
  const getSemaforoColor = (estado: EstadoSemaforo) => {
    switch (estado) {
      case 'rojo': return { fill: '#ef4444', stroke: '#991b1b', pulse: true };
      case 'naranja': return { fill: '#f97316', stroke: '#c2410c', pulse: true };
      case 'amarillo': return { fill: '#eab308', stroke: '#a16207', pulse: false };
      case 'verde': return { fill: '#22c55e', stroke: '#15803d', pulse: false };
      default: return { fill: '#64748b', stroke: '#334155', pulse: false };
    }
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

  const vbWidth = plano.dimensiones_viewbox?.width || 2000;
  const vbHeight = plano.dimensiones_viewbox?.height || 1200;
  const scaleFactor = Math.min(1.4, Math.max(0.7, vbWidth / 4000));

  return (
    <div className={`relative w-full h-full bg-[#070b13] overflow-hidden select-none flex flex-col ${isZenMode ? 'fixed inset-0 z-50 bg-[#070b13]' : ''}`}>
      {/* Loading Overlay */}
      {isConvertingPdf && (
        <div className="absolute inset-0 z-30 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center text-sky-400 space-y-3">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-xs font-mono font-bold">Vectorizando y procesando plano de alta resolución...</p>
        </div>
      )}

      {/* Indicador de Modo Activo arriba-centro */}
      {activeMode === 'add_hito' && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center space-x-2 bg-emerald-950/95 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-emerald-500 shadow-xl text-xs text-white animate-in fade-in slide-in-from-top-1">
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
      {selectedZona && activeMode === 'inspect' && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center space-x-2 bg-slate-900/90 backdrop-blur-md px-3 py-1 rounded-full border border-slate-700 shadow-lg text-[11px] text-slate-300">
          <span className="truncate max-w-[200px] sm:max-w-xs font-semibold">
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

      {/* Controles de Capas arriba-izquierda */}
      <div className="absolute top-2 left-2 z-20 flex items-center space-x-1 sm:space-x-1.5 bg-slate-900/90 backdrop-blur-md p-1 rounded-lg border border-slate-700/80 shadow-lg text-xs">
        <button
          onClick={() => setShowZonasLayer(!showZonasLayer)}
          className={`flex items-center space-x-1 px-2 py-1 rounded ${showZonasLayer ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40' : 'text-slate-400 hover:bg-slate-800'}`}
          title="Alternar visibilidad de Zonas"
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
          title="Alternar visibilidad de Hitos Geográficos (GPS)"
        >
          <Compass className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="hidden sm:inline">GPS</span>
          <span className="font-mono text-[10px] font-bold">({hitos.length})</span>
        </button>

        {/* Toggle para etiquetas Cortas / Completas */}
        <button
          onClick={() => setUseShortTags(!useShortTags)}
          className={`p-1.5 rounded transition ${useShortTags ? 'text-sky-300 hover:bg-slate-800' : 'bg-sky-500/20 text-sky-400 border border-sky-500/40'}`}
          title={useShortTags ? "Etiquetas compactas activas (clic para ver nombres completos)" : "Nombres completos activos (clic para ver solo ID corto)"}
        >
          <Tag className="w-3.5 h-3.5" />
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

      {/* Visor Pan & Zoom */}
      <TransformWrapper
        initialScale={1}
        minScale={0.05}
        maxScale={40}
        centerOnInit={true}
        limitToBounds={false}
        wheel={{ step: 0.25 }}
        pinch={{ step: 5 }}
        doubleClick={{ step: 2 }}
        disabled={activeMode !== 'inspect' || (isEditingPolygon && draggingVertexIdx !== null) || drawingPoints.length > 0}
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
                className="w-full h-full max-h-screen object-contain"
                onClick={handleSvgClick}
                onMouseMove={handleSvgMouseMove}
                onMouseUp={handleSvgMouseUp}
              >
                {/* Cuadrícula técnica sutil de fondo */}
                <defs>
                  <pattern id="grid-large" width="100" height="100" patternUnits="userSpaceOnUse">
                    <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#1e293b" strokeWidth="0.8" opacity="0.3" />
                  </pattern>
                  <filter id="pin-shadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#000000" floodOpacity="0.6" />
                  </filter>
                  <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid-large)" />

                {/* RENDERIZADO DEL PLANO CARGADO (Vectorial Puro SVG o Raster) */}
                {plano.svg_content ? (
                  <g dangerouslySetInnerHTML={{ __html: plano.svg_content }} />
                ) : (
                  (resolvedImageUrl || plano.archivo_data_url || plano.archivo_original_url) && (
                    <image
                      href={(resolvedImageUrl || plano.archivo_data_url || plano.archivo_original_url)!}
                      x="0"
                      y="0"
                      width={vbWidth}
                      height={vbHeight}
                      preserveAspectRatio="xMidYMid meet"
                      opacity="0.95"
                    />
                  )
                )}

                {!plano.archivo_data_url && !plano.archivo_original_url && !plano.svg_content && (
                  <g stroke="#475569" strokeWidth="2" fill="none">
                    <rect x="100" y="100" width={vbWidth - 200} height={vbHeight - 200} fill="#0f172a" stroke="#38bdf8" strokeWidth="2" rx="8" />
                    <text x="140" y="160" fill="#94a3b8" fontSize="24" fontFamily="monospace" fontWeight="bold">
                      {plano.titulo}
                    </text>
                    <text x="140" y="200" fill="#64748b" fontSize="16" fontFamily="monospace">
                      Usa el dock inferior para colocar pines, zonas o hitos GPS en este plano.
                    </text>
                  </g>
                )}

                {/* CAPA 1: Polígonos de Zonas de Inspección */}
                {showZonasLayer && zonas.map((zona) => {
                  const isSelected = selectedZonaId === zona.id;
                  const pts = (isSelected && localPoints.length >= 3) ? localPoints : (zona.poligono_svg?.puntos || []);
                  if (!pts || pts.length === 0) return null;
                  const pointsStr = pts.map(p => `${p.x},${p.y}`).join(' ');

                  const minX = Math.min(...pts.map(p => p.x));
                  const minY = Math.min(...pts.map(p => p.y));
                  const tagScale = Math.min(1.3, Math.max(0.9, vbWidth / 7000));
                  
                  const tagText = useShortTags 
                    ? (zona.codigo || 'Z').trim().toUpperCase()
                    : `${(zona.codigo || 'Z').trim().toUpperCase()} - ${zona.nombre}`;
                  
                  const badgeW = Math.max(32, tagText.length * 7.2 + 12) * tagScale;
                  const badgeH = 17 * tagScale;
                  const badgeX = minX + 2;
                  const badgeY = minY - badgeH > 4 ? minY - badgeH - 2 : minY + 3;

                  return (
                    <g key={zona.id} className="cursor-pointer" onClick={(e) => {
                      if (activeMode === 'inspect') {
                        e.stopPropagation();
                        onSelectZona(zona);
                      }
                    }}>
                      <polygon
                        points={pointsStr}
                        fill={isSelected ? 'rgba(14, 165, 233, 0.22)' : 'rgba(56, 189, 248, 0.06)'}
                        stroke={isSelected ? '#38bdf8' : '#0284c7'}
                        strokeWidth={isSelected ? 3 * scaleFactor : 1.8 * scaleFactor}
                        strokeDasharray={isSelected ? 'none' : `${8 * scaleFactor},${6 * scaleFactor}`}
                        className="transition-all hover:fill-sky-500/20"
                      />
                      {/* Badge / Indicación mínima que no invade el interior del equipo */}
                      <g className="transition-all hover:scale-105">
                        <rect
                          x={badgeX}
                          y={badgeY}
                          width={badgeW}
                          height={badgeH}
                          rx={3 * tagScale}
                          fill={isSelected ? '#0284c7' : 'rgba(9, 13, 22, 0.88)'}
                          stroke={isSelected ? '#38bdf8' : '#0284c7'}
                          strokeWidth={1.2 * tagScale}
                        />
                        <text
                          x={badgeX + badgeW / 2}
                          y={badgeY + badgeH / 2}
                          fill={isSelected ? '#ffffff' : '#38bdf8'}
                          fontSize={9.5 * tagScale}
                          fontFamily="monospace"
                          fontWeight="bold"
                          textAnchor="middle"
                          dominantBaseline="central"
                          pointerEvents="none"
                        >
                          {tagText}
                        </text>
                      </g>

                      {/* VÉRTICES INTERACTIVOS DE AJUSTE */}
                      {isSelected && isEditingPolygon && pts.map((p, idx) => (
                        <g
                          key={`vertex-${zona.id}-${idx}`}
                          className="cursor-move select-none"
                          onMouseDown={(e) => handleVertexMouseDown(e, idx)}
                          onContextMenu={(e) => handleVertexContextMenu(e, idx)}
                        >
                          <circle cx={p.x} cy={p.y} r={18 * scaleFactor} fill="transparent" />
                          <circle
                            cx={p.x}
                            cy={p.y}
                            r={(draggingVertexIdx === idx ? 13 : 9) * scaleFactor}
                            fill={draggingVertexIdx === idx ? '#f59e0b' : '#0284c7'}
                            stroke="#ffffff"
                            strokeWidth={2.5 * scaleFactor}
                            className="transition-all hover:scale-125 hover:fill-amber-400"
                          />
                          <circle cx={p.x} cy={p.y} r={3 * scaleFactor} fill="#0f172a" pointerEvents="none" />
                          <rect
                            x={p.x - 14 * scaleFactor}
                            y={p.y - 25 * scaleFactor}
                            width={28 * scaleFactor}
                            height={15 * scaleFactor}
                            rx={3 * scaleFactor}
                            fill="#090d16"
                            stroke="#38bdf8"
                            strokeWidth={0.8 * scaleFactor}
                            pointerEvents="none"
                          />
                          <text
                            x={p.x}
                            y={p.y - 14 * scaleFactor}
                            textAnchor="middle"
                            fill="#38bdf8"
                            fontSize={9 * scaleFactor}
                            fontFamily="monospace"
                            fontWeight="bold"
                            pointerEvents="none"
                          >
                            P{idx + 1}
                          </text>
                        </g>
                      ))}

                      {/* PUNTOS MEDIOS [+] PARA INSERTAR NUEVOS VÉRTICES */}
                      {isSelected && isEditingPolygon && pts.map((p, idx) => {
                        const nextP = pts[(idx + 1) % pts.length];
                        const mx = (p.x + nextP.x) / 2;
                        const my = (p.y + nextP.y) / 2;
                        return (
                          <g
                            key={`mid-${zona.id}-${idx}`}
                            className="cursor-pointer group select-none"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleInsertVertex(idx, mx, my);
                            }}
                          >
                            <circle cx={mx} cy={my} r={14 * scaleFactor} fill="transparent" />
                            <circle
                              cx={mx}
                              cy={my}
                              r={8 * scaleFactor}
                              fill="#090d16"
                              stroke="#38bdf8"
                              strokeWidth={1.8 * scaleFactor}
                              className="group-hover:fill-sky-500 group-hover:scale-125 transition-all"
                            />
                            <text
                              x={mx}
                              y={my + 3.5 * scaleFactor}
                              textAnchor="middle"
                              fill="#38bdf8"
                              fontSize={11 * scaleFactor}
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
                      fill={drawingPoints.length >= 3 ? 'rgba(56, 189, 248, 0.2)' : 'none'}
                      stroke="#38bdf8"
                      strokeWidth={3}
                      strokeDasharray="6,4"
                    />
                    {drawingPoints.map((pt, i) => (
                      <g key={i}>
                        <circle cx={pt.x} cy={pt.y} r={8 * scaleFactor} fill="#0284c7" stroke="#ffffff" strokeWidth={2} />
                        <text x={pt.x} y={pt.y - 12} fill="#38bdf8" fontSize={11} fontWeight="bold" textAnchor="middle">
                          #{i + 1}
                        </text>
                      </g>
                    ))}
                  </g>
                )}

                {/* CAPA 2: Pines de Activos Físicos con Semáforo */}
                {showPinsLayer && elementos.map((elem) => {
                  const isSelected = selectedElementoId === elem.id;
                  const color = getSemaforoColor(elem.estado_actual);
                  const x = elem.coordenadas_pin.x;
                  const y = elem.coordenadas_pin.y;

                  return (
                    <g
                      key={elem.id}
                      className="cursor-pointer group"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectElemento(elem);
                      }}
                      filter="url(#pin-shadow)"
                    >
                      {color.pulse && (
                        <circle
                          cx={x}
                          cy={y}
                          r={20 * scaleFactor}
                          fill={color.fill}
                          opacity="0.3"
                          className="animate-ping"
                        />
                      )}
                      <circle
                        cx={x}
                        cy={y}
                        r={isSelected ? 14 * scaleFactor : 10 * scaleFactor}
                        fill={color.fill}
                        stroke="#ffffff"
                        strokeWidth={isSelected ? 3 * scaleFactor : 2 * scaleFactor}
                        className="transition-all group-hover:scale-125"
                      />
                      <circle
                        cx={x}
                        cy={y}
                        r={4 * scaleFactor}
                        fill="#ffffff"
                      />
                      <g transform={`translate(${x}, ${y - 16 * scaleFactor})`} className="opacity-90 group-hover:opacity-100">
                        <rect
                          x={-35 * scaleFactor}
                          y={-14 * scaleFactor}
                          width={70 * scaleFactor}
                          height={14 * scaleFactor}
                          rx={3}
                          fill="#090d16"
                          stroke={isSelected ? '#38bdf8' : '#334155'}
                          strokeWidth={1}
                        />
                        <text
                          x="0"
                          y={-4 * scaleFactor}
                          fill="#e2e8f0"
                          fontSize={9 * scaleFactor}
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

                {/* CAPA 3: Hitos Geográficos y Puntos de Referencia GPS */}
                {showHitosLayer && hitos.filter(h => h.coordenadas_plano).map((hito) => {
                  const isSelected = selectedHitoId === hito.id;
                  const x = hito.coordenadas_plano!.x;
                  const y = hito.coordenadas_plano!.y;

                  return (
                    <g
                      key={hito.id}
                      className="cursor-pointer group"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSelectHito) onSelectHito(hito);
                      }}
                      filter="url(#pin-shadow)"
                    >
                      {/* Mira de Georreferenciación (Crosshair GPS) */}
                      <circle
                        cx={x}
                        cy={y}
                        r={16 * scaleFactor}
                        fill="transparent"
                        stroke="#10b981"
                        strokeWidth={1.2 * scaleFactor}
                        strokeDasharray="3,3"
                        className="animate-spin"
                        style={{ animationDuration: '10s' }}
                      />
                      <line x1={x - 20 * scaleFactor} y1={y} x2={x + 20 * scaleFactor} y2={y} stroke="#10b981" strokeWidth={1 * scaleFactor} opacity="0.6" />
                      <line x1={x} y1={y - 20 * scaleFactor} x2={x} y2={y + 20 * scaleFactor} stroke="#10b981" strokeWidth={1 * scaleFactor} opacity="0.6" />

                      {/* Pin Central Hito */}
                      <circle
                        cx={x}
                        cy={y}
                        r={isSelected ? 11 * scaleFactor : 8 * scaleFactor}
                        fill="#059669"
                        stroke="#ffffff"
                        strokeWidth={2 * scaleFactor}
                        className="transition-all group-hover:scale-125"
                      />
                      <circle
                        cx={x}
                        cy={y}
                        r={3 * scaleFactor}
                        fill="#ffffff"
                      />

                      {/* Etiqueta de Coordenadas GPS */}
                      <g transform={`translate(${x}, ${y - 18 * scaleFactor})`} className="opacity-95 group-hover:opacity-100">
                        <rect
                          x={-45 * scaleFactor}
                          y={-18 * scaleFactor}
                          width={90 * scaleFactor}
                          height={18 * scaleFactor}
                          rx={4}
                          fill="#064e3b"
                          stroke={isSelected ? '#34d399' : '#10b981'}
                          strokeWidth={1.2}
                        />
                        <text
                          x="0"
                          y={-10 * scaleFactor}
                          fill="#a7f3d0"
                          fontSize={8.5 * scaleFactor}
                          fontFamily="monospace"
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          🌐 {hito.codigo}
                        </text>
                        <text
                          x="0"
                          y={-2 * scaleFactor}
                          fill="#6ee7b7"
                          fontSize={6.5 * scaleFactor}
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
