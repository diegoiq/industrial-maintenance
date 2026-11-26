'use client';

import React from 'react';
import { Plus, Trash2, HardHat } from 'lucide-react';
import { AccesoZonaItem, TipoAcceso } from '../../types/computo';
import { calcularRangoAltura } from '../../lib/computoEngine';

interface AccesoZonaManagerProps {
  accesos: AccesoZonaItem[];
  onChange: (next: AccesoZonaItem[]) => void;
  compact?: boolean;
}

const TIPO_LABELS: Record<TipoAcceso, { label: string; short: string }> = {
  ANDAMIO_FIJO: { label: 'Andamio Fijo Tubular', short: 'Andamio Fijo' },
  TORRE_MOVIL: { label: 'Torre Móvil Rodante', short: 'Torre Móvil' },
  PLATAFORMA_ELEVADORA: { label: 'Plataforma Elevadora (PEM)', short: 'PEM / Manlift' },
  ACCESO_DIRECTO: { label: 'Acceso Directo (Sin costo)', short: 'Directo' }
};

const RANGO_BADGE: Record<string, string> = {
  '0_6M': '0–6 m',
  '6_12M': '6–12 m',
  MAS_12M: '> 12 m'
};

export function AccesoZonaManager({ accesos, onChange, compact = false }: AccesoZonaManagerProps) {
  const list: AccesoZonaItem[] =
    accesos.length > 0 ? accesos : [{ id: `acc_${Date.now()}`, tipo: 'ACCESO_DIRECTO' }];

  const updateItem = (id: string, patch: Partial<AccesoZonaItem>) => {
    onChange(
      list.map((item) => {
        if (item.id !== id) return item;
        const merged = { ...item, ...patch };
        if (merged.tipo === 'ANDAMIO_FIJO') {
          const alto = merged.alto_m ?? 4;
          merged.rango_altura = calcularRangoAltura(alto);
          if (!merged.volumen_manual) {
            const l = merged.largo_m ?? 3;
            const a = merged.ancho_m ?? 2;
            merged.volumen_m3 = Math.round(l * a * alto * 10) / 10;
          }
        }
        return merged;
      })
    );
  };

  const handleChangeTipo = (id: string, tipo: TipoAcceso) => {
    if (tipo === 'ANDAMIO_FIJO') {
      updateItem(id, {
        tipo,
        largo_m: 3,
        ancho_m: 2,
        alto_m: 4,
        volumen_m3: 24,
        volumen_manual: false,
        rango_altura: '0_6M',
        complejidad: 'NORMAL',
        dias_uso: 5
      });
    } else if (tipo === 'TORRE_MOVIL') {
      updateItem(id, {
        tipo,
        altura_trabajo_m: 6,
        cantidad_torres: 1,
        dias_uso: 3,
        traslados_estimados: 2
      });
    } else if (tipo === 'PLATAFORMA_ELEVADORA') {
      updateItem(id, {
        tipo,
        subtipo_pem: 'BRAZO_ARTICULADO',
        altura_trabajo_m: 14,
        dias_uso: 2
      });
    } else {
      updateItem(id, { tipo });
    }
  };

  const handleAddAcceso = () => {
    onChange([
      ...list,
      {
        id: `acc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        tipo: 'ANDAMIO_FIJO',
        largo_m: 3,
        ancho_m: 2,
        alto_m: 4,
        volumen_m3: 24,
        volumen_manual: false,
        rango_altura: '0_6M',
        complejidad: 'NORMAL',
        dias_uso: 5
      }
    ]);
  };

  const handleRemoveAcceso = (id: string) => {
    const filtered = list.filter((i) => i.id !== id);
    onChange(filtered.length > 0 ? filtered : [{ id: `acc_${Date.now()}`, tipo: 'ACCESO_DIRECTO' }]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
          <HardHat className="w-4 h-4 text-amber-400" />
          <span>Accesos / Andamios del Frente ({list.length})</span>
        </span>
        <button
          type="button"
          onClick={handleAddAcceso}
          className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-[11px] font-bold flex items-center space-x-1"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Agregar otro acceso</span>
        </button>
      </div>

      {list.map((acc, idx) => {
        const l = acc.largo_m ?? 3;
        const a = acc.ancho_m ?? 2;
        const h = acc.alto_m ?? 4;
        const rango = acc.rango_altura || calcularRangoAltura(h);

        return (
          <div
            key={acc.id}
            className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-3 text-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-mono font-bold text-slate-400">
                Acceso #{idx + 1}
              </span>
              {list.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveAcceso(acc.id)}
                  className="p-1 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/30"
                  title="Quitar acceso"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Selector de tipo táctil */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {(Object.keys(TIPO_LABELS) as TipoAcceso[]).map((t) => {
                const active = acc.tipo === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleChangeTipo(acc.id, t)}
                    className={`min-h-[42px] px-2 py-1.5 rounded-lg border text-[11px] font-bold transition ${
                      active
                        ? 'bg-amber-500 text-black border-amber-400'
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    {compact ? TIPO_LABELS[t].short : TIPO_LABELS[t].label}
                  </button>
                );
              })}
            </div>

            {acc.tipo === 'ANDAMIO_FIJO' && (
              <div className="space-y-2.5 pt-1">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'largo_m' as const, label: 'Largo (m)', val: l },
                    { key: 'ancho_m' as const, label: 'Ancho (m)', val: a },
                    { key: 'alto_m' as const, label: 'Alto (m)', val: h }
                  ].map((dim) => (
                    <div key={dim.key} className="bg-slate-900 border border-slate-800 rounded-xl p-2 text-center">
                      <span className="text-[10px] text-slate-400 block mb-1">{dim.label}</span>
                      <div className="flex items-center justify-between gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const nextVal = Math.max(0.5, Math.round((dim.val - 0.5) * 10) / 10);
                            updateItem(acc.id, { [dim.key]: nextVal, volumen_manual: false });
                          }}
                          className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 font-black text-sm"
                        >
                          -
                        </button>
                        <span className="font-mono font-bold text-xs text-white">{dim.val}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const nextVal = Math.round((dim.val + 0.5) * 10) / 10;
                            updateItem(acc.id, { [dim.key]: nextVal, volumen_manual: false });
                          }}
                          className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 font-black text-sm"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-slate-400">Volumen (m³)</span>
                      <button
                        type="button"
                        onClick={() => updateItem(acc.id, { volumen_manual: !acc.volumen_manual })}
                        className="text-[9px] font-mono text-emerald-400 underline"
                      >
                        {acc.volumen_manual ? 'Manual' : 'Auto'}
                      </button>
                    </div>
                    <input
                      type="number"
                      step="0.5"
                      min={0}
                      value={acc.volumen_m3 ?? Math.round(l * a * h * 10) / 10}
                      onChange={(e) =>
                        updateItem(acc.id, {
                          volumen_manual: true,
                          volumen_m3: Math.max(0, Number(e.target.value))
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-mono"
                    />
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1">Rango Altura</span>
                    <div className="px-2 py-1.5 rounded-lg bg-sky-950/50 border border-sky-700/50 text-sky-300 font-mono font-bold text-center">
                      {RANGO_BADGE[rango] || rango}
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1">Días estimados</span>
                    <input
                      type="number"
                      min={1}
                      max={180}
                      value={acc.dias_uso ?? 5}
                      onChange={(e) =>
                        updateItem(acc.id, { dias_uso: Math.max(1, Number(e.target.value)) })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-mono"
                    />
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1">Interferencia</span>
                    <button
                      type="button"
                      onClick={() =>
                        updateItem(acc.id, {
                          complejidad:
                            acc.complejidad === 'ALTA_INTERFERENCIA' ? 'NORMAL' : 'ALTA_INTERFERENCIA'
                        })
                      }
                      className={`w-full py-1.5 px-2 rounded-lg border font-bold text-[11px] ${
                        acc.complejidad === 'ALTA_INTERFERENCIA'
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                          : 'bg-slate-900 border-slate-700 text-slate-300'
                      }`}
                    >
                      {acc.complejidad === 'ALTA_INTERFERENCIA' ? 'Alta (+25%)' : 'Normal'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {acc.tipo === 'TORRE_MOVIL' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <div>
                  <span className="text-[10px] text-slate-400 block mb-1">Altura trabajo (m)</span>
                  <input
                    type="number"
                    min={2}
                    step={0.5}
                    value={acc.altura_trabajo_m ?? 6}
                    onChange={(e) =>
                      updateItem(acc.id, { altura_trabajo_m: Math.max(2, Number(e.target.value)) })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block mb-1">Cant. torres</span>
                  <input
                    type="number"
                    min={1}
                    value={acc.cantidad_torres ?? 1}
                    onChange={(e) =>
                      updateItem(acc.id, { cantidad_torres: Math.max(1, Number(e.target.value)) })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block mb-1">Días de uso</span>
                  <input
                    type="number"
                    min={1}
                    value={acc.dias_uso ?? 3}
                    onChange={(e) =>
                      updateItem(acc.id, { dias_uso: Math.max(1, Number(e.target.value)) })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block mb-1">Traslados est.</span>
                  <input
                    type="number"
                    min={0}
                    value={acc.traslados_estimados ?? 2}
                    onChange={(e) =>
                      updateItem(acc.id, { traslados_estimados: Math.max(0, Number(e.target.value)) })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-mono"
                  />
                </div>
              </div>
            )}

            {acc.tipo === 'PLATAFORMA_ELEVADORA' && (
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  {(['TIJERA', 'BRAZO_ARTICULADO'] as const).map((sub) => (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => updateItem(acc.id, { subtipo_pem: sub })}
                      className={`py-2 px-3 rounded-lg border font-bold text-xs ${
                        (acc.subtipo_pem || 'BRAZO_ARTICULADO') === sub
                          ? 'bg-sky-500 text-black border-sky-400'
                          : 'bg-slate-900 text-slate-300 border-slate-700'
                      }`}
                    >
                      {sub === 'TIJERA' ? 'PEM Tijera' : 'Brazo Articulado'}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {[10, 12, 14, 18, 22].map((alt) => (
                      <button
                        key={alt}
                        type="button"
                        onClick={() => updateItem(acc.id, { altura_trabajo_m: alt })}
                        className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold border ${
                          (acc.altura_trabajo_m ?? 14) === alt
                            ? 'bg-amber-500 text-black border-amber-400'
                            : 'bg-slate-900 text-slate-300 border-slate-800'
                        }`}
                      >
                        {alt}m
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] text-slate-400">Jornadas:</span>
                    <input
                      type="number"
                      min={1}
                      value={acc.dias_uso ?? 2}
                      onChange={(e) =>
                        updateItem(acc.id, { dias_uso: Math.max(1, Number(e.target.value)) })
                      }
                      className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {acc.tipo === 'ACCESO_DIRECTO' && (
              <div className="text-[11px] text-emerald-400 bg-emerald-950/30 border border-emerald-800/40 rounded-lg px-2.5 py-1.5">
                ✓ Acceso directo desde nivel de piso o pasarela existente (sin costo adicional de acceso).
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
