'use client';

import React, { useState } from 'react';
import { 
  Sparkles, 
  ShieldCheck, 
  AlertCircle, 
  History, 
  CheckCircle2, 
  ArrowRight, 
  Layers, 
  HardHat, 
  Scale, 
  Calendar,
  FileCheck,
  Eye,
  FileText
} from 'lucide-react';
import { INITIAL_ELEMENTOS } from '../../../lib/mockData';
import { Elemento } from '../../../types';

export default function DiagnosticoIAPage() {
  const [selectedTag, setSelectedTag] = useState<string>('131-COL-01');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiDiagnosis, setAiDiagnosis] = useState<any | null>({
    status: "success",
    human_in_the_loop_notice: "Pre-diagnóstico preliminar asistido por IA. Requiere validación obligatoria por Ingeniero antes de emitir orden de intervención.",
    evaluacion_normativa: {
      norma_referencia: "ISO 4628-3 / ASTM D610",
      grado_corrosion_estimado: "Ri 4 (Afectación 8% a 15% con óxido penetrante)",
      tipo_morfologia: "Corrosión galvánica y laminar activa en ala inferior y unión abulonada de apoyo",
      riesgo_perdida_seccion: "Severo (>25% de pérdida de ala inferior en pie de columna)",
      ensayo_complementario_sugerido: "Medición de espesores residuales por Ultrasonido (UT) en nudo crítico"
    },
    sugerencia_intervencion: {
      requiere_reemplazo_estructural: true,
      sistema_recomendado: "Reemplazo de tramo inferior (1.20 m) con cartelas de refuerzo + Arenado Sa 2 1/2 + Imprimación Epoxi Zinc + Esmalte Poliuretano",
      urgencia_intervencion: "Inmediato en próxima parada de planta (P1)"
    },
    descripcion_tecnica_automatica: (
      "Se detecta severa corrosión laminar con desprendimiento total del sistema de pintura en la base de la columna " +
      "131-COL-01, provocada por acumulación de condensados y vapores de efluentes. Espesor residual estimado comprometido. " +
      "Se aconseja ensayo no destructivo por ultrasonido previo a maniobra de reemplazo con apeo temporal."
    )
  });

  const [isValidated, setIsValidated] = useState(false);
  const [validationNote, setValidationNote] = useState('Valido hallazgo de desprendimiento y corrosión en pie de columna. Se aprueba reemplazo en Parada 2026.');

  // Comparador Histórico: Inspección 2024 vs 2025/2026
  const historialComparativo = {
    anterior: {
      fecha: '15 de Mayo de 2024',
      grado: 'Ri 2 (Puntos aislados ~0.5%)',
      espesor_nominal_mm: 14.2,
      espesor_medido_mm: 13.8,
      observaciones: 'Pérdida de brillo en recubrimiento y óxido superficial en ala externa. Sin riesgo inmediato.'
    },
    actual: {
      fecha: '18 de Noviembre de 2025',
      grado: 'Ri 4 (Oxidación laminar ~15%)',
      espesor_nominal_mm: 14.2,
      espesor_medido_mm: 10.4,
      observaciones: 'Aceleración drástica por fuga de vapor ácido adyacente. Pérdida de 3.4 mm de sección resistente.'
    },
    velocidad_corrosion_mm_anio: 2.26, // mm/año
    vida_util_remanente_meses: 8
  };

  const handleRunAIAnalysis = async () => {
    setIsAnalyzing(true);
    setIsValidated(false);
    try {
      const apiEngineUrl = process.env.NEXT_PUBLIC_API_ENGINE_URL || 'http://localhost:8000';
      const res = await fetch(`${apiEngineUrl}/api/v1/ai/analyze-corrosion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sustrato: 'acero_al_carbono',
          recubrimiento_existente: 'epoxi_poliamida',
          descripcion_campo: 'Base de columna con óxido y desprendimiento'
        })
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json();
        setAiDiagnosis(data);
      }
    } catch {
      // Fallback
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleValidateAsEngineer = () => {
    setIsValidated(true);
  };

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      {/* Cabecera */}
      <div className="border-b border-slate-800 pb-5">
        <span className="text-[11px] font-mono font-bold text-purple-400 bg-purple-950 px-2 py-0.5 rounded border border-purple-800">
          MÓDULO 3 · INTELIGENCIA ARTIFICIAL MULTIMODAL (GEMINI)
        </span>
        <h2 className="text-2xl font-black text-white tracking-tight mt-1 flex items-center space-x-2">
          <span>Diagnóstico Asistido por IA y Guardarraíl Human-in-the-Loop</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1 max-w-3xl">
          Análisis de imágenes de corrosión bajo estándares ISO 4628 / ASTM D610 con guardarraíl estricto: la IA emite exclusivamente pre-diagnósticos preliminares y el sistema bloquea órdenes de reemplazo hasta la validación firmada de un Ingeniero.
        </p>
      </div>

      {/* Grid Principal: Diagnóstico Asistido + Guardarraíl */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel Izquierdo: Ficha y Ejecución IA */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
            Activo a Evaluar
          </span>

          <select
            value={selectedTag}
            onChange={(e) => setSelectedTag(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 text-sm font-bold text-white rounded-lg p-2.5 font-mono"
          >
            {INITIAL_ELEMENTOS.map(e => (
              <option key={e.id} value={e.tag_codigo}>
                {e.tag_codigo} - {e.geometria_parametros.perfil || e.tipo_elemento} ({e.codigo_equipo_erp || 'ERP'})
              </option>
            ))}
          </select>

          {/* Fotografía analizada con marcas vectoriales */}
          <div className="relative aspect-video w-full bg-slate-950 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
            {/* Simulación visual de foto industrial */}
            <div className="w-full h-full bg-gradient-to-tr from-slate-950 via-slate-900 to-amber-950/40 p-4 flex flex-col justify-between">
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="bg-black/80 px-2 py-0.5 rounded text-amber-400 font-bold">{selectedTag}</span>
                <span className="bg-black/80 px-2 py-0.5 rounded text-slate-300">WEBP 1600px · 184 KB</span>
              </div>

              {/* Bounding box vectorial simulada */}
              <div className="w-3/4 h-2/3 mx-auto border-2 border-dashed border-red-500 rounded bg-red-500/10 flex items-center justify-center p-2 text-center">
                <span className="text-[11px] font-bold text-red-300 bg-black/80 px-2 py-0.5 rounded">
                  Zona Crítica: Pérdida de sección en ala base
                </span>
              </div>

              <div className="text-[10px] text-slate-400 font-mono">
                Anotaciones vectoriales: 2 círculos, 1 flecha
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRunAIAnalysis}
            disabled={isAnalyzing}
            className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs uppercase tracking-wider rounded-lg flex items-center justify-center space-x-2 transition disabled:opacity-50 shadow-lg"
          >
            <Sparkles className="w-4 h-4" />
            <span>{isAnalyzing ? 'Analizando con Gemini...' : 'Re-ejecutar Análisis Multimodal'}</span>
          </button>
        </div>

        {/* Panel Central: Resultados del Pre-diagnóstico IA */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
          {/* Banner Obligatorio Human-in-the-Loop */}
          <div className={`p-4 rounded-xl border flex items-start space-x-3 ${
            isValidated 
              ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200' 
              : 'bg-amber-950/80 border-amber-500 text-amber-200'
          }`}>
            {isValidated ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5 animate-pulse" />
            )}
            <div className="space-y-1">
              <span className="text-xs font-black uppercase tracking-wider block">
                {isValidated ? 'DIAGNÓSTICO VALIDADO POR INGENIERÍA' : 'GUARDARRAÍL OBLIGATORIO: HUMAN-IN-THE-LOOP'}
              </span>
              <p className="text-xs opacity-90 leading-relaxed">
                {isValidated 
                  ? 'Aprobado formalmente por Ing. de Integridad Mecánica. Habilitada la emisión de orden de reemplazo.'
                  : aiDiagnosis?.human_in_the_loop_notice}
              </p>
            </div>
          </div>

          {/* Hallazgos Técnicos de la IA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Clasificación Normativa (ISO 4628 / ASTM D610)
              </span>
              <span className="text-base font-bold text-amber-400 font-mono block">
                {aiDiagnosis?.evaluacion_normativa?.grado_corrosion_estimado}
              </span>
              <span className="text-slate-300 block text-[11px]">
                {aiDiagnosis?.evaluacion_normativa?.tipo_morfologia}
              </span>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Ensayos Complementarios Sugeridos
              </span>
              <span className="text-sm font-bold text-sky-400 block">
                {aiDiagnosis?.evaluacion_normativa?.ensayo_complementario_sugerido}
              </span>
              <span className="text-slate-300 block text-[11px]">
                Riesgo: {aiDiagnosis?.evaluacion_normativa?.riesgo_perdida_seccion}
              </span>
            </div>
          </div>

          {/* Redacción Técnica Generada */}
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2 text-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center space-x-1.5">
              <FileText className="w-3.5 h-3.5 text-purple-400" />
              <span>Memoria Descriptiva Automatizada para Informe de Inspección</span>
            </span>
            <p className="text-slate-200 leading-relaxed font-sans text-xs italic">
              "{aiDiagnosis?.descripcion_tecnica_automatica}"
            </p>
          </div>

          {/* Formulario de Validación de Ingeniero (Human-in-the-Loop) */}
          <div className="pt-2 border-t border-slate-800 space-y-3">
            <span className="text-xs font-bold text-white uppercase tracking-wider block flex items-center space-x-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Firma y Validación de Ingeniero (Rol: ingeniero / admin)</span>
            </span>

            <textarea
              value={validationNote}
              onChange={(e) => setValidationNote(e.target.value)}
              disabled={isValidated}
              rows={2}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-400 disabled:opacity-50"
            />

            {!isValidated ? (
              <button
                type="button"
                onClick={handleValidateAsEngineer}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition flex items-center justify-center space-x-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Validar y Aprobar Pre-diagnóstico Oficialmente</span>
              </button>
            ) : (
              <div className="p-3 bg-emerald-950/70 border border-emerald-500/40 rounded-lg text-emerald-300 text-xs flex items-center justify-between">
                <span>✓ Validación registrada en <strong>auditoria_cambios</strong>.</span>
                <span className="font-mono font-bold">Ingeniero: auth-uid-01</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Comparador Histórico: Evolución Año a Año */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
            <History className="w-4 h-4 text-sky-400" />
            <span>Comparador Histórico: Velocidad de Degradación y Curva de Vida Residual</span>
          </h3>
          <span className="text-xs font-mono text-amber-400 bg-amber-950 px-2 py-0.5 rounded border border-amber-800">
            Elemento: {selectedTag}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Inspección Año Anterior (2024) */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="font-bold text-slate-400">Campaña Anterior</span>
              <span className="font-mono text-slate-300">{historialComparativo.anterior.fecha}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Grado Corrosión:</span>
              <span className="font-mono font-bold text-emerald-400">{historialComparativo.anterior.grado}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Espesor Residual Medido:</span>
              <span className="font-mono text-white font-bold">{historialComparativo.anterior.espesor_medido_mm} mm (Nominal: 14.2 mm)</span>
            </div>
            <p className="text-[11px] text-slate-400 italic pt-1">{historialComparativo.anterior.observaciones}</p>
          </div>

          {/* Inspección Actual (2025/2026) */}
          <div className="bg-slate-950 p-4 rounded-xl border border-red-500/40 space-y-2 text-xs">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="font-bold text-red-400">Campaña Actual</span>
              <span className="font-mono text-slate-300">{historialComparativo.actual.fecha}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Grado Corrosión:</span>
              <span className="font-mono font-bold text-red-400">{historialComparativo.actual.grado}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Espesor Residual Medido:</span>
              <span className="font-mono text-white font-bold">{historialComparativo.actual.espesor_medido_mm} mm (Pérdida: 3.4 mm)</span>
            </div>
            <p className="text-[11px] text-slate-400 italic pt-1">{historialComparativo.actual.observaciones}</p>
          </div>

          {/* Métricas de Velocidad y Proyección */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 text-xs flex flex-col justify-between">
            <span className="font-bold text-slate-300 block uppercase tracking-wider text-[11px]">
              Tasa de Corrosión Proyectada
            </span>

            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Velocidad de Corrosión:</span>
                <span className="font-mono font-bold text-red-400">{historialComparativo.velocidad_corrosion_mm_anio} mm/año</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Vida Útil Remanente:</span>
                <span className="font-mono font-bold text-amber-400">{historialComparativo.vida_util_remanente_meses} Meses</span>
              </div>
              <div className="flex justify-between border-t border-slate-800 pt-2 font-bold">
                <span className="text-slate-300">Conclusión Técnica:</span>
                <span className="text-red-400 uppercase">Reemplazo en Parada 2026</span>
              </div>
            </div>

            <div className="p-2.5 bg-slate-900 rounded text-[11px] text-slate-400">
              La velocidad de degradación se cuadruplicó debido a condensados en el nudo inferior.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
