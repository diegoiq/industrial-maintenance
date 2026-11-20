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
  Eye, 
  Upload, 
  Crosshair, 
  Loader2,
  Check,
  Undo2,
  Plus,
  HelpCircle,
  Square,
  Sparkles,
  Lock,
  Pencil
} from 'lucide-react';
import { Plano, ZonaInspeccion, Elemento, EstadoSemaforo } from '../../types';
import { convertPdfPageToImage, rotateImageDataUrl } from '../../lib/pdfRenderer';
import { db } from '../../lib/db';

interface InteractivePlantMapProps {
  plano?: Plano;
  zonas: ZonaInspeccion[];
  elementos: Elemento[];
  selectedZonaId?: string;
  selectedElementoId?: string;
  activeMode?: 'inspect' | 'add_pin' | 'add_zone';
  isEditingPolygon?: boolean;
  onSelectZona: (zona: ZonaInspeccion) => void;
  onSelectElemento: (elemento: Elemento) => void;
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
  selectedZonaId,
  selectedElementoId,
  activeMode = 'inspect',
  isEditingPolygon = false,
  onSelectZona,
  onSelectElemento,
  onMapClick,
  onOpenUploadModal,
  onPlanUpdated,
  onUpdateZonePolygon,
  onPolygonCreated,
  onToggleEditPolygon
}) => {
  const [showZonasLayer, setShowZonasLayer] = useState(true);
  const [showPinsLayer, setShowPinsLayer] = useState(true);
  const [resolvedImageUrl, setResolvedImageUrl] = useState<string | null>(plano?.archivo_data_url || null);
  const [isConvertingPdf, setIsConvertingPdf] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Estado para la edición interactiva de vértices de la zona seleccionada
  const [localPoints, setLocalPoints] = useState<{ x: number; y: number }[]>([]);
  const [draggingVertexIdx, setDraggingVertexIdx] = useState<number | null>(null);

  // Estado para el trazado libre de nuevos polígonos punto a punto
  const [drawingPoints, setDrawingPoints] = useState<{ x: number; y: number }[]>([]);

  const selectedZona = zonas.find(z => z.id === selectedZonaId);

  // Sincronizar vértices locales cuando cambia la zona seleccionada
  useEffect(() => {
    if (selectedZona?.poligono_svg?.puntos) {
      setLocalPoints(selectedZona.poligono_svg.puntos);
    } else {
      setLocalPoints([]);
    }
    setDraggingVertexIdx(null);
  }, [selectedZonaId, selectedZona?.poligono_svg?.puntos]);

  // Si se cancela el modo add_zone, limpiar los puntos en borrador
  useEffect(() => {
    if (activeMode !== 'add_zone') {
      setDrawingPoints([]);
    }
  }, [activeMode]);

  // Auto-recuperación: si el plano guardado es un PDF en base64, convertirlo a imagen nítida en el acto
  useEffect(() => {
    let isCancelled = false;

    async function checkAndConvertPdf() {
      if (!plano) {
        setResolvedImageUrl(null);
        return;
      }

      const currentUrl = plano.archivo_data_url;

      if (currentUrl && currentUrl.startsWith('data:application/pdf')) {
        setIsConvertingPdf(true);
        try {
          const rendered = await convertPdfPageToImage(currentUrl, 1, 2.0);
          if (!isCancelled) {
            setResolvedImageUrl(rendered.dataUrl);
            await db.planos.update(plano.id, {
              archivo_data_url: rendered.dataUrl,
              dimensiones_viewbox: {
                width: rendered.width,
                height: rendered.height
              }
            });
          }
        } catch (err) {
          console.error("Error al convertir PDF en InteractivePlantMap:", err);
        } finally {
          if (!isCancelled) setIsConvertingPdf(false);
        }
      } else {
        setResolvedImageUrl(currentUrl || null);
      }
    }

    checkAndConvertPdf();

    return () => {
      isCancelled = true;
    };
  }, [plano?.id, plano?.archivo_data_url]);

  const vbWidth = plano?.dimensiones_viewbox?.width || 1600;
  const vbHeight = plano?.dimensiones_viewbox?.height || 900;
  const scaleFactor = Math.min(3, Math.max(1, vbWidth / 3500));

  // Manejo de arrastre global de vértices para no perder el foco si el mouse sale del SVG
  useEffect(() => {
    if (draggingVertexIdx === null) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const screenCTM = svg.getScreenCTM();
      if (!screenCTM) return;
      const svgCoords = pt.matrixTransform(screenCTM.inverse());
      const newX = Math.round(Math.max(0, Math.min(vbWidth, svgCoords.x)));
      const newY = Math.round(Math.max(0, Math.min(vbHeight, svgCoords.y)));

      setLocalPoints(prev => {
        const next = [...prev];
        next[draggingVertexIdx] = { x: newX, y: newY };
        return next;
      });
    };

    const handleWindowMouseUp = () => {
      if (selectedZonaId && localPoints.length >= 3) {
        onUpdateZonePolygon?.(selectedZonaId, localPoints);
      }
      setDraggingVertexIdx(null);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [draggingVertexIdx, selectedZonaId, localPoints, vbWidth, vbHeight, onUpdateZonePolygon]);

  // Rotar el plano 90 grados permanentemente
  const handleRotatePlan = async (clockwise = true) => {
    if (!plano) return;
    setIsConvertingPdf(true);
    try {
      if (plano.svg_content) {
        const newW = vbHeight;
        const newH = vbWidth;
        const transform = clockwise
          ? `rotate(90) translate(0, -${vbHeight})`
          : `rotate(-90) translate(-${vbWidth}, 0)`;
        const rotatedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${newW} ${newH}" width="100%" height="100%">
          <g transform="${transform}">
            ${plano.svg_content}
          </g>
        </svg>`;
        await db.planos.update(plano.id, {
          svg_content: rotatedSvg,
          dimensiones_viewbox: { width: newW, height: newH }
        });
        if (onPlanUpdated) {
          onPlanUpdated({
            ...plano,
            svg_content: rotatedSvg,
            dimensiones_viewbox: { width: newW, height: newH }
          });
        }
        return;
      }

      const src = resolvedImageUrl || plano.archivo_data_url;
      if (src) {
        const res = await rotateImageDataUrl(src, clockwise);
        setResolvedImageUrl(res.dataUrl);
        await db.planos.update(plano.id, {
          archivo_data_url: res.dataUrl,
          dimensiones_viewbox: {
            width: res.width,
            height: res.height
          }
        });
        if (onPlanUpdated) {
          onPlanUpdated({
            ...plano,
            archivo_data_url: res.dataUrl,
            dimensiones_viewbox: {
              width: res.width,
              height: res.height
            }
          });
        }
      }
    } catch (err) {
      console.error("Error al rotar plano:", err);
    } finally {
      setIsConvertingPdf(false);
    }
  };

  const getPinColor = (estado: EstadoSemaforo) => {
    switch (estado) {
      case 'verde':
        return '#10b981';
      case 'amarillo':
        return '#f59e0b';
      case 'naranja':
        return '#f97316';
      case 'rojo':
        return '#ef4444';
      case 'gris':
      default:
        return '#64748b';
    }
  };

  // Clic en el SVG principal
  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;

    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const screenCTM = svg.getScreenCTM();
    if (!screenCTM) return;
    const svgCoords = pt.matrixTransform(screenCTM.inverse());
    const coords = { x: Math.round(svgCoords.x), y: Math.round(svgCoords.y) };

    // Si estamos en modo trazar nueva zona punto a punto
    if (activeMode === 'add_zone') {
      setDrawingPoints(prev => [...prev, coords]);
      return;
    }

    // Si estamos colocando un nuevo Pin
    if (activeMode === 'add_pin') {
      onMapClick?.(coords);
      return;
    }
  };

  // Iniciar arrastre de un vértice existente
  const handleVertexMouseDown = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    e.preventDefault();
    setDraggingVertexIdx(index);
  };

  // Insertar un nuevo vértice en el punto medio de un segmento (al pulsar el '+' en el borde)
  const handleInsertVertex = (afterIndex: number, mx: number, my: number) => {
    if (!selectedZonaId) return;
    const newPoints = [
      ...localPoints.slice(0, afterIndex + 1),
      { x: Math.round(mx), y: Math.round(my) },
      ...localPoints.slice(afterIndex + 1)
    ];
    setLocalPoints(newPoints);
    onUpdateZonePolygon?.(selectedZonaId, newPoints);
  };

  // Eliminar un vértice existente al hacer clic derecho (con mínimo de 3 vértices)
  const handleVertexContextMenu = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (localPoints.length <= 3) {
      alert("Un área o zona de intervención requiere un mínimo de 3 vértices para conformar un polígono.");
      return;
    }
    const newPoints = localPoints.filter((_, idx) => idx !== index);
    setLocalPoints(newPoints);
    if (selectedZonaId) {
      onUpdateZonePolygon?.(selectedZonaId, newPoints);
    }
  };

  // Finalizar trazado punto a punto de nueva zona
  const handleFinishDrawing = () => {
    if (drawingPoints.length >= 3) {
      onPolygonCreated?.(drawingPoints);
      setDrawingPoints([]);
    }
  };

  // Crear un rectángulo inicial rápido en el centro
  const handleQuickRectangle = () => {
    const centerX = Math.round(vbWidth / 2);
    const centerY = Math.round(vbHeight / 2);
    const rectPoints = [
      { x: centerX - 250, y: centerY - 150 },
      { x: centerX + 250, y: centerY - 150 },
      { x: centerX + 250, y: centerY + 150 },
      { x: centerX - 250, y: centerY + 150 }
    ];
    onPolygonCreated?.(rectPoints);
    setDrawingPoints([]);
  };

  // Si no hay ningún plano cargado aún
  if (!plano) {
    return (
      <div className="relative w-full h-[650px] bg-slate-950 border-2 border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
          <Upload className="w-8 h-8" />
        </div>
        <div className="max-w-md space-y-1.5">
          <h3 className="text-xl font-bold text-white">No hay planos cargados en la fábrica</h3>
          <p className="text-xs text-slate-400">
            Sube el primer plano en formato <strong>SVG, DXF o Imagen (PNG/JPG)</strong> de la planta o nave industrial para comenzar a colocar pines de activos y delimitar zonas.
          </p>
        </div>
        {onOpenUploadModal && (
          <button
            type="button"
            onClick={onOpenUploadModal}
            className="px-6 py-3 bg-sky-500 hover:bg-sky-400 text-black font-black text-xs uppercase tracking-wider rounded-xl shadow-xl transition flex items-center space-x-2"
          >
            <Upload className="w-4 h-4" />
            <span>Subir Primer Plano de Planta</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`relative w-full h-[650px] bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col ${
      activeMode === 'add_pin' ? 'cursor-crosshair ring-2 ring-amber-500/50' : 
      activeMode === 'add_zone' ? 'cursor-crosshair ring-2 ring-sky-500/50' : ''
    }`}>
      {/* Overlay de procesamiento de PDF */}
      {isConvertingPdf && (
        <div className="absolute inset-0 z-40 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-3">
          <Loader2 className="w-12 h-12 text-sky-400 animate-spin" />
          <div className="max-w-md space-y-1">
            <h4 className="text-base font-bold text-white">Renderizando Layout PDF en Alta Resolución...</h4>
            <p className="text-xs text-slate-400">
              Convirtiendo el archivo PDF a lienzo digital de alta definición para habilitar colocación de pines y zonas interactivas.
            </p>
          </div>
        </div>
      )}

      {/* Barra de Trazado de Nueva Zona (Modo add_zone) */}
      {activeMode === 'add_zone' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center space-x-2 bg-slate-900/95 border border-sky-400 p-2 rounded-xl shadow-2xl backdrop-blur-md text-xs">
          <div className="flex items-center space-x-1.5 px-2 text-sky-300 font-bold">
            <Sparkles className="w-4 h-4 text-sky-400 animate-pulse" />
            <span>
              {drawingPoints.length === 0 
                ? 'Haz clic en el plano para colocar los vértices del contorno' 
                : `${drawingPoints.length} vértices colocados`}
            </span>
          </div>

          {drawingPoints.length >= 3 && (
            <button
              type="button"
              onClick={handleFinishDrawing}
              className="px-3 py-1 bg-sky-500 hover:bg-sky-400 text-black font-extrabold rounded-lg flex items-center space-x-1 shadow transition"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Crear Zona con este Contorno</span>
            </button>
          )}

          {drawingPoints.length > 0 && (
            <button
              type="button"
              onClick={() => setDrawingPoints(prev => prev.slice(0, -1))}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center space-x-1 transition"
              title="Deshacer último vértice"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Deshacer Punto</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleQuickRectangle}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 rounded-lg flex items-center space-x-1 transition"
            title="Crear un rectángulo inicial editable en el centro"
          >
            <Square className="w-3.5 h-3.5" />
            <span>Rectángulo Rápido</span>
          </button>
        </div>
      )}

      {/* Indicador de Pin Activo */}
      {activeMode === 'add_pin' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-1.5 rounded-full text-xs font-bold font-mono shadow-2xl flex items-center space-x-2 bg-slate-900 border border-amber-400 text-amber-300 animate-pulse">
          <Crosshair className="w-4 h-4 text-amber-400" />
          <span>MODO ACTIVO: Haz clic en el plano para colocar un Pin de Activo</span>
        </div>
      )}

      {/* Pill indicador y Botón de Bloqueo/Edición de Zona Seleccionada */}
      {activeMode === 'inspect' && selectedZona && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex items-center space-x-2.5 bg-slate-900/95 border border-sky-500/60 px-4 py-1.5 rounded-full shadow-2xl text-[11px] text-sky-200 backdrop-blur-md">
          {isEditingPolygon ? (
            <>
              <span className="font-extrabold text-amber-300 flex items-center space-x-1">
                <Pencil className="w-3 h-3 text-amber-400" />
                <span>Edición de Contorno ({selectedZona.nombre}):</span>
              </span>
              <span className="text-slate-300">Arrastra nodos P1..P{localPoints.length} · Pulsa [+] para quiebres</span>
              {onToggleEditPolygon && (
                <button
                  type="button"
                  onClick={onToggleEditPolygon}
                  className="ml-2 px-2.5 py-0.5 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-full flex items-center space-x-1 shadow transition"
                  title="Bloquear contorno y guardar forma"
                >
                  <Lock className="w-3 h-3" />
                  <span>Bloquear y Finalizar</span>
                </button>
              )}
            </>
          ) : (
            <>
              <span className="font-semibold text-slate-300">
                Zona: <strong className="text-white">{selectedZona.nombre}</strong>
              </span>
              <span className="text-slate-400 font-mono text-[10px]">({selectedZona.poligono_svg?.puntos?.length || 4} vértices · Bloqueado)</span>
              {onToggleEditPolygon && (
                <button
                  type="button"
                  onClick={onToggleEditPolygon}
                  className="ml-2 px-2.5 py-0.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-full flex items-center space-x-1 transition shadow"
                  title="Habilitar edición de contorno y mover vértices en el mapa"
                >
                  <Pencil className="w-3 h-3" />
                  <span>Editar Contorno</span>
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Controles de Capas y Zoom */}
      <div className="absolute top-4 left-4 z-20 flex items-center space-x-2 bg-slate-900/90 backdrop-blur-md p-1.5 rounded-lg border border-slate-700 shadow-lg text-xs">
        <button
          onClick={() => setShowZonasLayer(!showZonasLayer)}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded ${showZonasLayer ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40' : 'text-slate-400 hover:bg-slate-800'}`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Polígonos Zonas ({zonas.length})</span>
        </button>
        <button
          onClick={() => setShowPinsLayer(!showPinsLayer)}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded ${showPinsLayer ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'text-slate-400 hover:bg-slate-800'}`}
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>Pines de Activos ({elementos.length})</span>
        </button>
        <button
          onClick={() => handleRotatePlan(true)}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded text-amber-400 hover:text-amber-300 hover:bg-slate-800 transition border border-amber-500/30 bg-amber-950/20"
          title="Girar Plano +90° Horario (Ajustar Orientación)"
        >
          <RotateCw className="w-3.5 h-3.5" />
          <span>Girar Plano 90°</span>
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
            <div className="absolute top-4 right-4 z-20 flex flex-col space-y-1 bg-slate-900/90 backdrop-blur-md p-1 rounded-lg border border-slate-700 shadow-lg">
              <button
                onClick={() => zoomIn(0.6)}
                className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
                title="Acercar (Zoom In - También rueda del mouse)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => zoomOut(0.6)}
                className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition"
                title="Alejar (Zoom Out)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>

              {/* Botones de salto rápido de Zoom para planos de alta resolución */}
              <div className="flex flex-col border-t border-slate-800 pt-1 space-y-1">
                <button
                  onClick={() => zoomIn(2)}
                  className="px-1.5 py-1 text-[10px] font-mono font-bold text-sky-400 hover:bg-slate-800 rounded text-center transition"
                  title="Salto de Zoom +2x"
                >
                  +2x
                </button>
                <button
                  onClick={() => zoomIn(6)}
                  className="px-1.5 py-1 text-[10px] font-mono font-bold text-emerald-400 hover:bg-slate-800 rounded text-center transition"
                  title="Salto de Zoom +6x (Detalle Máximo de Equipos y Cañerías)"
                >
                  +6x
                </button>
              </div>

              <button
                onClick={() => handleRotatePlan(true)}
                className="p-2 text-amber-400 hover:text-amber-300 hover:bg-slate-800 rounded border-t border-slate-800"
                title="Girar Plano +90° Horario (Ajustar Orientación)"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleRotatePlan(false)}
                className="p-2 text-amber-400 hover:text-amber-300 hover:bg-slate-800 rounded"
                title="Girar Plano -90° Antihorario"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={() => resetTransform()}
                className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded border-t border-slate-800"
                title="Restablecer plano completo (1x)"
              >
                <RotateCcw className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full flex items-center justify-center">
              <svg
                ref={svgRef}
                viewBox={`0 0 ${vbWidth} ${vbHeight}`}
                className="w-full h-full select-none"
                style={{ background: '#0b1120' }}
                onClick={handleSvgClick}
              >
                {/* Cuadrícula de ingeniería de fondo */}
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.8" />
                  </pattern>
                  <pattern id="grid-large" width="200" height="200" patternUnits="userSpaceOnUse">
                    <rect width="200" height="200" fill="url(#grid)" />
                    <path d="M 200 0 L 0 0 0 200" fill="none" stroke="#334155" strokeWidth="1.5" />
                  </pattern>
                  <filter id="glow-selected" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid-large)" />

                {/* RENDERIZADO DEL PLANO CARGADO (Vectorial Puro SVG o Raster) */}
                {plano.svg_content ? (
                  <g dangerouslySetInnerHTML={{ __html: plano.svg_content }} />
                ) : (
                  (resolvedImageUrl || (plano.archivo_data_url && !plano.archivo_data_url.startsWith('data:application/pdf'))) && (
                    <image
                      href={(resolvedImageUrl || plano.archivo_data_url)!}
                      x="0"
                      y="0"
                      width={vbWidth}
                      height={vbHeight}
                      preserveAspectRatio="xMidYMid meet"
                      opacity="0.95"
                    />
                  )
                )}

                {!plano.archivo_data_url && !plano.svg_content && (
                  <g stroke="#475569" strokeWidth="2" fill="none">
                    <rect x="100" y="100" width={vbWidth - 200} height={vbHeight - 200} fill="#0f172a" stroke="#38bdf8" strokeWidth="2" rx="8" />
                    <text x="140" y="160" fill="#94a3b8" fontSize="24" fontFamily="monospace" fontWeight="bold">
                      {plano.titulo}
                    </text>
                    <text x="140" y="200" fill="#64748b" fontSize="16" fontFamily="monospace">
                      Haz clic en "Colocar Pin" o "Crear Zona" para comenzar a mapear los activos de esta planta.
                    </text>
                  </g>
                )}

                {/* CAPA 1: Polígonos de Zonas de Inspección */}
                {showZonasLayer && zonas.map((zona) => {
                  const isSelected = selectedZonaId === zona.id;
                  const pts = (isSelected && localPoints.length >= 3) ? localPoints : (zona.poligono_svg?.puntos || []);
                  if (!pts || pts.length === 0) return null;
                  const pointsStr = pts.map(p => `${p.x},${p.y}`).join(' ');

                  // Posición minimalista para etiqueta (rótulo pestaña en borde exterior para no tapar equipos)
                  const minX = Math.min(...pts.map(p => p.x));
                  const minY = Math.min(...pts.map(p => p.y));
                  const tagScale = Math.min(1.3, Math.max(0.9, vbWidth / 7000));
                  
                  // ID de indicación mínimo y corto
                  const shortId = (zona.codigo || 'Z').trim().toUpperCase();
                  const badgeW = Math.max(32, shortId.length * 7.5 + 12) * tagScale;
                  const badgeH = 17 * tagScale;
                  const badgeX = minX + 2;
                  // Si hay espacio arriba, como pestaña por fuera; si está al tope superior, adentro
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
                      {/* Badge / Indicación mínima y corta (No invade ni tapa el interior) */}
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
                          {shortId}
                        </text>
                      </g>

                      {/* VÉRTICES INTERACTIVOS DE AJUSTE (ÚNICAMENTE SI ESTÁ SELECCIONADA Y EN MODO EDICIÓN HABILITADO) */}
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

                      {/* PUNTOS MEDIOS [+] PARA INSERTAR NUEVOS VÉRTICES (ÚNICAMENTE SI ESTÁ EN MODO EDICIÓN HABILITADO) */}
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

                {/* TRAZADO DINÁMICO DE NUEVA ZONA (MODO add_zone) */}
                {activeMode === 'add_zone' && drawingPoints.length > 0 && (
                  <g className="pointer-events-none">
                    <polyline
                      points={drawingPoints.map(p => `${p.x},${p.y}`).join(' ')}
                      fill={drawingPoints.length >= 3 ? 'rgba(56, 189, 248, 0.2)' : 'none'}
                      stroke="#38bdf8"
                      strokeWidth={3}
                      strokeDasharray="6,4"
                    />
                    {drawingPoints.length >= 3 && (
                      <line
                        x1={drawingPoints[drawingPoints.length - 1].x}
                        y1={drawingPoints[drawingPoints.length - 1].y}
                        x2={drawingPoints[0].x}
                        y2={drawingPoints[0].y}
                        stroke="#38bdf8"
                        strokeWidth={2}
                        strokeDasharray="4,4"
                      />
                    )}
                    {drawingPoints.map((p, idx) => (
                      <g key={`draw-pt-${idx}`}>
                        <circle cx={p.x} cy={p.y} r={9} fill="#38bdf8" stroke="#ffffff" strokeWidth={2} />
                        <text x={p.x} y={p.y + 3.5} textAnchor="middle" fill="#0f172a" fontSize="10" fontWeight="bold">
                          {idx + 1}
                        </text>
                      </g>
                    ))}
                  </g>
                )}

                {/* CAPA 2: Pines interactivos de Elementos con Semáforo */}
                {showPinsLayer && elementos.map((elem) => {
                  const isSelected = selectedElementoId === elem.id;
                  const color = getPinColor(elem.estado_actual);

                  return (
                    <g
                      key={elem.id}
                      transform={`translate(${elem.coordenadas_pin.x}, ${elem.coordenadas_pin.y})`}
                      className="cursor-pointer group"
                      onClick={(e) => {
                        if (activeMode === 'inspect') {
                          e.stopPropagation();
                          onSelectElemento(elem);
                        }
                      }}
                      filter={isSelected ? 'url(#glow-selected)' : undefined}
                    >
                      {(elem.estado_actual === 'rojo' || elem.estado_actual === 'naranja') && (
                        <circle
                          cx="0"
                          cy="0"
                          r={22 * scaleFactor}
                          fill={color}
                          opacity="0.25"
                          className="animate-ping"
                        />
                      )}

                      <circle
                        cx="0"
                        cy="0"
                        r={(isSelected ? 16 : 12) * scaleFactor}
                        fill="#0f172a"
                        stroke={color}
                        strokeWidth={(isSelected ? 4 : 3) * scaleFactor}
                      />
                      <circle
                        cx="0"
                        cy="0"
                        r={(isSelected ? 7 : 5) * scaleFactor}
                        fill={color}
                      />

                      <rect
                        x={16 * scaleFactor}
                        y={-12 * scaleFactor}
                        width={(elem.tag_codigo.length * 8 + 14) * scaleFactor}
                        height={24 * scaleFactor}
                        rx={4 * scaleFactor}
                        fill="#020617"
                        stroke={isSelected ? '#f59e0b' : '#334155'}
                        strokeWidth={(isSelected ? 1.5 : 1) * scaleFactor}
                      />
                      <text
                        x={23 * scaleFactor}
                        y={4 * scaleFactor}
                        fill={isSelected ? '#fbbf24' : '#f8fafc'}
                        fontSize="11"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        {elem.tag_codigo}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </TransformComponent>
          </>
        )}
      </TransformWrapper>

      {/* Indicador Flotante de Zona Seleccionada (Muestra qué es sin tapar el plano) */}
      {(() => {
        const selZ = zonas.find(z => z.id === selectedZonaId);
        if (!selZ) return null;
        return (
          <div className="absolute bottom-12 left-4 z-20 flex items-center space-x-2.5 bg-slate-900/95 backdrop-blur-md px-3.5 py-2 rounded-xl border border-sky-500/50 text-xs shadow-2xl max-w-lg transition-all animate-in fade-in slide-in-from-bottom-2">
            <span className="font-mono font-black text-sky-300 uppercase bg-sky-950 px-2 py-0.5 rounded border border-sky-700 text-[11px] flex-shrink-0">
              {selZ.codigo}
            </span>
            <div className="overflow-hidden">
              <span className="font-bold text-white text-xs block truncate">
                {selZ.nombre}
              </span>
              <div className="text-[10px] text-slate-400 flex items-center space-x-2">
                <span>{selZ.nombre_nivel || `Cota +${((selZ.cota_nivel || 146000) / 1000).toFixed(3)} m`}</span>
                {selZ.nivel_acceso_andamio?.requiere_andamio && (
                  <span className="text-amber-400 font-medium">· Andamio {selZ.nivel_acceso_andamio.envolvente_m3} m³</span>
                )}
                {selZ.superficie_estimada_m2 && (
                  <span className="text-slate-400 font-medium">· {selZ.superficie_estimada_m2} m²</span>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Barra de Leyenda del Semáforo */}
      <div className="absolute bottom-3 left-4 z-20 flex items-center space-x-3 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300">
        <span className="font-semibold text-slate-400">Semáforo:</span>
        <div className="flex items-center space-x-1">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span>Verde</span>
        </div>
        <div className="flex items-center space-x-1">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
          <span>Amarillo</span>
        </div>
        <div className="flex items-center space-x-1">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
          <span>Naranja</span>
        </div>
        <div className="flex items-center space-x-1">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          <span className="font-semibold text-red-400">Rojo</span>
        </div>
        <div className="flex items-center space-x-1">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
          <span>Gris</span>
        </div>
      </div>
    </div>
  );
};
