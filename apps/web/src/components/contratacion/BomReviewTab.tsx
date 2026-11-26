'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { CheckCircle2, Image as ImageIcon, Plus, Trash2, ZoomIn, AlertTriangle } from 'lucide-react';
import { Inspeccion, ZonaInspeccion } from '../../types';
import {
  AccesoZonaItem,
  CatalogoMaterialItem,
  ClasificacionAlcance,
  EstrategiaIntervencion,
  GradoPreparacion,
  ItemCivilComputo,
  ItemMetalicoBOM
} from '../../types/computo';
import { MetalicoBOMEditor } from '../campo/MetalicoBOMEditor';
import { AccesoZonaManager } from '../campo/AccesoZonaManager';
import { getEffectiveAccesos } from '../../lib/computoEngine';

interface BomReviewTabProps {
  inspecciones: Inspeccion[];
  zonasById: Record<string, ZonaInspeccion>;
  catalogo: CatalogoMaterialItem[];
  onInspectionUpdated: (updated: Inspeccion) => void;
}

type BomFilter = 'PENDIENTES' | 'CON_CALDERERIA_CIVIL' | 'COMPLETAS' | 'TODAS';

export function BomReviewTab({
  inspecciones,
  zonasById,
  catalogo,
  onInspectionUpdated
}: BomReviewTabProps) {
  const [filter, setFilter] = useState<BomFilter>('PENDIENTES');
  const [selectedId, setSelectedId] = useState<string>('');
  const [zoomPhotoUrl, setZoomPhotoUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return inspecciones.filter((insp) => {
      const hasCaldOrCivil =
        insp.requiere_reemplazo ||
        insp.estado_bom === 'PENDIENTE_REVISION' ||
        (insp.items_metalicos?.length || 0) > 0 ||
        (insp.items_civil?.length || 0) > 0 ||
        insp.evaluacion_civil?.aplica;

      if (filter === 'PENDIENTES') {
        return insp.estado_bom === 'PENDIENTE_REVISION' || (insp.requiere_reemplazo && insp.estado_bom !== 'COMPLETO');
      }
      if (filter === 'CON_CALDERERIA_CIVIL') return hasCaldOrCivil;
      if (filter === 'COMPLETAS') return insp.estado_bom === 'COMPLETO';
      return true;
    });
  }, [inspecciones, filter]);

  const activeInsp = useMemo(
    () => filtered.find((i) => i.id === selectedId) || filtered[0] || null,
    [filtered, selectedId]
  );

  const [estrategia, setEstrategia] = useState<EstrategiaIntervencion>('INTEGRAL_100');
  const [gradoPrep, setGradoPrep] = useState<GradoPreparacion>('ST2_ST3');
  const [clasificacion, setClasificacion] = useState<ClasificacionAlcance>('CRITICO');
  const [superficieM2, setSuperficieM2] = useState<number>(40);
  const [accesos, setAccesos] = useState<AccesoZonaItem[]>([]);
  const [itemsMetalicos, setItemsMetalicos] = useState<ItemMetalicoBOM[]>([]);
  const [itemsCivil, setItemsCivil] = useState<ItemCivilComputo[]>([]);

  useEffect(() => {
    if (!activeInsp) return;
    const zona = activeInsp.zona_id ? zonasById[activeInsp.zona_id] : undefined;
    setEstrategia(activeInsp.estrategia_intervencion || 'INTEGRAL_100');
    setGradoPrep(activeInsp.grado_preparacion || 'ST2_ST3');
    setClasificacion(activeInsp.clasificacion_alcance || 'CRITICO');
    setSuperficieM2(
      activeInsp.superficie_computada_m2 ?? (Number(zona?.superficie_estimada_m2) || 40)
    );
    setAccesos(getEffectiveAccesos(activeInsp));
    setItemsMetalicos(activeInsp.items_metalicos || []);
    setItemsCivil(activeInsp.items_civil || []);
    setSaveMsg(null);
  }, [activeInsp, zonasById]);

  const handleAddCivil = (tipo: ItemCivilComputo['tipo']) => {
    const labelMap: Record<ItemCivilComputo['tipo'], { desc: string; unit: ItemCivilComputo['unidad'] }> = {
      BACHEO_MORTERO_DM3: { desc: 'Bacheo con mortero estructural', unit: 'dm3' },
      SELLADO_JUNTA_ML: { desc: 'Sellado de junta de dilatación', unit: 'ml' },
      FISURA_INYECCION_ML: { desc: 'Inyección / sellado de fisura', unit: 'ml' },
      REVESTIMIENTO_M2: { desc: 'Revestimiento epoxi / cementicio', unit: 'm2' }
    };
    const meta = labelMap[tipo];
    setItemsCivil((prev) => [
      ...prev,
      {
        id: `civ_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        tipo,
        descripcion: meta.desc,
        unidad: meta.unit,
        cantidad: tipo === 'BACHEO_MORTERO_DM3' ? 25 : 5,
        clasificacion
      }
    ]);
  };

  const handleSaveBOM = async () => {
    if (!activeInsp) return;
    setIsSaving(true);
    setSaveMsg(null);
    try {
      const payload = {
        estrategia_intervencion: estrategia,
        grado_preparacion: gradoPrep,
        clasificacion_alcance: clasificacion,
        superficie_computada_m2: superficieM2,
        accesos,
        items_metalicos: itemsMetalicos,
        items_civil: itemsCivil,
        estado_bom: 'COMPLETO' as const
      };
      const res = await fetch(`/api/inspections/${encodeURIComponent(activeInsp.id)}/computo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSaveMsg(`Error: ${json.error || 'No se pudo guardar en Neon'}`);
      } else {
        onInspectionUpdated({ ...activeInsp, ...payload });
        setSaveMsg('✅ BOM revisado y guardado en Neon.');
      }
    } catch (e: any) {
      setSaveMsg(`Error de red: ${e?.message || 'desconocido'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filtros rápidos */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 border border-slate-800 rounded-xl p-3">
        <div className="flex flex-wrap gap-2">
          {([
            { id: 'PENDIENTES', label: '🟡 Pendientes de BOM' },
            { id: 'CON_CALDERERIA_CIVIL', label: 'Todas con Calderería / Civil' },
            { id: 'COMPLETAS', label: '🟢 Completas' },
            { id: 'TODAS', label: 'Todas las Inspecciones' }
          ] as { id: BomFilter; label: string }[]).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                filter === f.id
                  ? 'bg-amber-500 text-black border-amber-400'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-xs font-mono text-slate-400">
          {filtered.length} registro(s)
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400 text-sm">
          No hay registros en este filtro. Probá cambiar a &quot;Todas las Inspecciones&quot;.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Selector lateral / Lista + Evidencia */}
          <div className="lg:col-span-5 space-y-3">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2 max-h-56 overflow-y-auto">
              <span className="text-[11px] font-bold text-slate-400 uppercase block">
                Seleccionar Zona / Hallazgo ({filtered.length})
              </span>
              {filtered.map((insp) => {
                const zona = insp.zona_id ? zonasById[insp.zona_id] : undefined;
                const isSel = activeInsp?.id === insp.id;
                return (
                  <button
                    key={insp.id}
                    type="button"
                    onClick={() => setSelectedId(insp.id)}
                    className={`w-full text-left p-2.5 rounded-lg border text-xs transition flex items-center justify-between gap-2 ${
                      isSel
                        ? 'bg-amber-500/15 border-amber-500 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="font-mono font-bold text-amber-400 block truncate">
                        {insp.zona_codigo || zona?.codigo || insp.elemento_id}
                      </span>
                      <span className="text-[11px] text-slate-400 truncate block">
                        {zona?.nombre || insp.elemento_id} · {insp.grado_corrosion} · {insp.porcentaje_afectado}%
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${
                        insp.estado_bom === 'COMPLETO'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                          : insp.estado_bom === 'PENDIENTE_REVISION' || insp.requiere_reemplazo
                          ? 'bg-amber-950 text-amber-300 border border-amber-700'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {insp.estado_bom || 'NO_APLICA'}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Columna Evidencia de Campo */}
            {activeInsp && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div>
                    <span className="text-xs font-bold text-white uppercase">Evidencia de Campo</span>
                    <span className="text-[11px] text-slate-400 block">
                      Inspector: {activeInsp.inspector_nombre || 'Campo'} · {activeInsp.grado_corrosion} ({activeInsp.porcentaje_afectado}%)
                    </span>
                  </div>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-300">
                    {activeInsp.fotos?.length || 0} fotos
                  </span>
                </div>

                {activeInsp.nota_bom_campo && (
                  <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200">
                    <strong className="block text-[10px] uppercase text-amber-400 mb-0.5">
                      Nota rápida para Ingeniería / BOM:
                    </strong>
                    {activeInsp.nota_bom_campo}
                  </div>
                )}

                {activeInsp.observaciones && (
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300">
                    <strong className="block text-[10px] uppercase text-slate-500 mb-0.5">
                      Observaciones de recorrido:
                    </strong>
                    {activeInsp.observaciones}
                  </div>
                )}

                {activeInsp.evaluacion_civil?.aplica && (
                  <div className="p-2.5 rounded-lg bg-sky-950/30 border border-sky-800/50 text-xs text-sky-200 space-y-1">
                    <strong className="block text-[10px] uppercase text-sky-400">
                      Evaluación Civil Reportada:
                    </strong>
                    {activeInsp.evaluacion_civil.items.map((c, idx) => (
                      <div key={idx} className="text-[11px]">
                        • <strong>{c.elemento_civil}</strong> ({c.estado}): {c.patologias.join(', ')} {c.observacion ? `— ${c.observacion}` : ''}
                      </div>
                    ))}
                  </div>
                )}

                {(!activeInsp.fotos || activeInsp.fotos.length === 0) ? (
                  <div className="p-6 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                    <ImageIcon className="w-6 h-6 mx-auto mb-1 opacity-50" />
                    Sin fotos adjuntas en este registro.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {activeInsp.fotos.map((f, idx) => {
                      const src = f.storage_url || f.thumbnail_data_url;
                      return (
                        <div
                          key={f.id || idx}
                          className="group relative bg-slate-950 border border-slate-800 rounded-xl overflow-hidden cursor-pointer"
                          onClick={() => src && setZoomPhotoUrl(src)}
                        >
                          {src && (
                            <img
                              src={src}
                              alt={`Foto ${idx + 1}`}
                              className="w-full h-36 object-cover group-hover:scale-105 transition"
                            />
                          )}
                          <div className="absolute top-1.5 right-1.5 p-1 rounded bg-black/70 text-white opacity-80">
                            <ZoomIn className="w-3.5 h-3.5" />
                          </div>
                          {f.comentario && (
                            <div className="p-1.5 text-[10px] text-slate-300 bg-slate-950/90 truncate">
                              {f.comentario}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Columna Derecha: Editor de Ingeniería */}
          {activeInsp && (
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-black text-white">
                    Ingeniería de Detalle y BOM — {activeInsp.zona_codigo || activeInsp.elemento_id}
                  </h3>
                  <span className="text-xs text-slate-400">
                    Definí perfiles teóricos (kg), cómputo civil, pintura y accesos.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setClasificacion((p) => (p === 'CRITICO' ? 'SINERGIA' : 'CRITICO'))}
                  className={`px-3 py-1.5 rounded-full text-xs font-black border ${
                    clasificacion === 'CRITICO'
                      ? 'bg-red-950/60 border-red-500 text-red-300'
                      : 'bg-emerald-950/60 border-emerald-500 text-emerald-300'
                  }`}
                >
                  {clasificacion === 'CRITICO' ? '🔴 CRITICO' : '🟢 SINERGIA'}
                </button>
              </div>

              {/* 1. Calderería / Metálico BOM */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                  1. BOM Metálico / Calderería (Peso Teórico de Catálogo)
                </h4>
                <MetalicoBOMEditor
                  items={itemsMetalicos}
                  catalogo={catalogo}
                  onChange={setItemsMetalicos}
                  defaultClasificacion={clasificacion}
                />
              </div>

              {/* 2. Cómputo Civil */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider">
                    2. Cómputo Civil y Hormigón
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { tipo: 'BACHEO_MORTERO_DM3', label: '+ Mortero (dm³)' },
                        { tipo: 'SELLADO_JUNTA_ML', label: '+ Junta (ml)' },
                        { tipo: 'FISURA_INYECCION_ML', label: '+ Fisura (ml)' },
                        { tipo: 'REVESTIMIENTO_M2', label: '+ Revest. (m²)' }
                      ] as const
                    ).map((btn) => (
                      <button
                        key={btn.tipo}
                        type="button"
                        onClick={() => handleAddCivil(btn.tipo)}
                        className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 text-[11px] font-bold flex items-center space-x-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{btn.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {itemsCivil.length > 0 && (
                  <div className="space-y-2">
                    {itemsCivil.map((ic) => (
                      <div
                        key={ic.id}
                        className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center text-xs"
                      >
                        <input
                          type="text"
                          value={ic.descripcion}
                          onChange={(e) =>
                            setItemsCivil((prev) =>
                              prev.map((x) => (x.id === ic.id ? { ...x, descripcion: e.target.value } : x))
                            )
                          }
                          className="sm:col-span-5 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white"
                        />
                        <div className="sm:col-span-3 flex items-center space-x-1">
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            value={ic.cantidad}
                            onChange={(e) =>
                              setItemsCivil((prev) =>
                                prev.map((x) =>
                                  x.id === ic.id ? { ...x, cantidad: Math.max(0, Number(e.target.value)) } : x
                                )
                              )
                            }
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono"
                          />
                          <span className="font-mono text-slate-400">{ic.unidad}</span>
                        </div>
                        <select
                          value={ic.clasificacion}
                          onChange={(e) =>
                            setItemsCivil((prev) =>
                              prev.map((x) =>
                                x.id === ic.id
                                  ? { ...x, clasificacion: e.target.value as ClasificacionAlcance }
                                  : x
                              )
                            )
                          }
                          className="sm:col-span-3 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white"
                        >
                          <option value="CRITICO">CRITICO</option>
                          <option value="SINERGIA">SINERGIA</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => setItemsCivil((prev) => prev.filter((x) => x.id !== ic.id))}
                          className="sm:col-span-1 p-1 text-slate-500 hover:text-red-400 justify-self-end"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. Pintura y Preparación */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800 text-xs">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Estrategia Pintura</label>
                  <select
                    value={estrategia}
                    onChange={(e) => setEstrategia(e.target.value as EstrategiaIntervencion)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  >
                    <option value="PARCHEO">Parcheo (Solape 1.25)</option>
                    <option value="OVERCOAT">Overcoat (Impr. + 100% Term.)</option>
                    <option value="INTEGRAL_100">Integral 100% (Sinergia)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Preparación Superficie</label>
                  <select
                    value={gradoPrep}
                    onChange={(e) => setGradoPrep(e.target.value as GradoPreparacion)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  >
                    <option value="ST2_ST3">St 2 / St 3 (Mecánica)</option>
                    <option value="SA_2_5">Sa 2½ (Granallado)</option>
                    <option value="UHP_HIDROLAVADO">UHP (Hidrolavado)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Superficie Computada (m²)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={superficieM2}
                    onChange={(e) => setSuperficieM2(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  />
                </div>
              </div>

              {/* 4. Accesos */}
              <div className="pt-2 border-t border-slate-800">
                <AccesoZonaManager accesos={accesos} onChange={setAccesos} compact />
              </div>

              {saveMsg && (
                <div
                  className={`p-2.5 rounded-lg text-xs font-bold flex items-center space-x-2 ${
                    saveMsg.startsWith('✅')
                      ? 'bg-emerald-950/50 border border-emerald-500/50 text-emerald-300'
                      : 'bg-red-950/50 border border-red-500/50 text-red-300'
                  }`}
                >
                  {saveMsg.startsWith('✅') ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <AlertTriangle className="w-4 h-4" />
                  )}
                  <span>{saveMsg}</span>
                </div>
              )}

              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveBOM}
                className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-black text-xs flex items-center justify-center space-x-2 transition"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSaving ? 'Guardando en Neon...' : '✅ Marcar BOM Revisado y Guardar en Neon'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal Zoom Foto */}
      {zoomPhotoUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setZoomPhotoUrl(null)}
        >
          <img
            src={zoomPhotoUrl}
            alt="Zoom evidencia"
            className="max-w-full max-h-[90vh] rounded-xl object-contain"
          />
        </div>
      )}
    </div>
  );
}
