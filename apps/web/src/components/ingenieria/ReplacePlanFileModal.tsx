'use client';

import React, { useState } from 'react';
import { RefreshCw, X, CheckCircle2, AlertCircle, FileCode, Sparkles, Loader2, Upload } from 'lucide-react';
import { Plano } from '../../types';
import { convertPdfPageToImage, convertPdfPageToSvg } from '../../lib/pdfRenderer';
import { parseDxfToSvg } from '../../lib/dxfParser';
import { sanitizeSvgContent } from '../../lib/security';
import { db } from '../../lib/db';

interface ReplacePlanFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlano?: Plano;
  onPlanReplaced: (updatedPlano: Plano) => void;
}

export const ReplacePlanFileModal: React.FC<ReplacePlanFileModalProps> = ({
  isOpen,
  onClose,
  currentPlano,
  onPlanReplaced
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [fileType, setFileType] = useState<'svg' | 'image' | 'dxf' | 'dwg' | 'pdf' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pdfRenderMode, setPdfRenderMode] = useState<'vector' | 'raster'>('vector');
  const [pdfScaleQuality, setPdfScaleQuality] = useState<number>(3.5);

  const [viewBoxWidth, setViewBoxWidth] = useState<number>(currentPlano?.dimensiones_viewbox?.width || 1600);
  const [viewBoxHeight, setViewBoxHeight] = useState<number>(currentPlano?.dimensiones_viewbox?.height || 900);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !currentPlano) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setErrorMessage(null);
    const fname = selected.name.toLowerCase();

    // 1. Archivo DWG
    if (fname.endsWith('.dwg')) {
      setFileType('dwg');
      setFilePreview(null);
      setSvgContent(null);
      return;
    }

    // 2. Archivo DXF (AutoCAD Vectorial Puro)
    if (fname.endsWith('.dxf')) {
      setFileType('dxf');
      setIsProcessing(true);
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = reader.result as string;
          const parsed = parseDxfToSvg(text);
          setSvgContent(parsed.svgContent);
          setFilePreview(parsed.svgContent);
          setViewBoxWidth(parsed.width);
          setViewBoxHeight(parsed.height);
        } catch (err: any) {
          setErrorMessage("Error al convertir archivo DXF: " + err?.message);
        } finally {
          setIsProcessing(false);
        }
      };
      reader.readAsText(selected);
    } 
    // 3. Archivo PDF (Soporte Vectorial Puro SVG o Raster)
    else if (fname.endsWith('.pdf') || selected.type === 'application/pdf') {
      setFileType('pdf');
      setIsProcessing(true);
      try {
        if (pdfRenderMode === 'vector') {
          const renderedSvg = await convertPdfPageToSvg(selected, 1);
          setSvgContent(renderedSvg.svgContent);
          setFilePreview(renderedSvg.svgContent);
          setViewBoxWidth(renderedSvg.width);
          setViewBoxHeight(renderedSvg.height);
        } else {
          const rendered = await convertPdfPageToImage(selected, 1, pdfScaleQuality);
          setFilePreview(rendered.dataUrl);
          setSvgContent(null);
          setViewBoxWidth(rendered.width);
          setViewBoxHeight(rendered.height);
        }
      } catch (err: any) {
        console.warn("Fallo conversión vectorial SVG, reintentando raster:", err);
        try {
          const rendered = await convertPdfPageToImage(selected, 1, pdfScaleQuality);
          setFilePreview(rendered.dataUrl);
          setSvgContent(null);
          setViewBoxWidth(rendered.width);
          setViewBoxHeight(rendered.height);
          setPdfRenderMode('raster');
        } catch (rasterErr: any) {
          setErrorMessage("Error al procesar PDF: " + rasterErr?.message);
        }
      } finally {
        setIsProcessing(false);
      }
    } 
    // 4. SVG
    else if (fname.endsWith('.svg')) {
      setFileType('svg');
      const reader = new FileReader();
      reader.onload = () => {
        const rawText = reader.result as string;
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
          }
        }
      };
      reader.readAsText(selected);
    } 
    // 5. Imagen
    else {
      setFileType('image');
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
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

  const handlePdfModeToggle = async (mode: 'vector' | 'raster') => {
    setPdfRenderMode(mode);
    if (!file || fileType !== 'pdf') return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      if (mode === 'vector') {
        const renderedSvg = await convertPdfPageToSvg(file, 1);
        setSvgContent(renderedSvg.svgContent);
        setFilePreview(renderedSvg.svgContent);
        setViewBoxWidth(renderedSvg.width);
        setViewBoxHeight(renderedSvg.height);
      } else {
        const rendered = await convertPdfPageToImage(file, 1, pdfScaleQuality);
        setFilePreview(rendered.dataUrl);
        setSvgContent(null);
        setViewBoxWidth(rendered.width);
        setViewBoxHeight(rendered.height);
      }
    } catch (err: any) {
      setErrorMessage("Error al cambiar modo de renderizado: " + err?.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveReplacement = async (e: React.FormEvent) => {
    e.preventDefault();

    if (fileType === 'dwg') {
      setErrorMessage("Los archivos .DWG deben ser exportados a formato .DXF en AutoCAD antes de subir.");
      return;
    }

    if (!file && !filePreview) {
      setErrorMessage("Por favor selecciona el nuevo archivo .DXF, .SVG o .PDF.");
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const isVector = fileType === 'svg' || fileType === 'dxf' || (fileType === 'pdf' && !!svgContent);
      const updatedPlano: Plano = {
        ...currentPlano,
        svg_content: isVector ? (svgContent || undefined) : undefined,
        archivo_data_url: (!isVector && filePreview) ? filePreview : undefined,
        dimensiones_viewbox: {
          width: viewBoxWidth,
          height: viewBoxHeight
        },
        version: (currentPlano.version || 1) + 1
      };

      await db.planos.put(updatedPlano);
      onPlanReplaced(updatedPlano);
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMessage("Error al actualizar el archivo del plano: " + err?.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-xl bg-slate-900 border-2 border-sky-500 rounded-2xl overflow-hidden shadow-2xl flex flex-col my-8">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700">
          <div className="flex items-center space-x-2.5">
            <RefreshCw className="w-5 h-5 text-sky-400" />
            <div>
              <h3 className="text-base font-bold text-white">Reemplazar Archivo del Plano Actual</h3>
              <span className="text-xs text-sky-300 font-mono">{currentPlano.titulo}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSaveReplacement} className="p-6 space-y-4 text-xs">
          {/* Banner Explicativo de Seguridad */}
          <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-3 flex items-start space-x-2.5 text-[11px] text-emerald-200">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-extrabold text-white block">Tus Zonas y Pines están 100% protegidos</span>
              <p className="text-slate-300">
                Al reemplazar el plano por el nuevo <strong>.DXF o PDF Ultra HD</strong>, la geometría de tus zonas delimitadas (como <em>EDIFICIO EFLUENTES</em>) y todos tus pines de activos <strong>se conservan intactos</strong> sobre el nuevo plano nítido.
              </p>
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 bg-red-950/80 border border-red-500/50 rounded-lg text-red-300 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Selector de Archivo */}
          <div className="space-y-2">
            <label className="font-bold text-slate-300 uppercase tracking-wider block">
              Seleccionar nuevo archivo CAD (.DXF, SVG o PDF)
            </label>
            <div className="border-2 border-dashed border-slate-700 hover:border-sky-400 rounded-xl p-6 bg-slate-950 flex flex-col items-center justify-center cursor-pointer transition">
              <input
                type="file"
                accept=".dxf,.svg,.pdf,.dwg,.png,.jpg,.jpeg,.webp"
                onChange={handleFileChange}
                className="hidden"
                id="replace-file-input"
              />
              <label htmlFor="replace-file-input" className="cursor-pointer flex flex-col items-center w-full">
                {isProcessing ? (
                  <div className="flex flex-col items-center py-4 space-y-2">
                    <Loader2 className="w-10 h-10 text-sky-400 animate-spin" />
                    <span className="text-sm font-bold text-sky-200">Procesando y convirtiendo entidades...</span>
                  </div>
                ) : file ? (
                  <div className="flex items-center space-x-3 text-sky-300">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 flex-shrink-0" />
                    <div>
                      <span className="font-bold text-sm text-white block">{file.name}</span>
                      <span className="text-[11px] text-slate-400">
                        {(file.size / 1024).toFixed(1)} KB · Formato {fileType?.toUpperCase()} · ViewBox {viewBoxWidth}x{viewBoxHeight}
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-sky-400 mb-2" />
                    <span className="text-sm font-bold text-white">Haz clic para seleccionar el archivo .DXF</span>
                    <span className="text-slate-400 text-[11px] mt-1 text-center">
                      Recomendado: <strong>AutoCAD DXF (*.dxf)</strong> para resolución vectorial infinita
                    </span>
                  </>
                )}
              </label>
            </div>
          </div>

          {/* Opciones PDF: Modo Vectorial vs Raster */}
          {fileType === 'pdf' && (
            <div className="bg-sky-950/40 border border-sky-500/40 rounded-xl p-4 text-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sky-300 flex items-center space-x-1.5">
                  <Sparkles className="w-4 h-4 text-sky-400" />
                  <span>Modo de Renderizado de PDF</span>
                </span>
                <span className="text-[10px] text-emerald-400 font-mono font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                  {pdfRenderMode === 'vector' ? '⚡ 100% Vectorial (Nitidez CAD Infinita)' : '🖼️ Raster Canvas'}
                </span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                {pdfRenderMode === 'vector'
                  ? 'Convierte el PDF directamente a entidades vectoriales SVG nativas. Permite zoom infinito sin pixelación de textos ni líneas, idéntico a abrir el PDF en el navegador o AutoCAD.'
                  : 'Renderiza una imagen estática bitmap (puede pixelarse al hacer zoom profundo en áreas pequeñas).'}
              </p>
              <div className="flex items-center space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => handlePdfModeToggle('vector')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${pdfRenderMode === 'vector' ? 'bg-sky-500 text-slate-950 shadow-md font-extrabold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>⚡ Vectorial Puro (SVG - Recomendado)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePdfModeToggle('raster')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${pdfRenderMode === 'raster' ? 'bg-sky-500 text-slate-950 shadow-md font-extrabold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                >
                  <span>🖼️ Imagen Raster</span>
                </button>
              </div>
            </div>
          )}

          {/* Asistente DWG */}
          {fileType === 'dwg' && (
            <div className="bg-amber-950/60 border-2 border-amber-500/80 rounded-xl p-4 text-xs space-y-2">
              <div className="flex items-center space-x-2 text-amber-300 font-extrabold text-sm">
                <FileCode className="w-5 h-5 text-amber-400 flex-shrink-0" />
                <span>Archivo DWG detectado: {file?.name}</span>
              </div>
              <p className="text-slate-200 text-[11px]">
                AutoCAD DWG es binario cerrado. Para usarlo: en AutoCAD escribe el comando <code className="bg-slate-800 px-1.5 py-0.5 rounded text-amber-300 font-mono font-bold">DXFOUT</code> y sube el archivo <strong>.DXF</strong> generado.
              </p>
            </div>
          )}

          {/* Botones */}
          <div className="pt-4 flex items-center justify-end space-x-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isProcessing || !file || fileType === 'dwg'}
              className="px-5 py-2.5 bg-sky-500 hover:bg-sky-400 text-black font-extrabold rounded-lg shadow-lg transition flex items-center space-x-2 disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Actualizando...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Reemplazar y Actualizar Plano</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
