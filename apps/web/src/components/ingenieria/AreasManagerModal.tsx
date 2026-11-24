'use client';

import React, { useState, useEffect } from 'react';
import { X, Building2, Plus, Check, Layers, Trash2, MapPin } from 'lucide-react';
import { Area, ZonaInspeccion } from '../../types';
import { db } from '../../lib/db';
import { pushFastSyncToCloud, deleteFromCloud, markLocalEntityPendingPush, markLocalMutation } from '../../lib/cloudSync';

interface AreasManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  areas: Area[];
  zonas: ZonaInspeccion[];
  currentPlanoId: string;
  onUpdated: () => Promise<void> | void;
  onStartDrawZoneInArea: (areaNombre: string) => void;
  onOpenCreateZoneInArea: (areaNombre: string) => void;
}

export const AreasManagerModal: React.FC<AreasManagerModalProps> = ({
  isOpen,
  onClose,
  areas,
  zonas,
  currentPlanoId,
  onUpdated,
  onStartDrawZoneInArea,
  onOpenCreateZoneInArea
}) => {
  const [selectedAreaId, setSelectedAreaId] = useState<string>('');
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [ubicacionErp, setUbicacionErp] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (!selectedAreaId && areas.length > 0) {
        setSelectedAreaId(areas[0].id);
      }
      setNotice(null);
    }
  }, [isOpen, areas, selectedAreaId]);

  if (!isOpen) return null;

  const selectedArea = areas.find(a => a.id === selectedAreaId) || areas[0];

  const handleCreateArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigo.trim() || !nombre.trim()) return;
    setIsSaving(true);
    try {
      const nuevaArea: Area = {
        id: `area_${Date.now()}`,
        codigo: codigo.trim().toUpperCase(),
        nombre: nombre.trim(),
        ubicacion_tecnica_erp: ubicacionErp.trim() || undefined,
        descripcion: descripcion.trim() || undefined
      };
      markLocalMutation();
      await db.areas.put(nuevaArea);
      setSelectedAreaId(nuevaArea.id);
      setCodigo('');
      setNombre('');
      setUbicacionErp('');
      setDescripcion('');
      await onUpdated();
      pushFastSyncToCloud({ includePlanImages: false, authoritativeZonas: false, authoritativeHitos: false }).catch(() => null);
      setNotice(`Área "${nuevaArea.nombre}" creada. Ahora podés asignar zonas existentes o trazar nuevas.`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleZoneInArea = async (zona: ZonaInspeccion, areaNombre: string) => {
    const isCurrentlyInArea = (zona.area_planta || '').toLowerCase() === areaNombre.toLowerCase();
    const updated: ZonaInspeccion = {
      ...zona,
      area_planta: isCurrentlyInArea ? undefined : areaNombre
    };
    markLocalEntityPendingPush('zona', updated.id);
    await db.zonas.put(updated);
    await onUpdated();
    pushFastSyncToCloud({ authoritativeZonas: true }).catch(() => null);
  };

  const handleDeleteArea = async (area: Area) => {
    if (!window.confirm(`¿Eliminar el área "${area.codigo} - ${area.nombre}"? Las zonas asociadas pasarán a quedar sin área asignada.`)) {
      return;
    }
    const zonasEnArea = zonas.filter(z => (z.area_planta || '').toLowerCase() === area.nombre.toLowerCase());
    for (const z of zonasEnArea) {
      await db.zonas.put({ ...z, area_planta: undefined });
    }
    await db.areas.delete(area.id);
    await deleteFromCloud('area', area.id).catch(() => null);
    await onUpdated();
    setSelectedAreaId('');
    setNotice(`Área "${area.nombre}" eliminada.`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-4xl bg-slate-900 border-2 border-sky-500/70 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <Building2 className="w-5 h-5 text-sky-400" />
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-wide">
                Gestión de Áreas de Planta y Asignación de Zonas
              </h2>
              <p className="text-[11px] text-slate-400">
                Creá áreas nuevas, asigná zonas ya existentes a elección o establecé nuevas zonas dentro del área.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {notice && (
          <div className="mx-5 mt-3 p-2.5 bg-emerald-950/70 border border-emerald-500/50 rounded-lg text-emerald-200 text-xs flex items-center space-x-2">
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {/* Cuerpo en 2 columnas */}
        <div className="p-5 grid grid-cols-1 md:grid-cols-12 gap-5 overflow-y-auto text-xs">
          {/* Izquierda: Crear Área + Lista de Áreas */}
          <div className="md:col-span-5 space-y-4">
            <form onSubmit={handleCreateArea} className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
              <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider block">
                + Nueva Área de Planta
              </span>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Cód. (131)"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono uppercase"
                  required
                />
                <input
                  type="text"
                  placeholder="Nombre (Ej: Efluentes)"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="col-span-2 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                  required
                />
              </div>
              <input
                type="text"
                placeholder="Ubicación Técnica ERP / SAP (opcional)"
                value={ubicacionErp}
                onChange={(e) => setUbicacionErp(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
              />
              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold rounded-lg flex items-center justify-center space-x-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Crear Área</span>
              </button>
            </form>

            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Áreas Registradas ({areas.length})
              </span>
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {areas.map(a => {
                  const countZonas = zonas.filter(z => (z.area_planta || '').toLowerCase() === a.nombre.toLowerCase()).length;
                  const isSel = selectedArea?.id === a.id;
                  return (
                    <div
                      key={a.id}
                      onClick={() => setSelectedAreaId(a.id)}
                      className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between transition ${
                        isSel
                          ? 'bg-sky-500/15 border-sky-400 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="min-w-0">
                        <span className="font-mono font-bold text-amber-400 text-[11px]">{a.codigo}</span>
                        <span className="font-bold block truncate">{a.nombre}</span>
                        <span className="text-[10px] text-slate-400">{countZonas} zonas asignadas</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDeleteArea(a); }}
                        className="p-1.5 text-slate-500 hover:text-red-400 rounded"
                        title="Eliminar área"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Derecha: Zonas del Área Seleccionada + Crear Nueva Zona dentro del Área */}
          <div className="md:col-span-7 bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-4">
            {!selectedArea ? (
              <p className="text-slate-400 text-center py-10">Creá o seleccioná un área a la izquierda.</p>
            ) : (
              <>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                    <div>
                      <span className="text-[10px] font-mono text-amber-400 uppercase font-bold">
                        Área Seleccionada: {selectedArea.codigo}
                      </span>
                      <h3 className="text-sm font-black text-white">{selectedArea.nombre}</h3>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={!currentPlanoId}
                        onClick={() => {
                          onStartDrawZoneInArea(selectedArea.nombre);
                          onClose();
                        }}
                        className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold rounded-lg text-[11px] flex items-center space-x-1"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        <span>Trazar Nueva Zona en Plano</span>
                      </button>
                      <button
                        type="button"
                        disabled={!currentPlanoId}
                        onClick={() => {
                          onOpenCreateZoneInArea(selectedArea.nombre);
                          onClose();
                        }}
                        className="px-2.5 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-bold rounded-lg text-[11px] flex items-center space-x-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Nueva Zona Rápida</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] font-bold text-slate-300 block mb-2">
                      Incluir / Quitar Zonas ya creadas ({zonas.length} disponibles):
                    </span>
                    {zonas.length === 0 ? (
                      <p className="text-slate-500 italic py-4">No hay zonas creadas todavía en los planos.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                        {zonas.map(z => {
                          const checked = (z.area_planta || '').toLowerCase() === selectedArea.nombre.toLowerCase();
                          return (
                            <label
                              key={z.id}
                              className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 cursor-pointer transition ${
                                checked
                                  ? 'bg-emerald-950/30 border-emerald-500/50 text-white'
                                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                              }`}
                            >
                              <div className="flex items-center space-x-2.5 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => handleToggleZoneInArea(z, selectedArea.nombre)}
                                  className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                                />
                                <div className="min-w-0">
                                  <span className="font-mono font-bold text-amber-400 text-[11px] mr-1.5">
                                    {z.codigo}
                                  </span>
                                  <span className="font-medium truncate">{z.nombre}</span>
                                </div>
                              </div>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800 flex-shrink-0">
                                {z.area_planta || 'Sin área'}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
