'use client';

import React, { useState } from 'react';
import { Upload, X, CheckCircle2, AlertCircle, Building2, Map, Layers, RotateCw, RotateCcw, Loader2, Sparkles, FileCode } from 'lucide-react';
import { Area, Plano } from '../../types';
import { convertPdfPageToImage, convertPdfPageToSvg, rotateImageDataUrl } from '../../lib/pdfRenderer';
import { parseDxfToSvg } from '../../lib/dxfParser';
import { sanitizeSvgContent } from '../../lib/security';
import { db } from '../../lib/db';

interface UploadPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  areas: Area[];
  onPlanCreated: (newPlan: Plano, newArea?: Area) => void;
}

export const UploadPlanModal: React.FC<UploadPlanModalProps> = ({
  isOpen,
  onClose,
  areas,
  onPlanCreated
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [fileType, setFileType] = useState<'svg' | 'image' | 'dxf' | 'dwg' | 'pdf' | null>(null);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [pdfRenderMode, setPdfRenderMode] = useState<'vector' | 'raster'>('vector');
  const [pdfPageCount, setPdfPageCount] = useState<number>(1);
  const [selectedPdfPage, setSelectedPdfPage] = useState<number>(1);
  const [pdfScaleQuality, setPdfScaleQuality] = useState<number>(3.5);

  // Dimensiones del plano
  const [viewBoxWidth, setViewBoxWidth] = useState<number>(1600);
  const [viewBoxHeight, setViewBoxHeight] = useState<number>(900);

  // Selección o alta de Área
  const [selectedAreaId, setSelectedAreaId] = useState<string>(areas[0]?.id || 'new');
  const [isCreatingNewArea, setIsCreatingNewArea] = useState<boolean>(areas.length === 0);
  const [newAreaCodigo, setNewAreaCodigo] = useState('');
  const [newAreaNombre, setNewAreaNombre] = useState('');
  const [newAreaUbicacionERP, setNewAreaUbicacionERP] = useState('');
  const [newAreaDescripcion, setNewAreaDescripcion] = useState('');

  // Detalles del plano
  const [tituloPlano, setTituloPlano] = useState('');
  const [tipoPlano, setTipoPlano] = useState<'layout_general' | 'area_detalle' | 'elevacion_isometrico'>('area_detalle');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setErrorMessage(null);
    const fname = selected.name.toLowerCase();

    // Sugerir título si está vacío
    if (!tituloPlano) {
      setTituloPlano(selected.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").toUpperCase());
    }

    // Caso 1: Archivo DWG de AutoCAD
    if (fname.endsWith('.dwg')) {
      setFileType('dwg');
      setFilePreview(null);
      setSvgContent(null);
      return;
    }

    // Caso 2: Archivo PDF (Soporte Vectorial Puro SVG o Raster)
    if (fname.endsWith('.pdf') || selected.type === 'application/pdf') {
      setFileType('pdf');
      setIsProcessingPdf(true);
      try {
        if (pdfRenderMode === 'vector') {
          const renderedSvg = await convertPdfPageToSvg(selected, 1);
          setSvgContent(renderedSvg.svgContent);
          setFilePreview(renderedSvg.svgContent);
          setViewBoxWidth(renderedSvg.width);
          setViewBoxHeight(renderedSvg.height);
          setPdfPageCount(renderedSvg.totalPages);
          setSelectedPdfPage(1);
        } else {
          const rendered = await convertPdfPageToImage(selected, 1, pdfScaleQuality);
          setFilePreview(rendered.dataUrl);
          setSvgContent(null);
          setViewBoxWidth(rendered.width);
          setViewBoxHeight(rendered.height);
          setPdfPageCount(rendered.totalPages);
          setSelectedPdfPage(1);
        }
      } catch (err: any) {
        console.warn("Fallo conversión vectorial SVG, probando raster:", err);
        try {
          const rendered = await convertPdfPageToImage(selected, 1, pdfScaleQuality);
          setFilePreview(rendered.dataUrl);
          setSvgContent(null);
          setViewBoxWidth(rendered.width);
          setViewBoxHeight(rendered.height);
          setPdfPageCount(rendered.totalPages);
          setSelectedPdfPage(1);
          setPdfRenderMode('raster');
        } catch (rasterErr: any) {
          setErrorMessage("No se pudo renderizar el archivo PDF: " + (rasterErr?.message || "error desconocido"));
        }
      } finally {
        setIsProcessingPdf(false);
      }
    } 
    // Caso 3: SVG Vectorial Nativo
    else if (fname.endsWith('.svg')) {
      setFileType('svg');
      const reader = new FileReader();
      reader.onload = (event) => {
        const rawText = event.target?.result as string;
        const text = sanitizeSvgContent(rawText);
        setSvgContent(text);
        setFilePreview(text);

        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "image/svg+xml");
        const svgEl = doc.querySelector("svg");
        if (svgEl) {
          const vb = svgEl.getAttribute("viewBox");
          if (vb) {
            const parts = vb.split(/[\s,]+/).map(Number);
            if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
              setViewBoxWidth(parts[2]);
              setViewBoxHeight(parts[3]);
            }
          } else {
            const w = parseFloat(svgEl.getAttribute("width") || "1600");
            const h = parseFloat(svgEl.getAttribute("height") || "900");
            setViewBoxWidth(w);
            setViewBoxHeight(h);
          }
        }
      };
      reader.readAsText(selected);
    } 
    // Caso 4: DXF de AutoCAD (Vectorial Puro con Zoom Infinito)
    else if (fname.endsWith('.dxf')) {
      setFileType('dxf');
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const dxfText = reader.result as string;
          const parsed = parseDxfToSvg(dxfText);
          setSvgContent(parsed.svgContent);
          setFilePreview(parsed.svgContent);
          setViewBoxWidth(parsed.width);
          setViewBoxHeight(parsed.height);
        } catch (err: any) {
          console.error("Error al procesar DXF:", err);
          setErrorMessage("Error al convertir archivo DXF: " + (err?.message || "error de sintaxis"));
        }
      };
      reader.readAsText(selected);
    } 
    // Caso 5: Imagen estándar (PNG, JPG, WebP)
    else {
      setFileType('image');
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setFilePreview(dataUrl);

        const img = new Image();
        img.onload = () => {
          setViewBoxWidth(img.naturalWidth || 1600);
          setViewBoxHeight(img.naturalHeight || 900);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(selected);
    }
  };

  const handlePageChange = async (newPage: number) => {
    if (!file || fileType !== 'pdf') return;
    setIsProcessingPdf(true);
    try {
      if (pdfRenderMode === 'vector') {
        const renderedSvg = await convertPdfPageToSvg(file, newPage);
        setSvgContent(renderedSvg.svgContent);
        setFilePreview(renderedSvg.svgContent);
        setViewBoxWidth(renderedSvg.width);
        setViewBoxHeight(renderedSvg.height);
      } else {
        const rendered = await convertPdfPageToImage(file, newPage, pdfScaleQuality);
        setFilePreview(rendered.dataUrl);
        setSvgContent(null);
        setViewBoxWidth(rendered.width);
        setViewBoxHeight(rendered.height);
      }
      setSelectedPdfPage(newPage);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessingPdf(false);
    }
  };

  const handlePdfModeToggle = async (mode: 'vector' | 'raster') => {
    setPdfRenderMode(mode);
    if (!file || fileType !== 'pdf') return;
    setIsProcessingPdf(true);
    try {
      if (mode === 'vector') {
        const renderedSvg = await convertPdfPageToSvg(file, selectedPdfPage);
        setSvgContent(renderedSvg.svgContent);
        setFilePreview(renderedSvg.svgContent);
        setViewBoxWidth(renderedSvg.width);
        setViewBoxHeight(renderedSvg.height);
      } else {
        const rendered = await convertPdfPageToImage(file, selectedPdfPage, pdfScaleQuality);
        setFilePreview(rendered.dataUrl);
        setSvgContent(null);
        setViewBoxWidth(rendered.width);
        setViewBoxHeight(rendered.height);
      }
    } catch (err: any) {
      setErrorMessage("Error al cambiar modo de renderizado: " + err?.message);
    } finally {
      setIsProcessingPdf(false);
    }
  };

  const handleQualityChange = async (quality: number) => {
    setPdfScaleQuality(quality);
    if (!file || fileType !== 'pdf') return;
    setIsProcessingPdf(true);
    try {
      const rendered = await convertPdfPageToImage(file, selectedPdfPage, quality);
      setFilePreview(rendered.dataUrl);
      setSvgContent(null);
      setViewBoxWidth(rendered.width);
      setViewBoxHeight(rendered.height);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessingPdf(false);
    }
  };

  const handleRotatePreviewCw = async () => {
    if (!filePreview) return;
    setIsProcessingPdf(true);
    try {
      const res = await rotateImageDataUrl(filePreview, true);
      setFilePreview(res.dataUrl);
      setViewBoxWidth(res.width);
      setViewBoxHeight(res.height);
    } finally {
      setIsProcessingPdf(false);
    }
  };

  const handleRotatePreviewCcw = async () => {
    if (!filePreview) return;
    setIsProcessingPdf(true);
    try {
      const res = await rotateImageDataUrl(filePreview, false);
      setFilePreview(res.dataUrl);
      setViewBoxWidth(res.width);
      setViewBoxHeight(res.height);
    } finally {
      setIsProcessingPdf(false);
    }
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();

    if (fileType === 'dwg') {
      setErrorMessage("Los archivos .DWG deben ser exportados a .DXF o PDF antes de guardar.");
      return;
    }

    if (!file && !filePreview) {
      setErrorMessage("Por favor selecciona un archivo de plano (SVG, DXF, PNG, JPG, PDF).");
      return;
    }

    if (!tituloPlano.trim()) {
      setErrorMessage("Por favor ingresa un título para el plano.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      let finalAreaId = selectedAreaId;
      let createdArea: Area | undefined = undefined;

      // Crear nueva área si se solicitó o si no existen áreas
      if (isCreatingNewArea || selectedAreaId === 'new') {
        if (!newAreaCodigo.trim() || !newAreaNombre.trim()) {
          setErrorMessage("Debes ingresar el Código y Nombre para la nueva Área.");
          setIsSubmitting(false);
          return;
        }

        const newAreaId = `area_${Date.now()}`;
        createdArea = {
          id: newAreaId,
          codigo: newAreaCodigo.trim().toUpperCase(),
          nombre: newAreaNombre.trim(),
          ubicacion_tecnica_erp: newAreaUbicacionERP.trim() || undefined,
          descripcion: newAreaDescripcion.trim() || undefined
        };

        await db.areas.put(createdArea);
        finalAreaId = newAreaId;
      }

      // Crear el nuevo plano
      const newPlanoId = `plano_${Date.now()}`;
      const isVector = fileType === 'svg' || fileType === 'dxf' || (fileType === 'pdf' && !!svgContent);
      const newPlano: Plano = {
        id: newPlanoId,
        area_id: finalAreaId,
        titulo: tituloPlano.trim(),
        tipo_plano: tipoPlano,
        dimensiones_viewbox: {
          width: viewBoxWidth,
          height: viewBoxHeight
        },
        version: 1,
        activo: true,
        svg_content: isVector ? (svgContent || undefined) : undefined,
        archivo_data_url: (!isVector && filePreview) ? filePreview : undefined
      };

      await db.planos.put(newPlano);

      onPlanCreated(newPlano, createdArea);
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err?.message || "Ocurrió un error al guardar el plano.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-2xl bg-slate-900 border-2 border-sky-500 rounded-2xl overflow-hidden shadow-2xl flex flex-col my-8">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700">
          <div className="flex items-center space-x-2.5">
            <Upload className="w-5 h-5 text-sky-400" />
            <h3 className="text-base font-bold text-white">Subir Nuevo Plano de Planta o Nave Industrial</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSavePlan} className="p-6 space-y-5 text-xs">
          {/* Banner de Jerarquía Multi-Plano y Formatos CAD */}
          <div className="bg-sky-950/40 border border-sky-500/40 rounded-xl p-3 flex items-start space-x-2.5 text-[11px] text-sky-200">
            <Layers className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-extrabold text-white block">Formatos Soportados y Jerarquía Multi-Plano</span>
              <p className="text-slate-300">
                Puedes subir <strong className="text-amber-300">AutoCAD DXF (vectorial infinito)</strong>, <strong className="text-sky-300">PDFs en Ultra Alta Resolución</strong> o <strong className="text-emerald-300">SVG</strong>. Subir un nuevo plano nunca sobreescribe tu trabajo anterior.
              </p>
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 bg-red-950/80 border border-red-500/50 rounded-lg text-red-300 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 1. Selector de Archivo */}
          <div className="space-y-2">
            <label className="font-bold text-slate-300 uppercase tracking-wider block">
              1. Seleccionar Archivo de Plano (PDF, SVG, DXF, DWG o Imagen)
            </label>
            <div className="border-2 border-dashed border-slate-700 hover:border-sky-400 rounded-xl p-5 bg-slate-950 flex flex-col items-center justify-center cursor-pointer transition">
              <input
                type="file"
                accept=".pdf,.svg,.dxf,.dwg,.png,.jpg,.jpeg,.webp"
                onChange={handleFileChange}
                className="hidden"
                id="plan-file-input"
              />
              <label htmlFor="plan-file-input" className="cursor-pointer flex flex-col items-center w-full">
                {isProcessingPdf ? (
                  <div className="flex flex-col items-center py-4 space-y-2">
                    <Loader2 className="w-10 h-10 text-sky-400 animate-spin" />
                    <span className="text-sm font-bold text-sky-200">Renderizando Layout PDF en Alta Definición...</span>
                    <span className="text-[11px] text-slate-400">Procesando vectores arquitectónicos a escala {pdfScaleQuality}x ({viewBoxWidth}x{viewBoxHeight} px)</span>
                  </div>
                ) : file ? (
                  <div className="flex items-center space-x-3 text-sky-300">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 flex-shrink-0" />
                    <div>
                      <span className="font-bold text-sm text-white block">{file.name}</span>
                      <span className="text-[11px] text-slate-400">
                        {(file.size / 1024).toFixed(1)} KB · Formato {fileType?.toUpperCase()} · ViewBox {viewBoxWidth}x{viewBoxHeight}
                        {pdfPageCount > 1 && ` · Página ${selectedPdfPage} de ${pdfPageCount}`}
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-sky-400 mb-2" />
                    <span className="text-sm font-bold text-white">Haz clic para cargar plano</span>
                    <span className="text-slate-400 text-[11px] mt-1 text-center">
                      Formatos: <strong>AutoCAD DXF</strong> (vectorial puro), <strong>PDF</strong> (Ultra HD), <strong>SVG</strong>, <strong>DWG</strong> o <strong>PNG/JPG</strong>
                    </span>
                  </>
                )}
              </label>
            </div>

            {/* ASISTENTE AUTOCAD DWG: Guía técnica de conversión en 10 segundos */}
            {fileType === 'dwg' && (
              <div className="bg-amber-950/60 border-2 border-amber-500/80 rounded-xl p-4 text-xs space-y-2.5">
                <div className="flex items-center space-x-2 text-amber-300 font-extrabold text-sm">
                  <FileCode className="w-5 h-5 text-amber-400 flex-shrink-0" />
                  <span>Archivo DWG de AutoCAD detectado: {file?.name}</span>
                </div>
                <p className="text-slate-200 leading-relaxed text-[11px]">
                  Los archivos <strong>.DWG</strong> son el formato binario propietario de Autodesk y ningún navegador web puede interpretarlos nativamente de forma interactiva.
                </p>
                <div className="bg-slate-950/80 p-3 rounded-lg border border-amber-600/40 space-y-2">
                  <span className="font-bold text-white block text-xs">🚀 Cómo obtener Resolución Vectorial Infinita en 10 segundos:</span>
                  <div className="space-y-2 text-slate-300 text-[11px]">
                    <div className="p-2 bg-slate-900 rounded border border-slate-800">
                      <strong className="text-amber-300 block mb-0.5">Opción A (Recomendada - Resolución Infinita sin Pixelado):</strong>
                      <span>Abre el plano en AutoCAD y escribe el comando <code className="bg-slate-800 px-1.5 py-0.5 rounded text-amber-300 font-mono font-bold">DXFOUT</code> (o <em>Guardar como...</em> formato <strong>AutoCAD DXF *.dxf</strong>). Sube ese archivo <strong>.DXF</strong> aquí y se dibujará como vectores nativos con zoom infinito.</span>
                    </div>
                    <div className="p-2 bg-slate-900 rounded border border-slate-800">
                      <strong className="text-sky-300 block mb-0.5">Opción B (PDF en Ultra Alta Definición):</strong>
                      <span>En AutoCAD pulsa <code className="bg-slate-800 px-1.5 py-0.5 rounded text-sky-300 font-mono font-bold">PLOT / Imprimir</code>, elige impresora <strong>DWG To PDF.pc3</strong>, en Propiedades de Gráficos Vectoriales selecciona <strong>1200 DPI</strong> o <strong>2400 DPI</strong>. Sube ese PDF aquí con la nitidez en <em>Ultra HD</em>.</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SELECTOR DE MODO DE RENDERIZADO PARA PDF */}
            {fileType === 'pdf' && (
              <div className="flex flex-col p-3 bg-slate-950 rounded-xl border border-sky-500/40 gap-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sky-300 flex items-center space-x-1.5">
                    <Sparkles className="w-4 h-4 text-sky-400" />
                    <span>Modo de Renderizado de PDF</span>
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                    {pdfRenderMode === 'vector' ? '⚡ 100% Vectorial (Nitidez CAD Infinita)' : `🖼️ Raster (${pdfScaleQuality}x)`}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handlePdfModeToggle('vector')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${pdfRenderMode === 'vector' ? 'bg-sky-500 text-slate-950 shadow-md font-extrabold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>⚡ Vectorial Puro (SVG - Idéntico al Visor PDF / Navegador)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePdfModeToggle('raster')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${pdfRenderMode === 'raster' ? 'bg-sky-500 text-slate-950 shadow-md font-extrabold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                  >
                    <span>🖼️ Imagen Raster</span>
                  </button>
                </div>
                {pdfRenderMode === 'raster' && (
                  <div className="flex items-center space-x-2 pt-1 border-t border-slate-800">
                    <span className="text-slate-400 text-[11px]">Calidad Raster:</span>
                    <select
                      value={pdfScaleQuality}
                      onChange={(e) => handleQualityChange(Number(e.target.value))}
                      disabled={isProcessingPdf}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-bold focus:border-sky-400 focus:outline-none"
                    >
                      <option value={2.0}>Estándar (2.0x ~3000px)</option>
                      <option value={3.5}>Alta Definición (3.5x ~5500px)</option>
                      <option value={4.5}>Ultra HD 8K (4.5x ~7500px)</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Selector de página si el PDF tiene varias páginas */}
            {fileType === 'pdf' && pdfPageCount > 1 && (
              <div className="flex items-center justify-between p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-xs">
                <span className="text-slate-400">Este PDF contiene <strong>{pdfPageCount} páginas</strong>. Seleccionar lámina:</span>
                <div className="flex space-x-1.5">
                  {Array.from({ length: Math.min(6, pdfPageCount) }, (_, i) => i + 1).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handlePageChange(p)}
                      className={`px-2.5 py-1 rounded font-bold font-mono text-xs ${
                        selectedPdfPage === p ? 'bg-sky-500 text-black' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      Pág {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Herramienta de Rotación para corregir orientación del Layout */}
            {file && fileType !== 'dwg' && (
              <div className="flex flex-col sm:flex-row items-center justify-between p-3.5 bg-amber-950/40 rounded-xl border-2 border-amber-500/70 text-xs gap-3">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 flex-shrink-0">
                    <RotateCw className="w-5 h-5 animate-spin-slow" />
                  </div>
                  <div>
                    <span className="font-extrabold text-amber-300 block">¿El plano vino apaisado o desorientado?</span>
                    <span className="text-slate-300 text-[11px]">
                      Gira el plano en pasos de 90° para que el norte y las naves queden en la posición correcta antes de colocar zonas.
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleRotatePreviewCcw}
                    disabled={isProcessingPdf}
                    className="flex-1 sm:flex-initial px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/40 rounded-lg font-bold flex items-center justify-center space-x-1 transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>-90°</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRotatePreviewCw}
                    disabled={isProcessingPdf}
                    className="flex-1 sm:flex-initial px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black rounded-lg font-black flex items-center justify-center space-x-1 shadow-md transition"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>+90° Giro Horario</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 2. Asignación de Área o Nave */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-300 uppercase tracking-wider block">
                2. Asignación de Área o Nave
              </label>
              {areas.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsCreatingNewArea(!isCreatingNewArea)}
                  className="text-sky-400 hover:text-sky-300 underline font-semibold"
                >
                  {isCreatingNewArea ? "Seleccionar Área Existente" : "+ Crear Nueva Área"}
                </button>
              )}
            </div>

            {!isCreatingNewArea && areas.length > 0 ? (
              <div>
                <select
                  value={selectedAreaId}
                  onChange={(e) => setSelectedAreaId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-medium focus:border-sky-400 focus:outline-none"
                >
                  {areas.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.codigo} - {a.nombre} {a.ubicacion_tecnica_erp ? `(${a.ubicacion_tecnica_erp})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 block mb-1">Código de Área *</label>
                    <input
                      type="text"
                      placeholder="EJ: NAVE-01, SECTOR-A, CALDERAS..."
                      value={newAreaCodigo}
                      onChange={(e) => setNewAreaCodigo(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono uppercase focus:border-sky-400 focus:outline-none"
                      required={isCreatingNewArea}
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Nombre Completo de Área *</label>
                    <input
                      type="text"
                      placeholder="Ej: Nave de Laminación y Calderería"
                      value={newAreaNombre}
                      onChange={(e) => setNewAreaNombre(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:border-sky-400 focus:outline-none"
                      required={isCreatingNewArea}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 block mb-1">Ubicación Técnica ERP / SAP</label>
                    <input
                      type="text"
                      placeholder="EJ: PLT-NV1-LAM"
                      value={newAreaUbicacionERP}
                      onChange={(e) => setNewAreaUbicacionERP(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-sky-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Descripción Breve</label>
                    <input
                      type="text"
                      placeholder="Ej: Nivel +0.00 a +12.00 con puente grúa"
                      value={newAreaDescripcion}
                      onChange={(e) => setNewAreaDescripcion(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:border-sky-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 3. Título del Plano y Tipo */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <label className="font-bold text-slate-300 uppercase tracking-wider block">
              3. Título del Plano y Dimensiones ViewBox
            </label>

            <div>
              <label className="text-slate-400 block mb-1">Título Descriptivo del Plano *</label>
              <input
                type="text"
                placeholder="Ej: Layout General Planta Baja, Isométrico Parral Vapor..."
                value={tituloPlano}
                onChange={(e) => setTituloPlano(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-medium focus:border-sky-400 focus:outline-none"
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-slate-400 block mb-1">Tipo de Plano</label>
                <select
                  value={tipoPlano}
                  onChange={(e) => setTipoPlano(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-medium focus:border-sky-400 focus:outline-none"
                >
                  <option value="layout_general">🗺️ Layout General (Planta)</option>
                  <option value="area_detalle">🏢 Plano de Detalle de Nave</option>
                  <option value="elevacion_isometrico">📐 Elevación / Isométrico</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Ancho ViewBox (px)</label>
                <input
                  type="number"
                  value={viewBoxWidth}
                  onChange={(e) => setViewBoxWidth(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Alto ViewBox (px)</label>
                <input
                  type="number"
                  value={viewBoxHeight}
                  onChange={(e) => setViewBoxHeight(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* Botones de Acción */}
          <div className="pt-4 flex items-center justify-end space-x-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || fileType === 'dwg'}
              className="px-5 py-2.5 bg-sky-500 hover:bg-sky-400 text-black font-extrabold rounded-lg shadow-lg transition flex items-center space-x-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Procesando...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Guardar e Iniciar Relevamiento</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
