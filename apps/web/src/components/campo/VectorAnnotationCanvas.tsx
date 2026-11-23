'use client';

import React, { useRef, useState, useEffect } from 'react';
import { VectorAnnotation } from '../../types';
import { Circle, Square, ArrowUpRight, PenTool, Type, Trash2, Undo } from 'lucide-react';

interface VectorAnnotationCanvasProps {
  imageSrc: string;
  annotations: VectorAnnotation[];
  onChange: (annotations: VectorAnnotation[]) => void;
}

export const VectorAnnotationCanvas: React.FC<VectorAnnotationCanvasProps> = ({
  imageSrc,
  annotations,
  onChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeTool, setActiveTool] = useState<'rectangulo' | 'circulo' | 'flecha' | 'trazo_libre'>('circulo');
  const [selectedColor, setSelectedColor] = useState<string>('#ef4444');
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);

  // Cargar imagen base
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageSrc;
    img.onload = () => {
      setLoadedImage(img);
    };
  }, [imageSrc]);

  // Redibujar canvas
  const redraw = (currentPoints?: { x: number; y: number }[]) => {
    const canvas = canvasRef.current;
    if (!canvas || !loadedImage) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Ajustar dimensiones internas
    canvas.width = canvas.parentElement?.clientWidth || 600;
    const scale = canvas.width / loadedImage.width;
    canvas.height = loadedImage.height * scale;

    // 1. Dibujar foto original
    ctx.drawImage(loadedImage, 0, 0, canvas.width, canvas.height);

    // 2. Dibujar anotaciones vectoriales existentes
    annotations.forEach((ann) => {
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = 3;
      ctx.fillStyle = ann.color;

      const normX = (v: number) => v * canvas.width;
      const normY = (v: number) => v * canvas.height;

      if (ann.tipo === 'circulo' && ann.coordenadas.x2 !== undefined && ann.coordenadas.y2 !== undefined) {
        const x1 = normX(ann.coordenadas.x);
        const y1 = normY(ann.coordenadas.y);
        const x2 = normX(ann.coordenadas.x2);
        const y2 = normY(ann.coordenadas.y2);
        const radius = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));

        ctx.beginPath();
        ctx.arc(x1, y1, radius, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (ann.tipo === 'rectangulo' && ann.coordenadas.x2 !== undefined && ann.coordenadas.y2 !== undefined) {
        const x1 = normX(ann.coordenadas.x);
        const y1 = normY(ann.coordenadas.y);
        const w = normX(ann.coordenadas.x2) - x1;
        const h = normY(ann.coordenadas.y2) - y1;
        ctx.beginPath();
        ctx.rect(x1, y1, w, h);
        ctx.stroke();
      } else if (ann.tipo === 'flecha' && ann.coordenadas.x2 !== undefined && ann.coordenadas.y2 !== undefined) {
        const x1 = normX(ann.coordenadas.x);
        const y1 = normY(ann.coordenadas.y);
        const x2 = normX(ann.coordenadas.x2);
        const y2 = normY(ann.coordenadas.y2);
        drawArrow(ctx, x1, y1, x2, y2, ann.color);
      } else if (ann.tipo === 'trazo_libre' && ann.coordenadas.puntos) {
        ctx.beginPath();
        ann.coordenadas.puntos.forEach((p, idx) => {
          const px = normX(p.x);
          const py = normY(p.y);
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      }
    });

    // 3. Dibujar trazo en progreso
    if (isDrawing && startPos) {
      ctx.strokeStyle = selectedColor;
      ctx.lineWidth = 3;

      if (currentPoints && activeTool === 'trazo_libre') {
        ctx.beginPath();
        currentPoints.forEach((p, idx) => {
          if (idx === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      }
    }
  };

  useEffect(() => {
    redraw();
  }, [loadedImage, annotations]);

  const drawArrow = (ctx: CanvasRenderingContext2D, fromx: number, fromy: number, tox: number, toy: number, color: string) => {
    const headlen = 14;
    const angle = Math.atan2(toy - fromy, tox - fromx);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(fromx, fromy);
    ctx.lineTo(tox, toy);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(tox, toy);
    ctx.lineTo(tox - headlen * Math.cos(angle - Math.PI / 6), toy - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(tox - headlen * Math.cos(angle + Math.PI / 6), toy - headlen * Math.sin(angle + Math.PI / 6));
    ctx.lineTo(tox, toy);
    ctx.fill();
  };

  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;
    if ('changedTouches' in e && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const pos = getCanvasCoords(e);
    setIsDrawing(true);
    setStartPos(pos);
    if (activeTool === 'trazo_libre') {
      setCurrentPath([pos]);
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !startPos) return;
    const pos = getCanvasCoords(e);

    if (activeTool === 'trazo_libre') {
      const updated = [...currentPath, pos];
      setCurrentPath(updated);
      redraw(updated);
    } else {
      redraw();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.strokeStyle = selectedColor;
      ctx.lineWidth = 3;

      if (activeTool === 'circulo') {
        const radius = Math.sqrt(Math.pow(pos.x - startPos.x, 2) + Math.pow(pos.y - startPos.y, 2));
        ctx.beginPath();
        ctx.arc(startPos.x, startPos.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (activeTool === 'rectangulo') {
        ctx.beginPath();
        ctx.strokeRect(startPos.x, startPos.y, pos.x - startPos.x, pos.y - startPos.y);
      } else if (activeTool === 'flecha') {
        drawArrow(ctx, startPos.x, startPos.y, pos.x, pos.y, selectedColor);
      }
    }
  };

  const handlePointerUp = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !startPos || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const endPos = getCanvasCoords(e);

    const norm = (val: number, max: number) => Math.max(0, Math.min(1, val / max));

    const newAnnotation: VectorAnnotation = {
      id: `ann_${Date.now()}`,
      tipo: activeTool,
      color: selectedColor,
      coordenadas: {
        x: norm(startPos.x, canvas.width),
        y: norm(startPos.y, canvas.height)
      }
    };

    if (activeTool === 'trazo_libre') {
      newAnnotation.coordenadas.puntos = currentPath.map(p => ({
        x: norm(p.x, canvas.width),
        y: norm(p.y, canvas.height)
      }));
    } else {
      newAnnotation.coordenadas.x2 = norm(endPos.x, canvas.width);
      newAnnotation.coordenadas.y2 = norm(endPos.y, canvas.height);
    }

    onChange([...annotations, newAnnotation]);
    setIsDrawing(false);
    setStartPos(null);
    setCurrentPath([]);
  };

  const handleUndo = () => {
    if (annotations.length === 0) return;
    onChange(annotations.slice(0, -1));
  };

  const handleClear = () => {
    onChange([]);
  };

  return (
    <div ref={containerRef} className="flex flex-col bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
      {/* Barra de herramientas vectoriales táctiles */}
      <div className="flex flex-wrap items-center justify-between p-2 bg-slate-800 border-b border-slate-700 gap-2">
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => setActiveTool('circulo')}
            className={`p-2 rounded ${activeTool === 'circulo' ? 'bg-amber-500 text-black font-bold' : 'text-slate-300 hover:bg-slate-700'}`}
            title="Encerrar corrosión (Círculo)"
          >
            <Circle className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setActiveTool('rectangulo')}
            className={`p-2 rounded ${activeTool === 'rectangulo' ? 'bg-amber-500 text-black font-bold' : 'text-slate-300 hover:bg-slate-700'}`}
            title="Zona afectada (Rectángulo)"
          >
            <Square className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setActiveTool('flecha')}
            className={`p-2 rounded ${activeTool === 'flecha' ? 'bg-amber-500 text-black font-bold' : 'text-slate-300 hover:bg-slate-700'}`}
            title="Señalar fisura o soldadura (Flecha)"
          >
            <ArrowUpRight className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setActiveTool('trazo_libre')}
            className={`p-2 rounded ${activeTool === 'trazo_libre' ? 'bg-amber-500 text-black font-bold' : 'text-slate-300 hover:bg-slate-700'}`}
            title="Trazado libre táctil"
          >
            <PenTool className="w-5 h-5" />
          </button>
        </div>

        {/* Paleta de colores de alto contraste */}
        <div className="flex items-center space-x-1.5">
          {['#ef4444', '#f59e0b', '#06b6d4', '#22c55e'].map(color => (
            <button
              key={color}
              type="button"
              onClick={() => setSelectedColor(color)}
              className={`w-6 h-6 rounded-full border-2 transition-transform ${selectedColor === color ? 'scale-125 border-white' : 'border-transparent'}`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>

        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={handleUndo}
            disabled={annotations.length === 0}
            className="p-2 text-slate-300 hover:bg-slate-700 disabled:opacity-30 rounded"
            title="Deshacer último trazo"
          >
            <Undo className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={annotations.length === 0}
            className="p-2 text-red-400 hover:bg-slate-700 disabled:opacity-30 rounded"
            title="Borrar anotaciones"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Lienzo interactivo */}
      <div className="relative w-full bg-black flex justify-center items-center touch-none">
        <canvas
          ref={canvasRef}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
          className="cursor-crosshair max-w-full block"
        />
      </div>

      <div className="p-2 bg-slate-950 text-xs text-slate-400 flex items-center justify-between">
        <span>Anotaciones vectoriales guardadas: <strong>{annotations.length}</strong></span>
        <span className="text-amber-400 font-mono">0 KB extra (Guardadas como vector JSON)</span>
      </div>
    </div>
  );
};
