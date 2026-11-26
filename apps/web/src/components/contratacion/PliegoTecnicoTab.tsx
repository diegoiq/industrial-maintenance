'use client';

import React, { useState } from 'react';
import { Printer } from 'lucide-react';
import { Inspeccion, ZonaInspeccion } from '../../types';
import { TarifarioIntervencion } from '../../types/computo';
import { calcularPaqueteZona, getEffectiveAccesos } from '../../lib/computoEngine';

interface PliegoTecnicoTabProps {
  inspecciones: Inspeccion[];
  zonasById: Record<string, ZonaInspeccion>;
  tarifario: TarifarioIntervencion;
}

export function PliegoTecnicoTab({
  inspecciones,
  zonasById,
  tarifario
}: PliegoTecnicoTabProps) {
  const [mostrarPrecios, setMostrarPrecios] = useState(false);

  const handlePrint = (conPrecios: boolean) => {
    setMostrarPrecios(conPrecios);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  return (
    <div className="space-y-4">
      {/* Barra de impresión (oculta al imprimir) */}
      <div className="print:hidden bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-white">
            Pliego Técnico por Frente de Acceso (Secuencia Constructiva Obligatoria)
          </h3>
          <p className="text-xs text-slate-400">
            Orden técnico automático: 1° Civil / Hormigón → 2° Calderería / Metálico → 3° Preparación y Pintura.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handlePrint(false)}
            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs flex items-center space-x-1.5"
          >
            <Printer className="w-4 h-4" />
            <span>🖨️ Imprimir / PDF Pliego Técnico (Sin Precios)</span>
          </button>
          <button
            type="button"
            onClick={() => handlePrint(true)}
            className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center space-x-1.5"
          >
            <Printer className="w-4 h-4" />
            <span>🖨️ Imprimir Resumen Ejecutivo (Con Precios)</span>
          </button>
        </div>
      </div>

      {/* Fichas por Frente */}
      <div className="space-y-6">
        {inspecciones.map((insp, idx) => {
          const zona = insp.zona_id ? zonasById[insp.zona_id] : undefined;
          const areaM2 = Number(zona?.superficie_estimada_m2) || 40;
          const res = calcularPaqueteZona(insp, areaM2, tarifario);
          const accesos = getEffectiveAccesos(insp);
          const itemsCivil = insp.items_civil || [];
          const itemsMet = insp.items_metalicos || [];

          return (
            <div
              key={insp.id}
              className="bg-slate-900 print:bg-white print:text-black border border-slate-800 print:border-slate-300 rounded-2xl p-5 space-y-4 break-inside-avoid"
            >
              {/* Encabezado de Ficha */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 print:border-slate-300 pb-3">
                <div>
                  <span className="text-[11px] font-mono font-bold text-amber-400 print:text-amber-700 uppercase">
                    Frente #{idx + 1} · {zona?.area_planta || 'Planta Industrial'}
                  </span>
                  <h4 className="text-lg font-black text-white print:text-black">
                    {insp.zona_codigo || zona?.codigo || insp.elemento_id} — {zona?.nombre || 'Elemento Puntual'}
                  </h4>
                  <div className="text-xs text-slate-400 print:text-slate-600 flex flex-wrap gap-3 mt-1">
                    <span>Superficie Zona: <strong>{areaM2} m²</strong></span>
                    <span>·</span>
                    <span>Cómputo Pintura: <strong>{res.superficieComputadaM2} m²</strong></span>
                    <span>·</span>
                    <span>Severidad: <strong>{insp.grado_corrosion} ({insp.porcentaje_afectado}%)</strong></span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-black border ${
                      res.clasificacionZona === 'CRITICO'
                        ? 'bg-red-950/60 border-red-500 text-red-300 print:bg-red-100 print:text-red-800'
                        : 'bg-emerald-950/60 border-emerald-500 text-emerald-300 print:bg-emerald-100 print:text-emerald-800'
                    }`}
                  >
                    {res.clasificacionZona}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400 print:text-slate-600">
                    Estrategia: {res.estrategia}
                  </span>
                </div>
              </div>

              {/* Logística de Acceso */}
              <div className="bg-slate-950 print:bg-slate-50 border border-slate-800 print:border-slate-300 rounded-xl p-3 space-y-1.5 text-xs">
                <strong className="text-amber-400 print:text-amber-800 uppercase text-[11px] block">
                  Logística de Acceso y Andamios
                </strong>
                {accesos.map((a, aIdx) => (
                  <div key={a.id || aIdx} className="text-slate-200 print:text-slate-800">
                    • <strong>{a.tipo}</strong>:{' '}
                    {a.tipo === 'ANDAMIO_FIJO' &&
                      `${a.volumen_m3 || 0} m³ (Rango ${a.rango_altura || '0_6M'}, ${a.dias_uso || 5} días est., complejidad ${a.complejidad || 'NORMAL'})`}
                    {a.tipo === 'TORRE_MOVIL' &&
                      `${a.cantidad_torres || 1} torre(s), h=${a.altura_trabajo_m || 6}m, ${a.dias_uso || 3} días`}
                    {a.tipo === 'PLATAFORMA_ELEVADORA' &&
                      `PEM ${a.subtipo_pem || 'BRAZO_ARTICULADO'} ${a.altura_trabajo_m || 14}m, ${a.dias_uso || 2} jornadas`}
                    {a.tipo === 'ACCESO_DIRECTO' && 'Acceso directo sin andamio.'}
                  </div>
                ))}
                <p className="text-[11px] italic text-slate-400 print:text-slate-600 pt-1">
                  Cláusula estándar: &quot;El alquiler diario cesa en la fecha de Liberación de Andamio emitida por Supervisión.&quot;
                </p>
              </div>

              {/* Secuencia Obligatoria de Ejecución */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                {/* Fase 1: Civil */}
                <div className="bg-slate-950 print:bg-slate-50 border border-slate-800 print:border-slate-300 rounded-xl p-3 space-y-1.5">
                  <strong className="text-sky-400 print:text-sky-800 uppercase text-[11px] block">
                    Fase 1 — Civil y Hormigón
                  </strong>
                  {itemsCivil.length === 0 && !insp.evaluacion_civil?.aplica ? (
                    <span className="text-slate-500">Sin intervención civil requerida.</span>
                  ) : (
                    <>
                      {itemsCivil.map((ic) => (
                        <div key={ic.id} className="text-slate-200 print:text-slate-800">
                          • {ic.descripcion}: <strong>{ic.cantidad} {ic.unidad}</strong> ({ic.clasificacion})
                        </div>
                      ))}
                      {insp.evaluacion_civil?.items?.map((ev, eIdx) => (
                        <div key={eIdx} className="text-[11px] text-slate-400 print:text-slate-600">
                          Patología {ev.elemento_civil}: {ev.patologias.join(', ')}
                        </div>
                      ))}
                    </>
                  )}
                </div>

                {/* Fase 2: Calderería */}
                <div className="bg-slate-950 print:bg-slate-50 border border-slate-800 print:border-slate-300 rounded-xl p-3 space-y-1.5">
                  <strong className="text-amber-400 print:text-amber-800 uppercase text-[11px] block">
                    Fase 2 — Calderería y Metálico
                  </strong>
                  {itemsMet.length === 0 ? (
                    <span className="text-slate-500">
                      {insp.requiere_reemplazo
                        ? `Pendiente BOM (${insp.nota_bom_campo || 'ver nota'})`
                        : 'Sin reemplazos metálicos.'}
                    </span>
                  ) : (
                    itemsMet.map((im) => (
                      <div key={im.id} className="text-slate-200 print:text-slate-800">
                        • <strong>{im.codigo_catalogo}</strong> ({im.accion}): {im.peso_total_kg} kg teórico · Prov: <strong>{im.provision}</strong>
                      </div>
                    ))
                  )}
                </div>

                {/* Fase 3: Pintura + QA/QC */}
                <div className="bg-slate-950 print:bg-slate-50 border border-slate-800 print:border-slate-300 rounded-xl p-3 space-y-1.5">
                  <strong className="text-emerald-400 print:text-emerald-800 uppercase text-[11px] block">
                    Fase 3 — Preparación y Pintura
                  </strong>
                  <div>Preparación: <strong>{res.gradoPreparacion.replace(/_/g, ' ')}</strong></div>
                  <div>Sistema: <strong>{insp.clasificacion_recubrimiento}</strong></div>
                  <div>Superficie: <strong>{res.superficieComputadaM2} m²</strong></div>
                  <div className="pt-1 border-t border-slate-800 print:border-slate-300 text-[10px] text-slate-400 print:text-slate-700">
                    <strong>Hitos QA/QC:</strong> 30% Preparación · 40% Imprimación y DFT · 30% Terminación
                  </div>
                </div>
              </div>

              {/* Evidencia y Costos (si mostrarPrecios) */}
              {mostrarPrecios && (
                <div className="bg-emerald-950/30 print:bg-emerald-50 border border-emerald-700/50 rounded-xl p-3 text-xs flex flex-wrap justify-between gap-2 font-mono">
                  <span>Civil: {res.costos.civil.toLocaleString()}</span>
                  <span>Calderería MO: {res.costos.caldereriaMO.toLocaleString()}</span>
                  <span>Mat. Contratista: {res.costos.materialMetalicoContratista.toLocaleString()}</span>
                  <span>Pintura: {res.costos.pintura.toLocaleString()}</span>
                  <span>Accesos: {res.costos.accesos.toLocaleString()}</span>
                  <strong className="text-emerald-400 print:text-emerald-800">
                    Total Contratista: {res.costos.totalContratista.toLocaleString()} {tarifario.moneda}
                  </strong>
                </div>
              )}

              {(insp.observaciones || (insp.fotos && insp.fotos.length > 0)) && (
                <div className="pt-2 border-t border-slate-800 print:border-slate-300 space-y-2">
                  {insp.observaciones && (
                    <p className="text-xs text-slate-300 print:text-slate-700">
                      <strong>Observaciones / Seguridad:</strong> {insp.observaciones}
                    </p>
                  )}
                  {insp.fotos && insp.fotos.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {insp.fotos.slice(0, 4).map((f, fIdx) => {
                        const src = f.storage_url || f.thumbnail_data_url;
                        return src ? (
                          <img
                            key={f.id || fIdx}
                            src={src}
                            alt={`Evidencia ${fIdx + 1}`}
                            className="w-20 h-20 object-cover rounded-lg border border-slate-700"
                          />
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
