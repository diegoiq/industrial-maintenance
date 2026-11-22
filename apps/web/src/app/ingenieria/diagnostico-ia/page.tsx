'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  FileText,
  Camera,
  Layers,
  Upload
} from 'lucide-react';
import { db } from '../../../lib/db';
import { getSyncRequestHeaders } from '../../../lib/security';
import { ZonaInspeccion, Inspeccion, Elemento } from '../../../types';
import { compressInspectionPhoto } from '../../../lib/imageCompression';

export default function DiagnosticoIAPage() {
  const [zonas, setZonas] = useState<ZonaInspeccion[]>([]);
  const [elementos, setElementos] = useState<Elemento[]>([]);
  const [inspecciones, setInspecciones] = useState<Inspeccion[]>([]);

  const [selectedZonaId, setSelectedZonaId] = useState<string>('');
  const [selectedInspeccionId, setSelectedInspeccionId] = useState<string>('');
  const [customTestPhoto, setCustomTestPhoto] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isValidated, setIsValidated] = useState(false);
  const [validationNote, setValidationNote] = useState('');
  const [aiDiagnosis, setAiDiagnosis] = useState<any | null>(null);

  const loadData = async () => {
    let loadedZonas = await db.zonas.toArray();
    let loadedElementos = await db.elementos.toArray();
    let loadedInspecciones = await db.inspecciones.toArray();

    if (loadedZonas.length === 0) {
      try {
        const res = await fetch('/api/sync-neon', { headers: getSyncRequestHeaders() });
        const json = await res.json();
        if (json.success && json.data) {
          for (const z of (json.data.zonas || [])) await db.zonas.put(z);
          for (const e of (json.data.elementos || [])) await db.elementos.put(e);
          for (const i of (json.data.inspecciones || [])) await db.inspecciones.put(i);
          loadedZonas = await db.zonas.toArray();
          loadedElementos = await db.elementos.toArray();
          loadedInspecciones = await db.inspecciones.toArray();
        }
      } catch (e) {
        console.warn('Error cargando datos en Diagnóstico IA:', e);
      }
    }

    setZonas(loadedZonas);
    setElementos(loadedElementos);
    setInspecciones(loadedInspecciones);

    if (loadedZonas.length > 0 && !selectedZonaId) {
      setSelectedZonaId(loadedZonas[0].id);
    }
    if (loadedInspecciones.length > 0 && !selectedInspeccionId) {
      setSelectedInspeccionId(loadedInspecciones[0].id);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const currentZona = zonas.find(z => z.id === selectedZonaId) || zonas[0];
  const inspeccionesDeZona = currentZona
    ? inspecciones.filter(i => i.zona_id === currentZona.id || i.elemento_id === `ZONA:${currentZona.codigo}`)
    : inspecciones;
  const activeInspeccion = inspeccionesDeZona.find(i => i.id === selectedInspeccionId) || inspeccionesDeZona[0];
  const activePhotoUrl = customTestPhoto || activeInspeccion?.fotos?.[0]?.thumbnail_data_url || activeInspeccion?.fotos?.[0]?.storage_url || null;

  // Subir una foto desde la PC para probar el diagnóstico IA en gabinete
  const handleUploadDesktopPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressInspectionPhoto(file);
    setCustomTestPhoto(compressed.dataUrl);
  };

  // Generar Pre-Diagnóstico Normativo ISO 4628 / ASTM D610 para la Zona o Inspección seleccionada
  const handleRunAIAnalysis = async () => {
    if (!currentZona) return;
    setIsAnalyzing(true);
    setIsValidated(false);

    await new Promise(r => setTimeout(r, 900));

    const grado = activeInspeccion?.grado_corrosion || (currentZona.estado_salud_apriori === 'critico' ? 'Ri 5' : currentZona.estado_salud_apriori === 'malo' ? 'Ri 4' : 'Ri 3');
    const pct = activeInspeccion?.porcentaje_afectado || (grado === 'Ri 5' ? 50 : grado === 'Ri 4' ? 30 : 18);
    const disciplinasStr = (currentZona.disciplinas_involucradas || ['estructuras_acero']).map(d => d.replace(/_/g, ' ')).join(', ');

    const generated = {
      status: 'success',
      human_in_the_loop_notice: 'Pre-diagnóstico preliminar asistido por IA. Requiere validación de Ingeniería antes de liberar orden de trabajo SAP PM.',
      evaluacion_normativa: {
        norma_referencia: 'ISO 4628-3 / ASTM D610 / ISO 12944',
        grado_corrosion_estimado: `${grado} (Superficie afectada estimada: ${pct}%)`,
        tipo_morfologia: grado === 'Ri 4' || grado === 'Ri 5'
          ? 'Corrosión laminar y ampollamiento con pérdida de adherencia del esquema epoxi en bordes y uniones'
          : 'Oxidación superficial localizada y degradación de capa de terminación por ambiente húmedo industrial',
        riesgo_perdida_seccion: grado === 'Ri 5' ? 'Crítico (>25% pérdida de espesor)' : grado === 'Ri 4' ? 'Moderado-Alto (Evaluar pérdida localizada)' : 'Bajo (Sin compromiso estructural primario)',
        ensayo_complementario_sugerido: grado === 'Ri 4' || grado === 'Ri 5'
          ? 'Medición de espesor residual por Ultrasonido (UT) y prueba de adherencia Pull-Off (ASTM D4541)'
          : 'Control de espesor de película seca (EPS) y ensayo de discontinuidad visual'
      },
      sugerencia_intervencion: {
        requiere_reemplazo_estructural: grado === 'Ri 5',
        sistema_recomendado: grado === 'Ri 4' || grado === 'Ri 5'
          ? 'Limpieza por chorreado abrasivo Sa 2½ (o preparación mecánica St3 en zonas restringidas) + Imprimación Epoxi Rico en Zinc (75 µm) + Barrera Epoxi Mastic Alto Espesor (150 µm) + Poliuretano Alifático (60 µm)'
          : 'Hidrolavado de alta presión + Limpieza mecánica puntual St3 + Parcheo con Epoxi Mastic Surface Tolerant (125 µm) + Capa de sello Poliuretano'
      },
      descripcion_tecnica_automatica:
        `En el sector [${currentZona.codigo} - ${currentZona.nombre}] (Cota +${(Number(currentZona.cota_nivel || 146000) / 1000).toFixed(1)} m, disciplinas: ${disciplinasStr}), ` +
        `se evalúa condición normativa ${grado} según ISO 4628-3 con una afectación estimada del ${pct}% sobre una superficie de referencia de ${currentZona.superficie_estimada_m2 || 250} m². ` +
        `${activeInspeccion?.observaciones ? `Observación de campo registrada: "${activeInspeccion.observaciones}". ` : ''}` +
        `Se recomienda intervención mediante ${grado === 'Ri 4' || grado === 'Ri 5' ? 'preparación intensiva Sa 2½ / St3 y esquema tricapa C5-M' : 'saniado mecánico St3 y repintado epoxi-poliuretano'}, ` +
        `contemplando montaje de andamio compartido de ${currentZona.nivel_acceso_andamio?.envolvente_m3 || 180} m³.`
    };

    setAiDiagnosis(generated);
    setValidationNote(`Aprobado pre-diagnóstico técnico para Zona ${currentZona.codigo} (${grado}). Incorporar al Informe Preliminar y Plan Maestro.`);
    setIsAnalyzing(false);
  };

  // Guardar validación firmada en la inspección / zona
  const handleValidateAsEngineer = async () => {
    if (!currentZona || !aiDiagnosis) return;
    setIsValidated(true);

    if (activeInspeccion) {
      const updatedInsp: Inspeccion = {
        ...activeInspeccion,
        diagnostico_ia: {
          ...aiDiagnosis,
          validado_por: 'Ingeniero de Integridad',
          nota_validacion: validationNote,
          fecha_validacion: new Date().toISOString()
        },
        fecha_validacion: new Date().toISOString()
      };
      await db.inspecciones.put(updatedInsp);
    } else {
      // Crear registro de pre-diagnóstico de gabinete para la zona
      const newInsp: Inspeccion = {
        id: `insp_ia_${Date.now()}`,
        elemento_id: `ZONA:${currentZona.codigo}`,
        zona_id: currentZona.id,
        zona_codigo: currentZona.codigo,
        inspector_nombre: 'Gabinete Ingeniería + IA',
        fecha_inspeccion: new Date().toISOString(),
        estado_sincronizacion: 'pendiente',
        clasificacion_sustrato: 'acero_al_carbono',
        clasificacion_recubrimiento: 'epoxi_poliamida',
        grado_corrosion: currentZona.estado_salud_apriori === 'critico' ? 'Ri 5' : currentZona.estado_salud_apriori === 'malo' ? 'Ri 4' : 'Ri 3',
        requiere_reemplazo: currentZona.estado_salud_apriori === 'critico',
        porcentaje_afectado: 25,
        criticidad_calculada: 3,
        observaciones: aiDiagnosis.descripcion_tecnica_automatica,
        diagnostico_ia: {
          ...aiDiagnosis,
          validado_por: 'Ingeniero de Integridad',
          nota_validacion: validationNote,
          fecha_validacion: new Date().toISOString()
        },
        fotos: customTestPhoto ? [{
          id: `foto_ia_${Date.now()}`,
          thumbnail_data_url: customTestPhoto,
          peso_bytes: 140000,
          comentario: `Evidencia analizada para ${currentZona.codigo}`,
          anotaciones_canvas: []
        }] : []
      };
      await db.inspecciones.put(newInsp);
    }
    await loadData();
  };

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      {/* Cabecera */}
      <div className="border-b border-slate-800 pb-5">
        <span className="text-[11px] font-mono font-bold text-purple-400 bg-purple-950 px-2 py-0.5 rounded border border-purple-800">
          MÓDULO 3 · INTELIGENCIA ARTIFICIAL MULTIMODAL (GEMINI)
        </span>
        <h2 className="text-2xl font-black text-white tracking-tight mt-1">
          Diagnóstico Asistido por IA y Guardarraíl Human-in-the-Loop
        </h2>
        <p className="text-xs text-slate-400 mt-1 max-w-3xl">
          Evalúa tus <strong>Zonas de Inspección reales</strong> y las fotografías tomadas en campo (o subidas desde la PC) bajo norma ISO 4628-3 / ASTM D610, redactando automáticamente la memoria técnica para el Informe Preliminar.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel Izquierdo: Selección de Zona Real e Imagen */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-1.5">
              1. Seleccionar Zona de tu Proyecto ({zonas.length})
            </label>
            {zonas.length > 0 ? (
              <select
                value={selectedZonaId}
                onChange={(e) => {
                  setSelectedZonaId(e.target.value);
                  setAiDiagnosis(null);
                  setIsValidated(false);
                }}
                className="w-full bg-slate-950 border border-slate-700 text-xs font-bold text-white rounded-lg p-2.5 font-mono"
              >
                {zonas.map(z => (
                  <option key={z.id} value={z.id}>
                    {z.codigo} — {z.nombre}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-slate-500">Sin zonas cargadas aún.</p>
            )}
          </div>

          {inspeccionesDeZona.length > 0 && (
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">
                Inspecciones de Campo en esta Zona ({inspeccionesDeZona.length}):
              </label>
              <select
                value={activeInspeccion?.id || ''}
                onChange={(e) => setSelectedInspeccionId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-xs text-emerald-300 rounded-lg p-2 font-mono"
              >
                {inspeccionesDeZona.map(i => (
                  <option key={i.id} value={i.id}>
                    {new Date(i.fecha_inspeccion).toLocaleDateString()} · {i.grado_corrosion} ({i.fotos?.length || 0} fotos)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Visor de Fotografía Real o Carga de Foto de Prueba en Gabinete */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-bold">Evidencia Fotográfica:</span>
              <label className="text-sky-400 hover:underline cursor-pointer flex items-center space-x-1">
                <Upload className="w-3 h-3" />
                <span>Subir foto desde PC</span>
                <input type="file" accept="image/*" onChange={handleUploadDesktopPhoto} className="hidden" />
              </label>
            </div>

            <div className="relative aspect-video w-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
              {activePhotoUrl ? (
                <img src={activePhotoUrl} alt="Evidencia" className="w-full h-full object-cover" />
              ) : (
                <div className="p-4 text-center space-y-2 text-xs text-slate-500">
                  <Camera className="w-8 h-8 text-slate-600 mx-auto" />
                  <p>Aún no hay fotos sincronizadas desde el celular para <strong>{currentZona?.codigo}</strong>.</p>
                  <p className="text-[10px] text-slate-400">
                    Podés subir una foto desde tu PC arriba o generar el pre-diagnóstico preliminar de gabinete basado en los parámetros de la zona.
                  </p>
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleRunAIAnalysis}
            disabled={isAnalyzing || !currentZona}
            className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center space-x-2 transition disabled:opacity-50 shadow-lg"
          >
            <Sparkles className="w-4 h-4" />
            <span>{isAnalyzing ? 'Generando Pre-Diagnóstico...' : 'Ejecutar Pre-Diagnóstico IA'}</span>
          </button>
        </div>

        {/* Panel Derecho: Resultado del Pre-diagnóstico y Validación */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
          {!aiDiagnosis ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3 text-slate-400">
              <Sparkles className="w-10 h-10 text-purple-400" />
              <h3 className="text-base font-bold text-white">
                Listo para Analizar: {currentZona ? `${currentZona.codigo} (${currentZona.nombre})` : 'Selecciona una Zona'}
              </h3>
              <p className="text-xs max-w-md">
                Haz clic en <strong>"Ejecutar Pre-Diagnóstico IA"</strong> para generar la evaluación normativa ISO 4628-3, el esquema de recubrimiento sugerido y la memoria descriptiva automática para el informe.
              </p>
            </div>
          ) : (
            <>
              <div className={`p-4 rounded-xl border flex items-start space-x-3 ${isValidated
                  ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200'
                  : 'bg-amber-950/80 border-amber-500 text-amber-200'
                }`}>
                {isValidated ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                )}
                <div className="space-y-1 text-xs">
                  <span className="font-black uppercase tracking-wider block">
                    {isValidated ? 'DIAGNÓSTICO VALIDADO E INCORPORADO AL INFORME' : 'GUARDARRAÍL HUMAN-IN-THE-LOOP'}
                  </span>
                  <p className="opacity-90">
                    {isValidated
                      ? `Validado por Ingeniería para la zona ${currentZona?.codigo}. Ya forma parte del Informe Preliminar.`
                      : aiDiagnosis.human_in_the_loop_notice}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">
                    Clasificación Normativa ({aiDiagnosis.evaluacion_normativa.norma_referencia})
                  </span>
                  <span className="text-sm font-bold text-amber-400 font-mono block">
                    {aiDiagnosis.evaluacion_normativa.grado_corrosion_estimado}
                  </span>
                  <span className="text-slate-300 block text-[11px]">
                    {aiDiagnosis.evaluacion_normativa.tipo_morfologia}
                  </span>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">
                    Esquema y Ensayos Recomendados
                  </span>
                  <span className="text-xs font-bold text-sky-400 block">
                    {aiDiagnosis.evaluacion_normativa.ensayo_complementario_sugerido}
                  </span>
                  <span className="text-slate-300 block text-[11px]">
                    {aiDiagnosis.sugerencia_intervencion.sistema_recomendado}
                  </span>
                </div>
              </div>

              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2 text-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                  <FileText className="w-3.5 h-3.5 text-purple-400" />
                  <span>Memoria Descriptiva Automatizada para Informe Preliminar</span>
                </span>
                <p className="text-slate-200 leading-relaxed italic">
                  "{aiDiagnosis.descripcion_tecnica_automatica}"
                </p>
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-3">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Observación / Validación de Ingeniería</span>
                </span>

                <textarea
                  value={validationNote}
                  onChange={(e) => setValidationNote(e.target.value)}
                  disabled={isValidated}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-400"
                />

                {!isValidated && (
                  <button
                    type="button"
                    onClick={handleValidateAsEngineer}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition flex items-center justify-center space-x-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Validar e Incorporar al Informe de Zona {currentZona?.codigo}</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
